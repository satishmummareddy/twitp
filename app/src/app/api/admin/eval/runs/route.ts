import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { runEvalForEpisode } from "@/lib/ai/eval-extract";

export const maxDuration = 300; // 5 minute timeout

export async function GET() {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: runs, error } = await supabase
    .from("eval_runs")
    .select("*, prompts(name)")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ runs });
}

export async function POST(request: NextRequest) {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { promptId, episodeIds, name } = await request.json();

    if (!promptId || !episodeIds || !Array.isArray(episodeIds) || episodeIds.length === 0) {
      return NextResponse.json(
        { error: "promptId and episodeIds[] are required" },
        { status: 400 }
      );
    }

    if (episodeIds.length > 3) {
      return NextResponse.json(
        { error: "Max 3 episodes per eval run" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Get prompt
    const { data: prompt } = await supabase
      .from("prompts")
      .select("*")
      .eq("id", promptId)
      .single();

    if (!prompt) {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }

    // Get show name from first episode
    const { data: firstEp } = await supabase
      .from("episodes")
      .select("shows(name)")
      .eq("id", episodeIds[0])
      .single();

    const showName =
      (firstEp as unknown as { shows: { name: string } })?.shows?.name ||
      "Unknown Show";

    // Create eval run
    const { data: run, error: runError } = await supabase
      .from("eval_runs")
      .insert({
        name: name || `${prompt.name} eval`,
        prompt_id: promptId,
        prompt_template: prompt.template,
        model_provider: prompt.model_provider,
        model_name: prompt.model_name,
        status: "running",
        episode_ids: episodeIds,
        progress_total: episodeIds.length,
        progress_current: 0,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (runError || !run) {
      return NextResponse.json(
        { error: runError?.message || "Failed to create eval run" },
        { status: 500 }
      );
    }

    // Create eval_results rows (one per episode)
    await supabase.from("eval_results").insert(
      episodeIds.map((episodeId: string) => ({
        eval_run_id: run.id,
        episode_id: episodeId,
        status: "pending",
      }))
    );

    // Process in background
    processEvalInBackground(
      run.id,
      episodeIds,
      {
        template: prompt.template,
        model_provider: prompt.model_provider as "anthropic" | "openai",
        model_name: prompt.model_name,
      },
      showName
    );

    return NextResponse.json({
      runId: run.id,
      totalEpisodes: episodeIds.length,
      message: "Eval started",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function processEvalInBackground(
  runId: string,
  episodeIds: string[],
  promptConfig: {
    template: string;
    model_provider: "anthropic" | "openai";
    model_name: string;
  },
  showName: string
) {
  const supabase = createAdminClient();
  let processed = 0;
  let failed = 0;

  for (const episodeId of episodeIds) {
    try {
      await runEvalForEpisode(runId, episodeId, promptConfig, showName);
    } catch (error) {
      console.error(
        `Eval failed for episode ${episodeId}:`,
        error instanceof Error ? error.message : error
      );
      failed++;
    }

    processed++;
    await supabase
      .from("eval_runs")
      .update({ progress_current: processed })
      .eq("id", runId);

    // Delay between episodes
    if (processed < episodeIds.length) {
      await new Promise((r) => setTimeout(r, 3_000));
    }
  }

  // Mark run complete
  await supabase
    .from("eval_runs")
    .update({
      status: failed === episodeIds.length ? "failed" : "completed",
      completed_at: new Date().toISOString(),
      error_message: failed > 0 ? `${failed} episodes failed` : null,
    })
    .eq("id", runId);
}
