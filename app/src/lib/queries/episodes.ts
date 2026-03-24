import { createAdminClient } from "@/lib/supabase/admin";
import type { EpisodeData } from "@/app/_components/episode-card";

/**
 * Get the currently active prompt ID for public display.
 * Falls back to any active prompt.
 */
export async function getActivePromptId(): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("prompts")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .single();
  return data?.id || null;
}

interface FetchEpisodesOptions {
  showId?: string;
  topicSlug?: string;
  cursor?: string;
  limit?: number;
}

/**
 * Fetch published episodes with versioned content from the active prompt.
 * Falls back to legacy insights table if no version exists.
 */
export async function fetchPublishedEpisodes(
  options: FetchEpisodesOptions = {}
): Promise<{ episodes: EpisodeData[]; nextCursor: string | null }> {
  const { showId, topicSlug, cursor, limit = 30 } = options;
  const supabase = createAdminClient();

  const activePromptId = await getActivePromptId();

  // If topic filter, first get episode IDs
  let topicEpisodeIds: string[] | undefined;
  if (topicSlug) {
    const { data: topic } = await supabase
      .from("topics")
      .select("id")
      .eq("slug", topicSlug)
      .single();

    if (!topic) return { episodes: [], nextCursor: null };

    const { data: episodeTopics } = await supabase
      .from("episode_topics")
      .select("episode_id")
      .eq("topic_id", topic.id);

    topicEpisodeIds = (episodeTopics || []).map((et) => et.episode_id);
    if (topicEpisodeIds.length === 0) return { episodes: [], nextCursor: null };
  }

  // Fetch episodes with legacy insights join
  let query = supabase
    .from("episodes")
    .select(
      `id, title, slug, guest_name, summary, youtube_url, thumbnail_url, duration_display, published_at, created_at,
       shows(name, slug),
       insights(position, content)`
    )
    .eq("is_published", true)
    .eq("processing_status", "completed")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (showId) {
    query = query.eq("show_id", showId);
  }

  if (topicEpisodeIds) {
    query = query.in("id", topicEpisodeIds);
  }

  if (cursor) {
    query = query.lt("published_at", cursor);
  }

  const { data: episodes } = await query;

  if (!episodes || episodes.length === 0) {
    return { episodes: [], nextCursor: null };
  }

  // If we have an active prompt, try to overlay version data
  let versionMap: Map<string, {
    summary: string;
    guest_name: string | null;
    insights: { position: number; content: string }[];
  }> = new Map();

  if (activePromptId) {
    const episodeIds = episodes.map((e) => e.id);
    const { data: versions } = await supabase
      .from("episode_versions")
      .select("episode_id, summary, guest_name, insights")
      .eq("prompt_id", activePromptId)
      .eq("status", "completed")
      .in("episode_id", episodeIds);

    if (versions) {
      for (const v of versions) {
        const insights = Array.isArray(v.insights) ? v.insights : [];
        versionMap.set(v.episode_id, {
          summary: v.summary,
          guest_name: v.guest_name,
          insights: insights.sort(
            (a: { position: number }, b: { position: number }) =>
              a.position - b.position
          ),
        });
      }
    }
  }

  // Merge: use version data if available, fall back to legacy
  const typed = episodes.map((ep) => {
    const version = versionMap.get(ep.id);
    const legacy = ep as unknown as EpisodeData;

    if (version) {
      return {
        ...legacy,
        summary: version.summary || legacy.summary,
        guest_name: version.guest_name || legacy.guest_name,
        insights: version.insights.length > 0 ? version.insights : legacy.insights?.sort((a, b) => a.position - b.position) || [],
      };
    }

    // No version — use legacy insights
    legacy.insights?.sort((a, b) => a.position - b.position);
    return legacy;
  });

  const nextCursorValue =
    typed.length === limit
      ? typed[typed.length - 1].published_at
      : null;

  return { episodes: typed, nextCursor: nextCursorValue };
}
