import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ showId: string }> }
) {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { showId } = await params;
  const contentType = request.nextUrl.searchParams.get("content_type");
  const supabase = createAdminClient();

  // Paginate to bypass Supabase's default 1000-row limit (PGRST_MAX_ROWS)
  const PAGE_SIZE = 1000;
  const allEpisodes: Record<string, unknown>[] = [];

  for (let page = 0; ; page++) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("episodes")
      .select(
        "id, title, slug, guest_name, published_at, duration_display, duration_seconds, view_count, like_count, thumbnail_url, youtube_url, processing_status, processing_error, summary, ai_model_used, content_type, input_tokens, output_tokens, processing_cost"
      )
      .eq("show_id", showId)
      .order("published_at", { ascending: false, nullsFirst: false })
      .range(from, to);

    if (contentType) {
      query = query.eq("content_type", contentType);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    allEpisodes.push(...(data || []));

    // If we got fewer than PAGE_SIZE rows, we've fetched everything
    if (!data || data.length < PAGE_SIZE) break;
  }

  // Paginate transcript IDs the same way
  const allTranscriptIds: string[] = [];
  for (let page = 0; ; page++) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data } = await supabase
      .from("episodes")
      .select("id")
      .eq("show_id", showId)
      .not("transcript_text", "is", null)
      .neq("transcript_text", "")
      .range(from, to);

    allTranscriptIds.push(...(data || []).map((e) => e.id));

    if (!data || data.length < PAGE_SIZE) break;
  }

  const transcriptIds = new Set(allTranscriptIds);

  // Fetch version data: which prompts have been run for each episode
  const allVersions: { episode_id: string; prompt_id: string; status: string; prompt_name?: string }[] = [];
  for (let page = 0; ; page++) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data } = await supabase
      .from("episode_versions")
      .select("episode_id, prompt_id, status, prompts(name)")
      .in("episode_id", allEpisodes.map((e) => e.id as string))
      .range(from, to);

    if (data) {
      allVersions.push(
        ...data.map((v: Record<string, unknown>) => ({
          episode_id: v.episode_id as string,
          prompt_id: v.prompt_id as string,
          status: v.status as string,
          prompt_name: (v.prompts as Record<string, unknown>)?.name as string || undefined,
        }))
      );
    }

    if (!data || data.length < PAGE_SIZE) break;
  }

  // Group versions by episode
  const versionsByEpisode = new Map<string, { prompt_id: string; prompt_name?: string; status: string }[]>();
  for (const v of allVersions) {
    const list = versionsByEpisode.get(v.episode_id) || [];
    list.push({ prompt_id: v.prompt_id, prompt_name: v.prompt_name, status: v.status });
    versionsByEpisode.set(v.episode_id, list);
  }

  // Add computed fields
  const enriched = allEpisodes.map((ep) => ({
    ...ep,
    has_transcript: transcriptIds.has(ep.id as string),
    transcript_length: 0,
    versions: versionsByEpisode.get(ep.id as string) || [],
  }));

  return NextResponse.json({ episodes: enriched });
}
