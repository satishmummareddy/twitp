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

  // Add computed fields
  const enriched = allEpisodes.map((ep) => ({
    ...ep,
    has_transcript: transcriptIds.has(ep.id as string),
    transcript_length: 0,
  }));

  return NextResponse.json({ episodes: enriched });
}
