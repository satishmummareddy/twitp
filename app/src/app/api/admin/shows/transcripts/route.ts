import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";

/**
 * POST /api/admin/shows/transcripts
 * Trigger batch transcript fetching for a show's episodes.
 */
export async function POST(request: NextRequest) {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { showId, limit } = await request.json();

    if (!showId) {
      return NextResponse.json(
        { error: "showId is required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Create a processing job
    const { data: job } = await supabase
      .from("processing_jobs")
      .insert({
        show_id: showId,
        job_type: "fetch_transcripts",
        status: "running",
        progress_total: 0,
        progress_current: 0,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    // Send Inngest event
    await inngest.send({
      name: "show/fetch-transcripts.requested",
      data: {
        showId,
        limit: limit || 0,
        jobId: job?.id,
      },
    });

    return NextResponse.json({
      jobId: job?.id,
      message: "Transcript fetching started",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
