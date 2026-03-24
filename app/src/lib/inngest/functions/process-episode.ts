import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { callAIProvider } from "@/lib/ai/providers";
import { generateSlug } from "@/lib/transcripts/parser";

/**
 * Per-episode processing function.
 * Each episode is processed independently with automatic retries.
 * Concurrency is controlled via processing_config.
 */
export const processEpisode = inngest.createFunction(
  {
    id: "process-episode",
    name: "Process Single Episode",
    retries: 3,
    concurrency: [
      {
        // Limit concurrent processing per show
        limit: 5,
        key: "event.data.showId",
      },
    ],
    triggers: [{ event: "episode/process.requested" }],
  },
  async ({ event, step }) => {
    const { episodeId, jobId, showName, promptConfig, forceReprocess } =
      event.data;

    // Step 0: Check if job was cancelled
    const jobCancelled = await step.run("check-job-cancelled", async () => {
      const supabase = createAdminClient();
      const { data: job } = await supabase
        .from("processing_jobs")
        .select("status")
        .eq("id", jobId)
        .single();
      return job?.status === "failed" || job?.status === "completed";
    });

    if (jobCancelled) {
      return { episodeId, status: "skipped-cancelled" };
    }

    // Step 1: Check if already processed (skip if not forcing)
    const shouldProcess = await step.run("check-status", async () => {
      if (forceReprocess) return true;

      const supabase = createAdminClient();
      const { data: episode } = await supabase
        .from("episodes")
        .select("processing_status")
        .eq("id", episodeId)
        .single();

      return episode?.processing_status !== "completed";
    });

    if (!shouldProcess) {
      // Still update progress for skipped episodes
      await step.run("update-progress-skipped", async () => {
        await incrementJobProgress(jobId);
      });
      return { episodeId, status: "skipped" };
    }

    // Step 2: Mark as processing
    await step.run("mark-processing", async () => {
      const supabase = createAdminClient();
      await supabase
        .from("episodes")
        .update({ processing_status: "processing" })
        .eq("id", episodeId);
    });

    // Step 3: Get episode data
    const episodeData = await step.run("get-episode", async () => {
      const supabase = createAdminClient();
      const { data: episode } = await supabase
        .from("episodes")
        .select("id, title, transcript_text, guest_name")
        .eq("id", episodeId)
        .single();

      if (!episode) throw new Error(`Episode not found: ${episodeId}`);
      if (!episode.transcript_text)
        throw new Error(`No transcript for episode: ${episodeId}`);

      return episode;
    });

    // Step 4: Call AI to extract insights
    const result = await step.run("extract-insights", async () => {
      const prompt = promptConfig.template
        .replace("{show_name}", showName)
        .replace("{episode_title}", episodeData.title)
        .replace("{transcript}", episodeData.transcript_text!);

      const apiKey =
        promptConfig.model_provider === "anthropic"
          ? process.env.ANTHROPIC_API_KEY
          : process.env.OPENAI_API_KEY;

      if (!apiKey) {
        throw new Error(
          `Missing API key for provider: ${promptConfig.model_provider}`
        );
      }

      return callAIProvider(
        {
          provider: promptConfig.model_provider as "anthropic" | "openai",
          model: promptConfig.model_name,
          apiKey,
        },
        prompt
      );
    });

    // Step 5: Save results to database
    await step.run("save-results", async () => {
      const supabase = createAdminClient();

      // Save insights
      const insightRows = result.insights.map(
        (content: string, index: number) => ({
          episode_id: episodeId,
          position: index + 1,
          content,
        })
      );

      await supabase.from("insights").delete().eq("episode_id", episodeId);
      await supabase.from("insights").insert(insightRows);

      // Save topics
      const topicIds: string[] = [];
      for (const topicSlug of result.topics) {
        const slug = generateSlug(topicSlug);
        const topicName = topicSlug
          .split("-")
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");

        const { data: existing } = await supabase
          .from("topics")
          .select("id")
          .eq("slug", slug)
          .single();

        let topicId: string;
        if (existing) {
          topicId = existing.id;
        } else {
          const { data: newTopic } = await supabase
            .from("topics")
            .insert({ name: topicName, slug })
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

      // Update episode
      await supabase
        .from("episodes")
        .update({
          summary: result.summary,
          guest_name:
            result.guest_name || episodeData.guest_name,
          ai_model_used: `${promptConfig.model_provider}/${promptConfig.model_name}`,
          processing_status: "completed",
          processing_error: null,
          is_published: true,
        })
        .eq("id", episodeId);
    });

    // Step 6: Update job progress
    await step.run("update-progress", async () => {
      await incrementJobProgress(jobId);
    });

    return { episodeId, status: "completed" };
  }
);

/**
 * Increment the progress counter on a processing job.
 * Also checks if all episodes are done and marks job as completed.
 */
async function incrementJobProgress(jobId: string) {
  const supabase = createAdminClient();

  // Get current progress
  const { data: job } = await supabase
    .from("processing_jobs")
    .select("progress_current, progress_total")
    .eq("id", jobId)
    .single();

  if (!job) return;

  const newProgress = (job.progress_current || 0) + 1;

  const update: Record<string, unknown> = {
    progress_current: newProgress,
  };

  // If all episodes are done, mark job as completed
  if (newProgress >= job.progress_total) {
    update.status = "completed";
    update.completed_at = new Date().toISOString();
  }

  await supabase.from("processing_jobs").update(update).eq("id", jobId);
}
