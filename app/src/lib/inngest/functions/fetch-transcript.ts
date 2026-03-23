import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTranscript } from "@/lib/supadata/client";

/**
 * Fetch transcript for a single episode via Supadata.
 * Called individually or as part of a batch.
 */
export const fetchTranscript = inngest.createFunction(
  {
    id: "fetch-transcript",
    name: "Fetch Episode Transcript",
    retries: 2,
    concurrency: [
      {
        // Limit concurrent transcript fetches to avoid rate limits
        limit: 3,
        key: "event.data.showId",
      },
    ],
    triggers: [{ event: "episode/fetch-transcript.requested" }],
  },
  async ({ event, step }) => {
    const { episodeId, jobId } = event.data;

    // Step 1: Get episode info
    const episode = await step.run("get-episode", async () => {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from("episodes")
        .select("id, title, youtube_url, youtube_video_id, transcript_text")
        .eq("id", episodeId)
        .single();

      if (!data) throw new Error(`Episode not found: ${episodeId}`);
      return data;
    });

    // Step 2: Skip if already has transcript
    if (episode.transcript_text && episode.transcript_text.length > 100) {
      if (jobId) {
        await step.run("update-progress-skip", async () => {
          await incrementTranscriptJobProgress(jobId);
        });
      }
      return { episodeId, status: "skipped", reason: "already has transcript" };
    }

    // Step 3: Fetch transcript via Supadata
    const transcript = await step.run("fetch-from-supadata", async () => {
      const videoUrl = episode.youtube_url || `https://www.youtube.com/watch?v=${episode.youtube_video_id}`;
      return getTranscript(videoUrl);
    });

    // Step 4: Save transcript to database
    await step.run("save-transcript", async () => {
      const supabase = createAdminClient();
      await supabase
        .from("episodes")
        .update({
          transcript_text: transcript.text,
          transcript_lang: transcript.lang,
        })
        .eq("id", episodeId);
    });

    // Step 5: Update job progress if part of a batch
    if (jobId) {
      await step.run("update-progress", async () => {
        await incrementTranscriptJobProgress(jobId);
      });
    }

    return {
      episodeId,
      status: "completed",
      transcriptLength: transcript.text.length,
      lang: transcript.lang,
    };
  }
);

/**
 * Batch fetch transcripts for all episodes of a show that don't have one yet.
 */
export const batchFetchTranscripts = inngest.createFunction(
  {
    id: "batch-fetch-transcripts",
    name: "Batch Fetch Transcripts",
    triggers: [{ event: "show/fetch-transcripts.requested" }],
  },
  async ({ event, step }) => {
    const { showId, limit, jobId } = event.data;

    // Step 1: Get episodes missing transcripts
    const episodes = await step.run("get-episodes-without-transcripts", async () => {
      const supabase = createAdminClient();
      let query = supabase
        .from("episodes")
        .select("id, title, youtube_url, youtube_video_id")
        .eq("show_id", showId)
        .or("transcript_text.is.null,transcript_text.eq.")
        .order("published_at", { ascending: false });

      if (limit && limit > 0) {
        query = query.limit(limit);
      }

      const { data } = await query;
      return data || [];
    });

    if (episodes.length === 0) {
      if (jobId) {
        await step.run("mark-job-done", async () => {
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
      }
      return { total: 0, message: "No episodes need transcripts" };
    }

    // Step 2: Update job total
    if (jobId) {
      await step.run("update-job-total", async () => {
        const supabase = createAdminClient();
        await supabase
          .from("processing_jobs")
          .update({ progress_total: episodes.length })
          .eq("id", jobId);
      });
    }

    // Step 3: Fan out individual fetch events
    await step.sendEvent(
      "fan-out-transcripts",
      episodes.map((ep) => ({
        name: "episode/fetch-transcript.requested" as const,
        data: {
          episodeId: ep.id,
          showId,
          jobId: jobId || null,
        },
      }))
    );

    return {
      total: episodes.length,
      message: `Queued ${episodes.length} transcript fetches`,
    };
  }
);

// ─── Helpers ──────────────────────────────────────────────────

async function incrementTranscriptJobProgress(jobId: string) {
  const supabase = createAdminClient();

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

  if (newProgress >= job.progress_total) {
    update.status = "completed";
    update.completed_at = new Date().toISOString();
  }

  await supabase.from("processing_jobs").update(update).eq("id", jobId);
}
