import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { runId } = await params;
  const supabase = createAdminClient();

  // Get run with prompt info
  const { data: run, error: runError } = await supabase
    .from("eval_runs")
    .select("*, prompts(name)")
    .eq("id", runId)
    .single();

  if (runError || !run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  // Get results with episode titles
  const { data: results, error: resultsError } = await supabase
    .from("eval_results")
    .select("*, episodes(title, guest_name)")
    .eq("eval_run_id", runId)
    .order("created_at", { ascending: true });

  if (resultsError) {
    return NextResponse.json({ error: resultsError.message }, { status: 500 });
  }

  return NextResponse.json({ run, results });
}
