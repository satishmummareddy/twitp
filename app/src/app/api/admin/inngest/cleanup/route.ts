import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Only clean up jobs that are stuck: running with 0 progress for > 10 min
  // Jobs with progress > 0 are actively working and should not be touched
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("processing_jobs")
    .update({
      status: "failed",
      error_message: "Stale — no progress after 10 minutes",
      completed_at: new Date().toISOString(),
    })
    .eq("status", "running")
    .eq("progress_current", 0)
    .lt("created_at", cutoff)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    cleaned: data?.length || 0,
    message: `Cleaned up ${data?.length || 0} stale jobs`,
  });
}
