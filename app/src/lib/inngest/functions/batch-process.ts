import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Fan-out function: receives a batch request, queries episodes,
 * and sends individual process-episode events.
 */
export const batchProcess = inngest.createFunction(
  {
    id: "batch-process",
    name: "Batch Process Episodes",
    triggers: [{ event: "batch/process.requested" }],
  },
  async ({ event, step }) => {
    const { jobId, showId, limit, forceReprocess } = event.data;

    // Step 1: Get episodes to process
    const episodes = await step.run("query-episodes", async () => {
      const supabase = createAdminClient();

      // Get show info
      const { data: show } = await supabase
        .from("shows")
        .select("name")
        .eq("id", showId)
        .single();

      if (!show) throw new Error(`Show not found: ${showId}`);

      // Get episodes that need processing
      let query = supabase
        .from("episodes")
        .select("id, title, processing_status")
        .eq("show_id", showId)
        .order("created_at", { ascending: true });

      if (!forceReprocess) {
        query = query.neq("processing_status", "completed");
      }

      if (limit && limit > 0) {
        query = query.limit(limit);
      }

      const { data: eps } = await query;

      return {
        showName: show.name,
        episodes: eps || [],
      };
    });

    if (episodes.episodes.length === 0) {
      // Update job as completed with 0 episodes
      await step.run("mark-empty", async () => {
        const supabase = createAdminClient();
        await supabase
          .from("processing_jobs")
          .update({
            status: "completed",
            progress_total: 0,
            progress_current: 0,
            completed_at: new Date().toISOString(),
          })
          .eq("id", jobId);
      });

      return { processed: 0, message: "No episodes to process" };
    }

    // Step 2: Update job with total count
    await step.run("update-job-total", async () => {
      const supabase = createAdminClient();
      await supabase
        .from("processing_jobs")
        .update({ progress_total: episodes.episodes.length })
        .eq("id", jobId);
    });

    // Step 3: Get active prompt config
    const promptConfig = await step.run("get-prompt", async () => {
      const supabase = createAdminClient();
      const { data: prompt } = await supabase
        .from("prompts")
        .select("template, model_provider, model_name")
        .eq("name", "insights_extraction")
        .eq("is_active", true)
        .single();

      if (!prompt) throw new Error("No active insights_extraction prompt found");
      return prompt;
    });

    // Step 4: Fan out — send individual events for each episode
    await step.sendEvent(
      "fan-out-episodes",
      episodes.episodes.map((ep) => ({
        name: "episode/process.requested" as const,
        data: {
          episodeId: ep.id,
          jobId,
          showId,
          showName: episodes.showName,
          promptConfig: {
            template: promptConfig.template,
            model_provider: promptConfig.model_provider,
            model_name: promptConfig.model_name,
          },
          forceReprocess: !!forceReprocess,
        },
      }))
    );

    return {
      processed: episodes.episodes.length,
      message: `Queued ${episodes.episodes.length} episodes for processing`,
    };
  }
);
