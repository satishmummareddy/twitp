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

  let query = supabase
    .from("episodes")
    .select(
      "id, title, slug, guest_name, published_at, duration_display, duration_seconds, view_count, like_count, thumbnail_url, youtube_url, processing_status, processing_error, transcript_text, summary, ai_model_used, content_type, input_tokens, output_tokens, processing_cost"
    )
    .eq("show_id", showId)
    .order("published_at", { ascending: false, nullsFirst: false });

  if (contentType) {
    query = query.eq("content_type", contentType);
  }

  // Supabase default limit is 1000 — fetch up to 2000 for large catalogs
  query = query.range(0, 1999);

  const { data: episodes, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Add computed fields
  const enriched = (episodes || []).map((ep) => ({
    ...ep,
    has_transcript: !!(ep.transcript_text && ep.transcript_text.length > 100),
    transcript_length: ep.transcript_text?.length || 0,
    // Don't send full transcript text to the UI
    transcript_text: undefined,
  }));

  return NextResponse.json({ episodes: enriched });
}
