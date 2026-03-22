import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { readTranscriptsFromDirectory } from "@/lib/transcripts/parser";
import {
  importEpisode,
  extractAndSaveInsights,
  updateShowEpisodeCount,
  updateTopicCounts,
} from "@/lib/ai/extract-insights";
import { resolve } from "path";

export const maxDuration = 300; // 5 minute timeout for Vercel

export async function POST(request: NextRequest) {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { showId, forceReprocess, limit } = await request.json();

    if (!showId) {
      return NextResponse.json(
        { error: "showId is required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Get show
    const { data: show } = await supabase
      .from("shows")
      .select("*")
      .eq("id", showId)
      .single();

    if (!show) {
      return NextResponse.json({ error: "Show not found" }, { status: 404 });
    }

    if (!show.transcript_source_path) {
      return NextResponse.json(
        { error: "Show has no transcript source path configured" },
        { status: 400 }
      );
    }

    // Get active prompt
    const { data: prompt } = await supabase
      .from("prompts")
      .select("*")
      .eq("name", "insights_extraction")
      .eq("is_active", true)
      .single();

    if (!prompt) {
      return NextResponse.json(
        { error: "No active insights_extraction prompt found" },
        { status: 400 }
      );
    }

    // Resolve transcript path relative to project root
    const projectRoot = resolve(process.cwd(), "..");
    const transcriptPath = resolve(projectRoot, show.transcript_source_path);

    // Read all transcripts (apply limit if set)
    let transcripts = await readTranscriptsFromDirectory(transcriptPath);
    const episodeLimit = typeof limit === "number" && limit > 0 ? limit : 0;
    if (episodeLimit > 0) {
      transcripts = transcripts.slice(0, episodeLimit);
    }

    // Create processing job
    const { data: job } = await supabase
      .from("processing_jobs")
      .insert({
        show_id: showId,
        job_type: "bulk_extract",
        status: "running",
        progress_total: transcripts.length,
        progress_current: 0,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (!job) {
      return NextResponse.json(
        { error: "Failed to create processing job" },
        { status: 500 }
      );
    }

    // Process in background — return immediately with job ID
    // We use a fire-and-forget pattern here
    processInBackground(
      job.id,
      showId,
      show.name,
      transcripts,
      prompt,
      !!forceReprocess
    );

    return NextResponse.json({
      jobId: job.id,
      totalEpisodes: transcripts.length,
      message: "Processing started",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function processInBackground(
  jobId: string,
  showId: string,
  showName: string,
  transcripts: Awaited<ReturnType<typeof readTranscriptsFromDirectory>>,
  prompt: { template: string; model_provider: string; model_name: string },
  forceReprocess: boolean
) {
  const supabase = createAdminClient();
  let processed = 0;
  let failed = 0;

  for (const transcript of transcripts) {
    try {
      // Import episode (creates record if new)
      const episodeId = await importEpisode(showId, transcript);

      // Check if already processed
      if (!forceReprocess) {
        const { data: episode } = await supabase
          .from("episodes")
          .select("processing_status")
          .eq("id", episodeId)
          .single();

        if (episode?.processing_status === "completed") {
          processed++;
          await supabase
            .from("processing_jobs")
            .update({ progress_current: processed })
            .eq("id", jobId);
          continue;
        }
      }

      // Extract insights
      await extractAndSaveInsights(
        episodeId,
        transcript,
        {
          template: prompt.template,
          model_provider: prompt.model_provider as "anthropic" | "openai",
          model_name: prompt.model_name,
        },
        showName
      );

      processed++;
    } catch (error) {
      console.error(
        `Failed to process ${transcript.folderName}:`,
        error instanceof Error ? error.message : error
      );
      failed++;
      processed++;
    }

    // Update job progress
    await supabase
      .from("processing_jobs")
      .update({ progress_current: processed })
      .eq("id", jobId);

    // Delay between episodes to avoid rate limits (skip after last one)
    if (processed < transcripts.length) {
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }

  // Update counts
  await updateShowEpisodeCount(showId);
  await updateTopicCounts();

  // Mark job complete
  await supabase
    .from("processing_jobs")
    .update({
      status: failed > 0 ? "completed" : "completed",
      completed_at: new Date().toISOString(),
      error_message: failed > 0 ? `${failed} episodes failed` : null,
    })
    .eq("id", jobId);
}
