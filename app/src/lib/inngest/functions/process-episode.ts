import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { callAIProvider } from "@/lib/ai/providers";
import { generateSlug } from "@/lib/transcripts/parser";
import { logAuditEvent } from "@/lib/audit/logger";
import { estimateCost } from "@/lib/ai/cost";
import type { AICallResult } from "@/lib/ai/providers";

/**
 * Per-episode processing function.
 * Each episode is processed independently with automatic retries.
 * Supports versioned output — results saved to episode_versions table
 * tagged by prompt_id, plus legacy writes to insights/episode_topics.
 */
export const processEpisode = inngest.createFunction(
  {
    id: "process-episode",
    name: "Process Single Episode",
    retries: 3,
    concurrency: [
      {
        limit: 5,
        key: "event.data.showId",
      },
    ],
    triggers: [{ event: "episode/process.requested" }],
    onFailure: async ({ event, error }) => {
      const { episodeId, jobId, promptId } = event.data.event.data;
      const supabase = createAdminClient();

      await supabase
        .from("episodes")
        .update({
          processing_status: "failed",
          processing_error: error.message?.slice(0, 500) || "Unknown error",
        })
        .eq("id", episodeId);

      // Mark version as failed if promptId provided
      if (promptId) {
        await supabase
          .from("episode_versions")
          .upsert(
            {
              episode_id: episodeId,
              prompt_id: promptId,
              status: "failed",
              error_message: error.message?.slice(0, 500) || "Unknown error",
              model_provider: "unknown",
              model_name: "unknown",
            },
            { onConflict: "episode_id,prompt_id" }
          );
      }

      await logAuditEvent({
        episodeId,
        jobId,
        eventType: "processing_failed",
        errorMessage: error.message?.slice(0, 500) || "Unknown error",
      });

      const { data: job } = await supabase
        .from("processing_jobs")
        .select("progress_current, progress_total")
        .eq("id", jobId)
        .single();

      if (job) {
        const newProgress = (job.progress_current || 0) + 1;
        const update: Record<string, unknown> = {
          progress_current: newProgress,
        };
        if (newProgress >= (job.progress_total || 0)) {
          update.status = "completed";
          update.completed_at = new Date().toISOString();
        }
        await supabase
          .from("processing_jobs")
          .update(update)
          .eq("id", jobId);
      }
    },
  },
  async ({ event, step }) => {
    const {
      episodeId,
      jobId,
      showName,
      promptConfig,
      promptId,
      forceReprocess,
    } = event.data;

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

      // Check if this specific version exists
      if (promptId) {
        const supabase = createAdminClient();
        const { data: version } = await supabase
          .from("episode_versions")
          .select("status")
          .eq("episode_id", episodeId)
          .eq("prompt_id", promptId)
          .single();

        return version?.status !== "completed";
      }

      const supabase = createAdminClient();
      const { data: episode } = await supabase
        .from("episodes")
        .select("processing_status")
        .eq("id", episodeId)
        .single();

      return episode?.processing_status !== "completed";
    });

    if (!shouldProcess) {
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

      // Mark version as processing
      if (promptId) {
        await supabase.from("episode_versions").upsert(
          {
            episode_id: episodeId,
            prompt_id: promptId,
            status: "processing",
            model_provider: promptConfig.model_provider,
            model_name: promptConfig.model_name,
          },
          { onConflict: "episode_id,prompt_id" }
        );
      }

      await logAuditEvent({
        episodeId,
        jobId,
        eventType: "processing_started",
      });
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
    const aiResult: AICallResult = await step.run(
      "extract-insights",
      async () => {
        let prompt = promptConfig.template
          .replace("{show_name}", showName)
          .replace("{episode_title}", episodeData.title)
          .replace("{transcript}", episodeData.transcript_text!);

        // Auto-append transcript if template didn't include {transcript}
        if (!promptConfig.template.includes("{transcript}")) {
          prompt += `\n\n**Show:** ${showName}\n**Episode:** ${episodeData.title}\n\n**Transcript:**\n${episodeData.transcript_text!}`;
        }

        // Auto-append JSON format instructions if not already present
        if (!prompt.toLowerCase().includes("json")) {
          prompt += `\n\nRespond with valid JSON only, in this format:\n{"guest_name": "...", "summary": "...", "insights": ["insight1", "insight2", ...], "topics": ["topic-slug-1", "topic-slug-2", ...]}`;
        }

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
      }
    );

    // Step 5: Save results to database
    await step.run("save-results", async () => {
      const supabase = createAdminClient();

      const episodeCost = estimateCost(
        promptConfig.model_name,
        aiResult.usage.input_tokens,
        aiResult.usage.output_tokens
      );

      // Build insights JSONB
      const insightsJson = aiResult.extraction.insights.map(
        (content: string, index: number) => ({
          position: index + 1,
          content,
        })
      );

      // Build topics JSONB (slugs)
      const topicSlugs = aiResult.extraction.topics.map((t: string) =>
        generateSlug(t)
      );

      // === Save to episode_versions (versioned storage) ===
      if (promptId) {
        await supabase.from("episode_versions").upsert(
          {
            episode_id: episodeId,
            prompt_id: promptId,
            guest_name: aiResult.extraction.guest_name,
            summary: aiResult.extraction.summary,
            insights: insightsJson,
            topics: topicSlugs,
            model_provider: promptConfig.model_provider,
            model_name: promptConfig.model_name,
            input_tokens: aiResult.usage.input_tokens,
            output_tokens: aiResult.usage.output_tokens,
            processing_cost: episodeCost,
            processing_duration_ms: aiResult.usage.duration_ms,
            status: "completed",
            error_message: null,
          },
          { onConflict: "episode_id,prompt_id" }
        );
      }

      // === Legacy writes (insights table + episode_topics) ===
      // Keep these so existing public pages work during transition
      const insightRows = aiResult.extraction.insights.map(
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
      for (const topicSlug of aiResult.extraction.topics) {
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

      // Update episode record
      await supabase
        .from("episodes")
        .update({
          summary: aiResult.extraction.summary,
          guest_name:
            aiResult.extraction.guest_name || episodeData.guest_name,
          ai_model_used: `${promptConfig.model_provider}/${promptConfig.model_name}`,
          processing_status: "completed",
          processing_error: null,
          is_published: true,
          input_tokens: aiResult.usage.input_tokens,
          output_tokens: aiResult.usage.output_tokens,
          processing_cost: episodeCost,
          processing_duration_ms: aiResult.usage.duration_ms,
        })
        .eq("id", episodeId);

      await logAuditEvent({
        episodeId,
        jobId,
        eventType: "ai_call_completed",
        modelProvider: promptConfig.model_provider,
        modelName: promptConfig.model_name,
        inputTokens: aiResult.usage.input_tokens,
        outputTokens: aiResult.usage.output_tokens,
        costEstimate: episodeCost,
        durationMs: aiResult.usage.duration_ms,
      });

      await logAuditEvent({
        episodeId,
        jobId,
        eventType: "processing_completed",
      });
    });

    // Step 6: Update job progress + cost totals
    await step.run("update-progress", async () => {
      const episodeCost = estimateCost(
        promptConfig.model_name,
        aiResult.usage.input_tokens,
        aiResult.usage.output_tokens
      );
      await incrementJobProgress(jobId, {
        inputTokens: aiResult.usage.input_tokens,
        outputTokens: aiResult.usage.output_tokens,
        cost: episodeCost,
        modelName: promptConfig.model_name,
      });
    });

    return { episodeId, status: "completed" };
  }
);

/**
 * Increment the progress counter on a processing job.
 */
async function incrementJobProgress(
  jobId: string,
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cost: number;
    modelName: string;
  }
) {
  const supabase = createAdminClient();

  const { data: currentJob } = await supabase
    .from("processing_jobs")
    .select(
      "progress_current, progress_total, total_input_tokens, total_output_tokens, total_cost"
    )
    .eq("id", jobId)
    .single();

  if (!currentJob) return;

  const newProgress = (currentJob.progress_current || 0) + 1;

  const update: Record<string, unknown> = {
    progress_current: newProgress,
  };

  if (usage) {
    update.total_input_tokens =
      (currentJob.total_input_tokens || 0) + usage.inputTokens;
    update.total_output_tokens =
      (currentJob.total_output_tokens || 0) + usage.outputTokens;
    update.total_cost =
      parseFloat(String(currentJob.total_cost || 0)) + usage.cost;
  }

  if (newProgress >= (currentJob.progress_total || 0)) {
    update.status = "completed";
    update.completed_at = new Date().toISOString();
  }

  await supabase.from("processing_jobs").update(update).eq("id", jobId);
}
