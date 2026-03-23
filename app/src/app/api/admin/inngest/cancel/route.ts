import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { jobId } = await request.json();

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId is required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Mark the job as failed/cancelled
    const { data: job } = await supabase
      .from("processing_jobs")
      .update({
        status: "failed",
        error_message: "Cancelled by admin",
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .eq("status", "running")
      .select("id")
      .single();

    if (!job) {
      return NextResponse.json(
        { error: "Job not found or not running" },
        { status: 404 }
      );
    }

    // Reset any episodes that were in 'processing' state back to 'pending'
    await supabase
      .from("episodes")
      .update({ processing_status: "pending", processing_error: null })
      .eq("processing_status", "processing");

    return NextResponse.json({
      message: "Job cancelled",
      jobId: job.id,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
