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
    const { showId, limit, forceReprocess } = await request.json();

    if (!showId) {
      return NextResponse.json(
        { error: "showId is required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Verify show exists
    const { data: show } = await supabase
      .from("shows")
      .select("id, name")
      .eq("id", showId)
      .single();

    if (!show) {
      return NextResponse.json({ error: "Show not found" }, { status: 404 });
    }

    // Create processing job
    const { data: job } = await supabase
      .from("processing_jobs")
      .insert({
        show_id: showId,
        job_type: "inngest_batch",
        status: "running",
        progress_total: 0, // Will be updated by batch-process function
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

    // Send Inngest event to start batch processing
    await inngest.send({
      name: "batch/process.requested",
      data: {
        jobId: job.id,
        showId,
        limit: limit || 0,
        forceReprocess: !!forceReprocess,
      },
    });

    return NextResponse.json({
      jobId: job.id,
      message: "Batch processing queued via Inngest",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
