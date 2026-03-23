import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

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
