import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const episodeId = request.nextUrl.searchParams.get("episodeId");
  const runIdsParam = request.nextUrl.searchParams.get("runIds");

  if (!episodeId || !runIdsParam) {
    return NextResponse.json(
      { error: "episodeId and runIds are required" },
      { status: 400 }
    );
  }

  const runIds = runIdsParam.split(",").filter(Boolean);
  const supabase = createAdminClient();

  // Get production data for this episode
  const { data: episode } = await supabase
    .from("episodes")
    .select(
      "id, title, guest_name, summary, shows(name), insights(position, content)"
    )
    .eq("id", episodeId)
    .single();

  // Get production topics
  const { data: episodeTopics } = await supabase
    .from("episode_topics")
    .select("topics(name, slug)")
    .eq("episode_id", episodeId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const productionTopics =
    episodeTopics?.map((et: any) => et.topics?.slug).filter(Boolean) || [];

  // Get eval results for this episode across the requested runs
  const { data: evalResults } = await supabase
    .from("eval_results")
    .select("*, eval_runs(id, name, prompt_id, model_provider, model_name, prompts(name))")
    .eq("episode_id", episodeId)
    .in("eval_run_id", runIds);

  return NextResponse.json({
    episode,
    productionTopics,
    evalResults: evalResults || [],
  });
}
