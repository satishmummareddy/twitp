import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Fan-out function: receives a batch request, queries episodes,
 * and sends individual process-episode events.
 * Supports multiple prompt IDs — creates one event per episode × prompt combo.
 */
export const batchProcess = inngest.createFunction(
  {
    id: "batch-process",
    name: "Batch Process Episodes",
    triggers: [{ event: "batch/process.requested" }],
  },
  async ({ event, step }) => {
    const { jobId, showId, limit, forceReprocess, promptIds } = event.data;

    // Step 1: Get episodes to process
    const episodes = await step.run("query-episodes", async () => {
      const supabase = createAdminClient();

      const { data: show } = await supabase
        .from("shows")
        .select("name")
        .eq("id", showId)
        .single();

      if (!show) throw new Error(`Show not found: ${showId}`);

      let query = supabase
        .from("episodes")
        .select("id, title, processing_status")
        .eq("show_id", showId)
        .eq("content_type", "episode")
        .order("created_at", { ascending: true });

      if (!forceReprocess && (!promptIds || promptIds.length === 0)) {
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

    // Step 2: Get prompt configs
    const prompts = await step.run("get-prompts", async () => {
      const supabase = createAdminClient();

      if (promptIds && promptIds.length > 0) {
        // Fetch specific prompts by ID
        const { data } = await supabase
          .from("prompts")
          .select("id, template, model_provider, model_name")
          .in("id", promptIds);

        if (!data || data.length === 0) {
          throw new Error("None of the specified prompts found");
        }
        return data;
      }

      // Fallback: use the active prompt
      const { data: prompt } = await supabase
        .from("prompts")
        .select("id, template, model_provider, model_name")
        .eq("name", "insights_extraction")
        .eq("is_active", true)
        .single();

      if (!prompt)
        throw new Error("No active insights_extraction prompt found");
      return [prompt];
    });

    // Total work = episodes × prompts
    const totalWork = episodes.episodes.length * prompts.length;

    // Step 3: Update job with total count
    await step.run("update-job-total", async () => {
      const supabase = createAdminClient();
      await supabase
        .from("processing_jobs")
        .update({ progress_total: totalWork })
        .eq("id", jobId);
    });

    // Step 4: Fan out — one event per episode × prompt
    const events = [];
    for (const ep of episodes.episodes) {
      for (const prompt of prompts) {
        events.push({
          name: "episode/process.requested" as const,
          data: {
            episodeId: ep.id,
            jobId,
            showId,
            showName: episodes.showName,
            promptId: prompt.id,
            promptConfig: {
              template: prompt.template,
              model_provider: prompt.model_provider,
              model_name: prompt.model_name,
            },
            forceReprocess: !!forceReprocess,
          },
        });
      }
    }

    await step.sendEvent("fan-out-episodes", events);

    return {
      processed: totalWork,
      message: `Queued ${episodes.episodes.length} episodes × ${prompts.length} prompts = ${totalWork} tasks`,
    };
  }
);
