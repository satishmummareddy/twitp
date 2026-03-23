/**
 * YouTube Data API v3 Client
 * Handles bulk video metadata fetching via the official YouTube API.
 * Much more efficient than per-video Supadata calls for metadata.
 */

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const MAX_IDS_PER_BATCH = 50;
const DELAY_BETWEEN_BATCHES_MS = 200;

function getApiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY not set");
  return key;
}

// --- Types --------------------------------------------------------

/** Raw YouTube Data API v3 video resource (relevant fields only). */
interface YouTubeApiVideoResource {
  id: string;
  snippet: {
    publishedAt: string;
    channelId: string;
    title: string;
    description: string;
    thumbnails: {
      high?: { url: string; width: number; height: number };
      medium?: { url: string; width: number; height: number };
      default?: { url: string; width: number; height: number };
    };
    channelTitle: string;
    tags?: string[];
  };
  contentDetails: {
    duration: string; // ISO 8601 e.g. "PT1H2M30S"
  };
  statistics: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
}

interface YouTubeApiListResponse {
  items: YouTubeApiVideoResource[];
  pageInfo: { totalResults: number; resultsPerPage: number };
}

/** Raw YouTube Data API v3 channel resource. */
interface YouTubeApiChannelResource {
  id: string;
  snippet: {
    title: string;
    description: string;
    customUrl?: string;
    publishedAt: string;
    thumbnails: {
      high?: { url: string };
      medium?: { url: string };
      default?: { url: string };
    };
    country?: string;
  };
  statistics: {
    viewCount?: string;
    subscriberCount?: string;
    videoCount?: string;
  };
  contentDetails: {
    relatedPlaylists: {
      uploads: string;
    };
  };
}

interface YouTubeApiChannelListResponse {
  items: YouTubeApiChannelResource[];
}

/** Normalized video metadata that maps to our episodes table. */
export interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnailUrl: string;
  channelTitle: string;
  tags: string[];
  duration: number; // seconds
  durationDisplay: string; // e.g. "1h 2m"
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

/** Normalized channel details. */
export interface YouTubeChannel {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  uploadsPlaylistId: string;
}

// --- Parsing Helpers ----------------------------------------------

/**
 * Parse ISO 8601 duration string into total seconds.
 * Handles formats like "PT1H2M30S", "PT5M", "PT30S", "P0D", etc.
 */
export function parseISO8601Duration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Format seconds into human-readable duration.
 */
function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  const s = totalSeconds % 60;
  return `${m}m ${s}s`;
}

/**
 * Map a raw YouTube API video resource to our normalized type.
 */
function mapVideoResource(item: YouTubeApiVideoResource): YouTubeVideo {
  const durationSeconds = parseISO8601Duration(item.contentDetails.duration);
  const thumbnail =
    item.snippet.thumbnails.high?.url ??
    item.snippet.thumbnails.medium?.url ??
    item.snippet.thumbnails.default?.url ??
    "";

  return {
    id: item.id,
    title: item.snippet.title,
    description: item.snippet.description,
    publishedAt: item.snippet.publishedAt,
    thumbnailUrl: thumbnail,
    channelTitle: item.snippet.channelTitle,
    tags: item.snippet.tags ?? [],
    duration: durationSeconds,
    durationDisplay: formatDuration(durationSeconds),
    viewCount: parseInt(item.statistics.viewCount ?? "0", 10),
    likeCount: parseInt(item.statistics.likeCount ?? "0", 10),
    commentCount: parseInt(item.statistics.commentCount ?? "0", 10),
  };
}

// --- Types for playlistItems --------------------------------------

interface YouTubeApiPlaylistItemResource {
  snippet: {
    resourceId: {
      videoId: string;
    };
    title: string;
    publishedAt: string;
  };
}

interface YouTubeApiPlaylistItemsResponse {
  items: YouTubeApiPlaylistItemResource[];
  nextPageToken?: string;
  pageInfo: { totalResults: number; resultsPerPage: number };
}

// --- API Functions ------------------------------------------------

/**
 * Fetch metadata for a batch of video IDs (max 50).
 * Uses YouTube Data API v3 videos.list endpoint.
 */
