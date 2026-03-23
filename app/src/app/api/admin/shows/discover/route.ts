import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";

/**
 * POST /api/admin/shows/discover
 * Trigger episode discovery from YouTube channel or playlist.
 */
export async function POST(request: NextRequest) {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { showId, channelId, playlistId, maxPages } = await request.json();

    if (!showId) {
      return NextResponse.json(
        { error: "showId is required" },
        { status: 400 }
      );
    }

    if (!channelId && !playlistId) {
      // Check if show has a channel ID already
      const supabase = createAdminClient();
      const { data: show } = await supabase
        .from("shows")
        .select("youtube_channel_id")
        .eq("id", showId)
        .single();

      if (!show?.youtube_channel_id) {
        return NextResponse.json(
          { error: "channelId or playlistId is required (or set youtube_channel_id on the show)" },
          { status: 400 }
        );
      }
    }

    // Save channelId to show if provided
    const supabase = createAdminClient();
    if (channelId) {
      await supabase
        .from("shows")
        .update({ youtube_channel_id: channelId })
        .eq("id", showId);
    }

    // Create a processing job to track discovery
    const { data: job } = await supabase
      .from("processing_jobs")
      .insert({
        show_id: showId,
        job_type: "discover_episodes",
        status: "running",
        progress_total: 0,
        progress_current: 0,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    // Send Inngest event
    await inngest.send({
      name: "show/discover.requested",
      data: {
        showId,
        channelId: channelId || null,
        playlistId: playlistId || null,
        maxPages: maxPages || 100,
        jobId: job?.id,
      },
    });

    return NextResponse.json({
      jobId: job?.id,
      message: "Discovery started",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
