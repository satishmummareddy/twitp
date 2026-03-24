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

  // Use two queries: one for metadata (lightweight), one for transcript existence
  let query = supabase
    .from("episodes")
    .select(
      "id, title, slug, guest_name, published_at, duration_display, duration_seconds, view_count, like_count, thumbnail_url, youtube_url, processing_status, processing_error, summary, ai_model_used, content_type, input_tokens, output_tokens, processing_cost"
    )
    .eq("show_id", showId)
    .order("published_at", { ascending: false, nullsFirst: false });

  if (contentType) {
    query = query.eq("content_type", contentType);
  }

  // Fetch all rows — without transcript_text, each row is tiny so 2000+ is fine
  query = query.range(0, 4999);

  const { data: episodes, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get IDs of episodes that have transcripts (separate lightweight query)
  const { data: withTranscript } = await supabase
    .from("episodes")
    .select("id")
    .eq("show_id", showId)
    .not("transcript_text", "is", null)
    .neq("transcript_text", "")
    .range(0, 4999);

  const transcriptIds = new Set((withTranscript || []).map((e) => e.id));

  // Add computed fields
  const enriched = (episodes || []).map((ep) => ({
    ...ep,
    has_transcript: transcriptIds.has(ep.id),
    transcript_length: 0, // Not fetched for performance
  }));

  return NextResponse.json({ episodes: enriched });
}
