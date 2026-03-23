import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAllChannelVideoIds,
  getAllVideosMetadata,
  type YouTubeVideo,
} from "@/lib/youtube/client";

/**
 * Discover episodes from a YouTube channel.
 *
 * 100% YouTube Data API approach:
 *  1. playlistItems.list — paginate the channel's uploads playlist for ALL video IDs
 *  2. videos.list — batches of 50 for full metadata (duration, views, etc.)
 *
 * Supadata is only used for transcripts, not discovery.
 */
export const discoverEpisodes = inngest.createFunction(
  {
    id: "discover-episodes",
    name: "Discover Episodes from YouTube",
    triggers: [{ event: "show/discover.requested" }],
  },
  async ({ event, step }) => {
    const { showId, channelId } = event.data;

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

    // Step 2: Fetch ALL video IDs from channel via YouTube uploads playlist
    const videoIds: string[] = await step.run("fetch-video-ids", async () => {
      const sourceId = channelId || show.youtube_channel_id;

      if (!sourceId) {
        throw new Error("No channelId provided");
      }

      return getAllChannelVideoIds(sourceId);
    });

    // Step 3: Fetch metadata in batches of 50 via YouTube Data API
    const videos: YouTubeVideo[] = await step.run(
      "fetch-video-metadata",
      async () => {
        return getAllVideosMetadata(videoIds);
      }
    );

    // Step 4: Upsert episodes into database
    const result = await step.run("upsert-episodes", async () => {
      const supabase = createAdminClient();
      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const video of videos) {
        const videoId = video.id;
        const slug = slugify(video.title);
        const youtubeUrl = `https://www.youtube.com/watch?v=${video.id}`;

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
              youtube_url: youtubeUrl,
              youtube_video_id: videoId,
              duration_seconds: video.duration,
              duration_display: video.durationDisplay,
              view_count: video.viewCount,
              thumbnail_url: video.thumbnailUrl,
              published_at: video.publishedAt,
              published_week: getWeekStart(video.publishedAt),
              youtube_tags: video.tags,
              content_type: video.duration < 600 ? "short" : "episode",
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
            youtube_url: youtubeUrl,
            youtube_video_id: videoId,
            duration_seconds: video.duration,
            duration_display: video.durationDisplay,
            view_count: video.viewCount,
            thumbnail_url: video.thumbnailUrl,
            published_at: video.publishedAt,
            published_week: getWeekStart(video.publishedAt),
            youtube_tags: video.tags,
            processing_status: "pending",
            content_type: video.duration < 600 ? "short" : "episode",
          });

          if (error) {
            console.error(
              `Failed to insert episode "${video.title}": ${error.message}`
            );
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

// --- Helpers ------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .slice(0, 200);
}

function getWeekStart(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(date);
  monday.setDate(diff);
  return monday.toISOString().split("T")[0];
}
