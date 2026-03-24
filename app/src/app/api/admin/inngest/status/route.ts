import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Auto-cleanup: mark stale "running" jobs (>15 min old) as completed or failed
  const staleThreshold = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: staleJobs } = await supabase
    .from("processing_jobs")
    .select("id, progress_current, progress_total, show_id")
    .eq("status", "running")
    .lt("created_at", staleThreshold);

  if (staleJobs && staleJobs.length > 0) {
    for (const stale of staleJobs) {
      if (stale.progress_current >= stale.progress_total && stale.progress_total > 0) {
        // Job actually finished but status wasn't updated
        await supabase
          .from("processing_jobs")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", stale.id);
      } else {
        // Job stalled — mark as failed
        await supabase
          .from("processing_jobs")
          .update({
            status: "failed",
            error_message: "Stale — timed out (auto-detected)",
            completed_at: new Date().toISOString(),
          })
          .eq("id", stale.id);
        // Reset stuck "processing" episodes
        await supabase
          .from("episodes")
          .update({ processing_status: "pending", processing_error: null })
          .eq("show_id", stale.show_id)
          .eq("processing_status", "processing");
      }
    }
  }

  // Get recent jobs (last 20)
  const { data: jobs } = await supabase
    .from("processing_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  // Get aggregate counts
  const { count: runningCount } = await supabase
    .from("processing_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "running");

  const { count: queuedCount } = await supabase
    .from("processing_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued");

  // Get episode-level stats
  const { count: pendingEpisodes } = await supabase
    .from("episodes")
    .select("id", { count: "exact", head: true })
    .eq("processing_status", "pending");

  const { count: processingEpisodes } = await supabase
    .from("episodes")
    .select("id", { count: "exact", head: true })
    .eq("processing_status", "processing");

  const { count: completedEpisodes } = await supabase
    .from("episodes")
    .select("id", { count: "exact", head: true })
    .eq("processing_status", "completed");

  const { count: failedEpisodes } = await supabase
    .from("episodes")
    .select("id", { count: "exact", head: true })
    .eq("processing_status", "failed");

  return NextResponse.json({
    jobs: jobs || [],
    stats: {
      runningJobs: runningCount || 0,
      queuedJobs: queuedCount || 0,
      episodes: {
        pending: pendingEpisodes || 0,
        processing: processingEpisodes || 0,
        completed: completedEpisodes || 0,
        failed: failedEpisodes || 0,
      },
    },
  });
}
