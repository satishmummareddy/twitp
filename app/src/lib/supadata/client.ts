/**
 * Supadata API Client
 * Handles YouTube transcript fetching and video discovery.
 * Docs: https://docs.supadata.ai
 */

const BASE_URL = "https://api.supadata.ai/v1";

function getApiKey(): string {
  const key = process.env.SUPADATA_API_KEY;
  if (!key) throw new Error("SUPADATA_API_KEY not set");
  return key;
}

function apiHeaders() {
  return {
    "x-api-key": getApiKey(),
    "Content-Type": "application/json",
  };
}

// --- Types --------------------------------------------------------

export interface TranscriptChunk {
  text: string;
  offset: number;
  duration: number;
  lang: string;
}

export interface TranscriptResult {
  content: string | TranscriptChunk[];
  lang: string;
  availableLangs: string[];
}

export interface TranscriptJobStatus {
  jobId: string;
  status: "queued" | "active" | "completed" | "failed";
  result?: TranscriptResult;
  error?: string;
}

/** Matches the actual Supadata /youtube/video response shape. */
export interface SupadataVideo {
  id: string;
  title: string;
  description: string;
  channel: {
    id: string;
    name: string;
    url: string;
  };
  tags: string[];
  thumbnail: string;
  uploadDate: string; // ISO date
  viewCount: number;
  likeCount: number;
  isLive: boolean;
  duration: number; // seconds
  transcriptLanguages: string[];
}

/** Matches the actual Supadata /youtube/channel response shape. */
export interface ChannelInfo {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
  subscribers: number;
  videos: number;
  views: number;
}

/** Matches the actual Supadata /youtube/channel/videos response shape. */
interface ChannelVideoIdsResult {
  videoIds: string[];
  shortIds: string[];
  liveIds: string[];
}

// --- Transcript Functions -----------------------------------------

/**
 * Fetch transcript for a YouTube video.
 * Returns plain text. For videos > 20min, handles async job polling.
 */
export async function getTranscript(
  videoUrl: string,
  options?: { lang?: string; maxPollMs?: number }
): Promise<{ text: string; lang: string }> {
  const params = new URLSearchParams({
    url: videoUrl,
    text: "true",
  });
  if (options?.lang) params.set("lang", options.lang);

  const response = await fetch(`${BASE_URL}/transcript?${params}`, {
    headers: apiHeaders(),
  });

  if (response.status === 200) {
    const data: TranscriptResult = await response.json();
    return {
      text: typeof data.content === "string" ? data.content : data.content.map((c) => c.text).join(" "),
      lang: data.lang,
    };
  }

  if (response.status === 202) {
    // Async job -- poll for completion
    const { jobId } = await response.json();
    return pollTranscriptJob(jobId, options?.maxPollMs ?? 300_000); // 5min default
  }

  const errorBody = await response.text();
  throw new Error(`Supadata transcript error (${response.status}): ${errorBody}`);
}

/**
 * Poll a transcript job until completion.
 */
async function pollTranscriptJob(
  jobId: string,
  maxMs: number
): Promise<{ text: string; lang: string }> {
  const start = Date.now();
  const pollInterval = 2_000; // 2 seconds

  while (Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, pollInterval));

    const response = await fetch(`${BASE_URL}/transcript/${jobId}`, {
      headers: apiHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Supadata job poll error (${response.status})`);
    }

    const data: TranscriptJobStatus = await response.json();

    if (data.status === "completed" && data.result) {
      const content = data.result.content;
      return {
        text: typeof content === "string" ? content : content.map((c) => c.text).join(" "),
        lang: data.result.lang,
      };
    }

    if (data.status === "failed") {
      throw new Error(`Supadata transcript job failed: ${data.error || "unknown"}`);
    }
  }

  throw new Error(`Supadata transcript job timed out after ${maxMs}ms`);
}

// --- YouTube Discovery Functions ----------------------------------

/**
 * Get video IDs from a YouTube channel.
 * Returns arrays of videoIds, shortIds, and liveIds.
 */
export async function getChannelVideoIds(
  channelId: string
): Promise<ChannelVideoIdsResult> {
  const params = new URLSearchParams({ id: channelId });
  const response = await fetch(`${BASE_URL}/youtube/channel/videos?${params}`, {
    headers: apiHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supadata channel videos error (${response.status}): ${errorBody}`);
  }

  return response.json();
}

/**
 * Get metadata for a single YouTube video by ID.
 */
export async function getVideoMetadata(
  videoId: string
): Promise<SupadataVideo> {
  const params = new URLSearchParams({ id: videoId });
  const response = await fetch(`${BASE_URL}/youtube/video?${params}`, {
    headers: apiHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supadata video metadata error (${response.status}): ${errorBody}`);
  }

  return response.json();
}

/**
 * Get channel information.
 */
export async function getChannelInfo(
  channelId: string
): Promise<ChannelInfo> {
  const params = new URLSearchParams({ id: channelId });
  const response = await fetch(`${BASE_URL}/youtube/channel?${params}`, {
    headers: apiHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supadata channel error (${response.status}): ${errorBody}`);
  }

  return response.json();
}

/**
 * Discover all videos from a channel.
 * First fetches video IDs, then fetches metadata for each.
 * Use with caution on large channels -- one API call per video.
 */
export async function discoverChannelVideos(
  channelId: string,
  options?: { onProgress?: (fetched: number, total: number) => void }
): Promise<SupadataVideo[]> {
  const { videoIds } = await getChannelVideoIds(channelId);

  const videos: SupadataVideo[] = [];

  for (const id of videoIds) {
    try {
      const video = await getVideoMetadata(id);
      videos.push(video);
      options?.onProgress?.(videos.length, videoIds.length);
    } catch (err) {
      console.error(`Failed to fetch metadata for video ${id}:`, err);
      // Continue with remaining videos
    }

    // Small delay between requests to be respectful
    await new Promise((r) => setTimeout(r, 200));
  }

  return videos;
}
