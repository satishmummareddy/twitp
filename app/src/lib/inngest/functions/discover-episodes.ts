import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAllChannelVideos,
  getPlaylistVideos,
  type YouTubeVideoMeta,
} from "@/lib/supadata/client";

/**
 * Discover episodes from a YouTube channel or playlist.
 * Fetches video metadata and creates episode records in DB.
 */
export const discoverEpisodes = inngest.createFunction(
  {
    id: "discover-episodes",
    name: "Discover Episodes from YouTube",
    triggers: [{ event: "show/discover.requested" }],
  },
  async ({ event, step }) => {
    const { showId, channelId, playlistId, maxPages } = event.data;

    // Step 1: Verify show exists
    const show = await step.run("verify-show", async () => {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from("shows")
        .select("id, name, youtube_channel_id")
        .eq("id", showId)
        .single();

      if (!data) throw new Error(`Show not found: ${showId}`);
      return data;
    });

    // Step 2: Fetch all videos from channel/playlist
    const videos = await step.run("fetch-videos", async () => {
      const sourceId = channelId || show.youtube_channel_id;

      if (playlistId) {
        // Fetch from playlist — paginate
        const allVideos: YouTubeVideoMeta[] = [];
        let pageToken: string | undefined;
        let pages = 0;

        do {
          const result = await getPlaylistVideos(playlistId, { pageToken });
          allVideos.push(...result.videos);
          pageToken = result.nextPageToken;
          pages++;
          if (pageToken) await new Promise((r) => setTimeout(r, 500));
        } while (pageToken && pages < (maxPages || 100));

        return allVideos;
      }

      if (sourceId) {
        return getAllChannelVideos(sourceId, { maxPages: maxPages || 100 });
      }

      throw new Error("No channelId or playlistId provided");
    });

    // Step 3: Upsert episodes into database
    const result = await step.run("upsert-episodes", async () => {
      const supabase = createAdminClient();
      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const video of videos) {
        const videoId = video.id;
        const slug = slugify(video.title);

        // Check if episode already exists
        const { data: existing } = await supabase
          .from("episodes")
          .select("id, youtube_video_id")
          .eq("show_id", showId)
          .or(`youtube_video_id.eq.${videoId},slug.eq.${slug}`)
          .limit(1)
          .single();

        if (existing) {
          // Update metadata (view count, etc.) but don't overwrite processing results
          await supabase
            .from("episodes")
            .update({
              title: video.title,
              description: video.description,
              youtube_url: video.url,
              youtube_video_id: videoId,
              duration_seconds: video.duration,
              duration_display: formatDuration(video.duration),
              view_count: video.stats.views,
              thumbnail_url: video.thumbnails.high || video.thumbnails.medium || video.thumbnails.default,
              published_at: video.createdAt,
              published_week: getWeekStart(video.createdAt),
              youtube_tags: video.tags,
            })
            .eq("id", existing.id);
          updated++;
        } else {
          // Create new episode
          const { error } = await supabase.from("episodes").insert({
            show_id: showId,
            title: video.title,
            slug,
            description: video.description,
            youtube_url: video.url,
            youtube_video_id: videoId,
            duration_seconds: video.duration,
            duration_display: formatDuration(video.duration),
            view_count: video.stats.views,
            thumbnail_url: video.thumbnails.high || video.thumbnails.medium || video.thumbnails.default,
            published_at: video.createdAt,
            published_week: getWeekStart(video.createdAt),
            youtube_tags: video.tags,
            processing_status: "pending",
          });

          if (error) {
            console.error(`Failed to insert episode "${video.title}": ${error.message}`);
            skipped++;
          } else {
            created++;
          }
        }
      }

      // Update show episode count
      const { count } = await supabase
        .from("episodes")
        .select("id", { count: "exact", head: true })
        .eq("show_id", showId);

      await supabase
        .from("shows")
        .update({
          episode_count: count ?? 0,
          youtube_channel_id: channelId || show.youtube_channel_id,
        })
        .eq("id", showId);

      return { total: videos.length, created, updated, skipped };
    });

    return result;
  }
);

// ─── Helpers ──────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .slice(0, 200);
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

function getWeekStart(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(date);
  monday.setDate(diff);
  return monday.toISOString().split("T")[0];
}
