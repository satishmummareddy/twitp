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

function headers() {
  return {
    "x-api-key": getApiKey(),
    "Content-Type": "application/json",
  };
}

// ─── Types ────────────────────────────────────────────────────

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

export interface YouTubeVideoMeta {
  id: string;
  url: string;
  title: string;
  description: string;
  thumbnails: {
    default?: string;
    medium?: string;
    high?: string;
    maxres?: string;
  };
  author: {
    name: string;
    url: string;
  };
  stats: {
    views: number;
    likes: number;
    comments: number;
  };
  duration: number; // seconds
  tags: string[];
  createdAt: string; // ISO date
}

export interface ChannelInfo {
  id: string;
  title: string;
  description: string;
  thumbnails: Record<string, string>;
  stats: {
    subscribers: number;
    videos: number;
    views: number;
  };
}

export interface ChannelVideosResult {
  videos: YouTubeVideoMeta[];
  nextPageToken?: string;
}

// ─── Transcript Functions ─────────────────────────────────────

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
    headers: headers(),
  });

  if (response.status === 200) {
    const data: TranscriptResult = await response.json();
    return {
      text: typeof data.content === "string" ? data.content : data.content.map((c) => c.text).join(" "),
      lang: data.lang,
    };
  }

  if (response.status === 202) {
    // Async job — poll for completion
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
      headers: headers(),
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

// ─── YouTube Discovery Functions ──────────────────────────────

/**
 * Get metadata for a single YouTube video.
 */
export async function getVideoMetadata(
  videoUrl: string
): Promise<YouTubeVideoMeta> {
  const params = new URLSearchParams({ url: videoUrl });
  const response = await fetch(`${BASE_URL}/youtube/video?${params}`, {
    headers: headers(),
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
    headers: headers(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supadata channel error (${response.status}): ${errorBody}`);
  }

  return response.json();
}

/**
 * List videos from a YouTube channel with pagination.
 * Returns up to 50 videos per page.
 */
export async function getChannelVideos(
  channelId: string,
  options?: { pageToken?: string }
): Promise<ChannelVideosResult> {
  const params = new URLSearchParams({ id: channelId });
  if (options?.pageToken) params.set("pageToken", options.pageToken);

  const response = await fetch(`${BASE_URL}/youtube/channel/videos?${params}`, {
    headers: headers(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supadata channel videos error (${response.status}): ${errorBody}`);
  }

  return response.json();
}

/**
 * List videos from a YouTube playlist with pagination.
 */
export async function getPlaylistVideos(
  playlistId: string,
  options?: { pageToken?: string }
): Promise<ChannelVideosResult> {
  const params = new URLSearchParams({ id: playlistId });
  if (options?.pageToken) params.set("pageToken", options.pageToken);

  const response = await fetch(`${BASE_URL}/youtube/playlist/videos?${params}`, {
    headers: headers(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supadata playlist videos error (${response.status}): ${errorBody}`);
  }

  return response.json();
}

/**
 * Get ALL videos from a channel, paginating through results.
 * Use with caution on large channels — costs 1 credit per page.
 */
export async function getAllChannelVideos(
  channelId: string,
  options?: { maxPages?: number; onPage?: (videos: YouTubeVideoMeta[], page: number) => void }
): Promise<YouTubeVideoMeta[]> {
  const allVideos: YouTubeVideoMeta[] = [];
  let pageToken: string | undefined;
  let page = 0;
  const maxPages = options?.maxPages ?? 100;

  do {
    const result = await getChannelVideos(channelId, { pageToken });
    allVideos.push(...result.videos);
    page++;

    options?.onPage?.(result.videos, page);

    pageToken = result.nextPageToken;

    // Small delay between pages to be respectful
    if (pageToken) {
      await new Promise((r) => setTimeout(r, 500));
    }
  } while (pageToken && page < maxPages);

  return allVideos;
}
