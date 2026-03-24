import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = Math.min(parseInt(searchParams.get("limit") || "30", 10), 50);

  const supabase = createAdminClient();

  let query = supabase
    .from("episodes")
    .select(
      "id, title, slug, guest_name, summary, youtube_url, thumbnail_url, duration_display, published_at, created_at, shows(name, slug), insights(position, content)"
    )
    .eq("is_published", true)
    .eq("processing_status", "completed")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("published_at", cursor);
  }

  const { data: episodes, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sort insights by position
  const sorted = (episodes || []).map((ep) => ({
    ...ep,
    insights: (ep.insights || []).sort(
      (a: { position: number }, b: { position: number }) =>
        a.position - b.position
    ),
  }));

  // Compute next cursor from last episode
  const nextCursor =
    sorted.length === limit
      ? sorted[sorted.length - 1].published_at
      : null;

  return NextResponse.json({ episodes: sorted, nextCursor });
}
