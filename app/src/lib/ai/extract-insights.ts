import { createAdminClient } from "@/lib/supabase/admin";
import { callAIProvider, type AIExtractionResult } from "./providers";
import { type ParsedTranscript, generateSlug } from "@/lib/transcripts/parser";

interface PromptConfig {
  template: string;
  model_provider: "anthropic" | "openai";
  model_name: string;
}

/**
 * Extract insights from a single episode transcript and save to database.
 */
export async function extractAndSaveInsights(
  episodeId: string,
  transcript: ParsedTranscript,
  promptConfig: PromptConfig,
  showName: string
): Promise<AIExtractionResult> {
  const supabase = createAdminClient();

  // Mark episode as processing
  await supabase
    .from("episodes")
    .update({ processing_status: "processing" })
    .eq("id", episodeId);

  try {
    // Build the prompt
    const prompt = promptConfig.template
      .replace("{show_name}", showName)
      .replace("{episode_title}", transcript.metadata.title)
      .replace("{transcript}", transcript.transcript);

    // Get API key
    const apiKey =
      promptConfig.model_provider === "anthropic"
        ? process.env.ANTHROPIC_API_KEY
        : process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error(
        `Missing API key for provider: ${promptConfig.model_provider}`
      );
    }

    // Call AI
    const result = await callAIProvider(
      {
        provider: promptConfig.model_provider,
        model: promptConfig.model_name,
        apiKey,
      },
      prompt
    );

    // Save insights
    const insightRows = result.insights.map((content, index) => ({
      episode_id: episodeId,
      position: index + 1,
      content,
    }));

    await supabase.from("insights").delete().eq("episode_id", episodeId);
    await supabase.from("insights").insert(insightRows);

    // Save topics (create-or-find)
    const topicIds: string[] = [];
    for (const topicSlug of result.topics) {
      const topicName = topicSlug
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");

      // Upsert topic
      const { data: existingTopic } = await supabase
        .from("topics")
        .select("id")
        .eq("slug", topicSlug)
        .single();

      let topicId: string;
      if (existingTopic) {
        topicId = existingTopic.id;
      } else {
        const { data: newTopic } = await supabase
          .from("topics")
          .insert({ name: topicName, slug: topicSlug })
          .select("id")
          .single();

        if (!newTopic) continue;
        topicId = newTopic.id;
      }

      topicIds.push(topicId);
    }

    // Save episode_topics
    await supabase
      .from("episode_topics")
      .delete()
      .eq("episode_id", episodeId);

    if (topicIds.length > 0) {
      await supabase.from("episode_topics").insert(
        topicIds.map((topic_id) => ({
          episode_id: episodeId,
          topic_id,
        }))
      );
    }

    // Update episode with summary and status
    await supabase
      .from("episodes")
      .update({
        summary: result.summary,
        guest_name: result.guest_name || transcript.metadata.guest,
        ai_model_used: `${promptConfig.model_provider}/${promptConfig.model_name}`,
        processing_status: "completed",
        processing_error: null,
        is_published: true,
      })
      .eq("id", episodeId);

    return result;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await supabase
      .from("episodes")
      .update({
        processing_status: "failed",
        processing_error: errorMessage,
      })
      .eq("id", episodeId);

    throw error;
  }
}

/**
 * Import a parsed transcript into the episodes table.
 * Returns the episode ID (existing or newly created).
 */
export async function importEpisode(
  showId: string,
  transcript: ParsedTranscript
): Promise<string> {
  const supabase = createAdminClient();

  // Check if episode already exists by video_id or slug
  const slug = generateSlug(
    transcript.metadata.title || transcript.folderName
  );

  if (transcript.metadata.video_id) {
    const { data: existing } = await supabase
      .from("episodes")
      .select("id")
      .eq("youtube_video_id", transcript.metadata.video_id)
      .single();

    if (existing) return existing.id;
  }

  const { data: existingBySlug } = await supabase
    .from("episodes")
    .select("id")
    .eq("show_id", showId)
    .eq("slug", slug)
    .single();

  if (existingBySlug) return existingBySlug.id;

  // Create new episode
  const { data: episode, error } = await supabase
    .from("episodes")
    .insert({
      show_id: showId,
      title: transcript.metadata.title,
      slug,
      guest_name: transcript.metadata.guest,
      description: transcript.metadata.description,
      youtube_url: transcript.metadata.youtube_url,
      youtube_video_id: transcript.metadata.video_id,
      duration_seconds: transcript.metadata.duration_seconds,
      duration_display: transcript.metadata.duration,
      view_count: transcript.metadata.view_count,
      transcript_text: transcript.transcript,
      processing_status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to import episode ${slug}: ${error.message}`);
  }

  return episode.id;
}

/**
 * Update topic episode counts.
 */
export async function updateTopicCounts(): Promise<void> {
  const supabase = createAdminClient();

  const { data: topics } = await supabase.from("topics").select("id");
  if (!topics) return;

  for (const topic of topics) {
    const { count } = await supabase
      .from("episode_topics")
      .select("id", { count: "exact", head: true })
      .eq("topic_id", topic.id);

    await supabase
      .from("topics")
      .update({ episode_count: count ?? 0 })
      .eq("id", topic.id);
  }
}

/**
 * Update show episode count.
 */
export async function updateShowEpisodeCount(
  showId: string
): Promise<void> {
  const supabase = createAdminClient();

  const { count } = await supabase
    .from("episodes")
    .select("id", { count: "exact", head: true })
    .eq("show_id", showId);

  await supabase
    .from("shows")
    .update({ episode_count: count ?? 0 })
    .eq("id", showId);
}
