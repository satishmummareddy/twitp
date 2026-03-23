import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ episodeId: string }> }
) {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { episodeId } = await params;
  const supabase = createAdminClient();

  const { data: episode, error } = await supabase
    .from("episodes")
    .select(
      "id, title, published_at, duration_display, duration_seconds, youtube_url, transcript_text, show_id"
    )
    .eq("id", episodeId)
    .single();

  if (error || !episode) {
    return NextResponse.json(
      { error: error?.message || "Episode not found" },
      { status: error ? 500 : 404 }
    );
  }

  // Get the show name
  const { data: show } = await supabase
    .from("shows")
    .select("name")
    .eq("id", episode.show_id)
    .single();

  return NextResponse.json({
    title: episode.title,
    showName: show?.name || "Unknown Show",
    publishedAt: episode.published_at,
    duration: episode.duration_display || null,
    transcript: episode.transcript_text || null,
    youtubeUrl: episode.youtube_url || null,
  });
}