export async function getVideosBatch(
  videoIds: string[]
): Promise<YouTubeVideo[]> {
  if (videoIds.length === 0) return [];
  if (videoIds.length > MAX_IDS_PER_BATCH) {
    throw new Error(
      `getVideosBatch accepts max ${MAX_IDS_PER_BATCH} IDs, got ${videoIds.length}`
    );
  }

  const params = new URLSearchParams({
    part: "snippet,contentDetails,statistics",
    id: videoIds.join(","),
    key: getApiKey(),
  });

  const response = await fetch(`${YOUTUBE_API_BASE}/videos?${params}`);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `YouTube Data API videos.list error (${response.status}): ${errorBody}`
    );
  }

  const data: YouTubeApiListResponse = await response.json();
  return data.items.map(mapVideoResource);
}

/**
 * Fetch metadata for any number of video IDs.
 * Automatically chunks into batches of 50 with a small delay between.
 */
export async function getAllVideosMetadata(
  videoIds: string[],
  options?: { onProgress?: (fetched: number, total: number) => void }
): Promise<YouTubeVideo[]> {
  const results: YouTubeVideo[] = [];
  const batches: string[][] = [];

  // Chunk into batches of 50
  for (let i = 0; i < videoIds.length; i += MAX_IDS_PER_BATCH) {
    batches.push(videoIds.slice(i, i + MAX_IDS_PER_BATCH));
  }

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const videos = await getVideosBatch(batch);
    results.push(...videos);
    options?.onProgress?.(results.length, videoIds.length);

    // Small delay between batches to stay within rate limits
    if (i < batches.length - 1) {
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
    }
  }

  return results;
}

/**
 * Get ALL video IDs from a YouTube channel by paginating the uploads playlist.
 *
 * Every YouTube channel has an "uploads" playlist whose ID is the channel ID
 * with the "UC" prefix replaced by "UU".
 * Uses playlistItems.list with pagination (50 per page) to retrieve every video.
 */
export async function getAllChannelVideoIds(
  channelId: string
): Promise<string[]> {
  // Convert channel ID (UC...) to uploads playlist ID (UU...)
  if (!channelId.startsWith("UC")) {
    throw new Error(
      `Expected a channel ID starting with "UC", got: ${channelId}`
    );
  }
  const uploadsPlaylistId = "UU" + channelId.slice(2);

  const videoIds: string[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      part: "snippet,contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: "50",
      key: getApiKey(),
    });
    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const response = await fetch(
      `${YOUTUBE_API_BASE}/playlistItems?${params}`
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `YouTube Data API playlistItems.list error (${response.status}): ${errorBody}`
      );
    }

    const data: YouTubeApiPlaylistItemsResponse = await response.json();

    for (const item of data.items) {
      videoIds.push(item.snippet.resourceId.videoId);
    }

    pageToken = data.nextPageToken;

    // Small delay between pages to stay within rate limits
    if (pageToken) {
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
    }
  } while (pageToken);

  return videoIds;
}

/**
 * Fetch channel details by channel ID.
 * Uses YouTube Data API v3 channels.list endpoint.
 */
export async function getChannelDetails(
  channelId: string
): Promise<YouTubeChannel> {
  const params = new URLSearchParams({
    part: "snippet,statistics,contentDetails",
    id: channelId,
    key: getApiKey(),
  });

  const response = await fetch(`${YOUTUBE_API_BASE}/channels?${params}`);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `YouTube Data API channels.list error (${response.status}): ${errorBody}`
    );
  }

  const data: YouTubeApiChannelListResponse = await response.json();

  if (!data.items || data.items.length === 0) {
    throw new Error(`Channel not found: ${channelId}`);
  }

  const ch = data.items[0];
  const thumbnail =
    ch.snippet.thumbnails.high?.url ??
    ch.snippet.thumbnails.medium?.url ??
    ch.snippet.thumbnails.default?.url ??
    "";

  return {
    id: ch.id,
    title: ch.snippet.title,
    description: ch.snippet.description,
    thumbnailUrl: thumbnail,
    subscriberCount: parseInt(ch.statistics.subscriberCount ?? "0", 10),
    videoCount: parseInt(ch.statistics.videoCount ?? "0", 10),
    viewCount: parseInt(ch.statistics.viewCount ?? "0", 10),
    uploadsPlaylistId: ch.contentDetails.relatedPlaylists.uploads,
  };
}
