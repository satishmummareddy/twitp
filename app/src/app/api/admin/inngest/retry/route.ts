import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";

export async function POST(request: NextRequest) {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { jobId, episodeIds } = await request.json();

    const supabase = createAdminClient();

    let idsToRetry: string[] = [];

    if (episodeIds && Array.isArray(episodeIds) && episodeIds.length > 0) {
      // Retry specific episodes
      idsToRetry = episodeIds;
    } else if (jobId) {
      // Retry all failed episodes from a job — get the show's failed episodes
      const { data: job } = await supabase
        .from("processing_jobs")
        .select("show_id")
        .eq("id", jobId)
        .single();

      if (!job) {
        return NextResponse.json(
          { error: "Job not found" },
          { status: 404 }
        );
      }

      const { data: failedEpisodes } = await supabase
        .from("episodes")
        .select("id")
        .eq("show_id", job.show_id)
        .eq("processing_status", "failed");

      idsToRetry = (failedEpisodes || []).map((ep) => ep.id);
    }

    if (idsToRetry.length === 0) {
      return NextResponse.json(
        { error: "No failed episodes to retry" },
        { status: 400 }
      );
    }

    // Get the first episode to determine show
    const { data: firstEp } = await supabase
      .from("episodes")
      .select("show_id")
      .eq("id", idsToRetry[0])
      .single();

    if (!firstEp) {
      return NextResponse.json(
        { error: "Episode not found" },
        { status: 404 }
      );
    }

    // Get show name
    const { data: show } = await supabase
      .from("shows")
      .select("name")
      .eq("id", firstEp.show_id)
      .single();

    // Get active prompt
    const { data: prompt } = await supabase
      .from("prompts")
      .select("template, model_provider, model_name")
      .eq("name", "insights_extraction")
      .eq("is_active", true)
      .single();

    if (!prompt) {
      return NextResponse.json(
        { error: "No active prompt found" },
        { status: 400 }
      );
    }

    // Reset failed episodes to pending
    await supabase
      .from("episodes")
      .update({ processing_status: "pending", processing_error: null })
      .in("id", idsToRetry);

    // Create a new retry job
    const { data: retryJob } = await supabase
      .from("processing_jobs")
      .insert({
        show_id: firstEp.show_id,
        job_type: "inngest_batch",
        status: "running",
        progress_total: idsToRetry.length,
        progress_current: 0,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (!retryJob) {
      return NextResponse.json(
        { error: "Failed to create retry job" },
        { status: 500 }
      );
    }

    // Send individual events for each episode
    await inngest.send(
      idsToRetry.map((episodeId) => ({
        name: "episode/process.requested" as const,
        data: {
          episodeId,
          jobId: retryJob.id,
          showId: firstEp.show_id,
          showName: show?.name || "Unknown Show",
          promptConfig: {
            template: prompt.template,
            model_provider: prompt.model_provider,
            model_name: prompt.model_name,
          },
          forceReprocess: true,
        },
      }))
    );

    return NextResponse.json({
      jobId: retryJob.id,
      retrying: idsToRetry.length,
      message: `Retrying ${idsToRetry.length} episodes`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
