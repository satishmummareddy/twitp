import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";

/**
 * POST /api/admin/shows/discover
 * Trigger episode discovery from YouTube channel or playlist.
 * Accepts channelId (UCxyz), YouTube URLs, or @handles — auto-resolves.
 */
export async function POST(request: NextRequest) {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { showId, channelId: rawChannelId, playlistId, maxPages } = await request.json();

    if (!showId) {
      return NextResponse.json(
        { error: "showId is required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    let resolvedChannelId = rawChannelId || null;

    // Auto-resolve if input looks like a URL or handle (not already a UC... ID)
    if (resolvedChannelId && !resolvedChannelId.match(/^UC[\w-]{20,}$/)) {
      const resolved = await resolveToChannelId(resolvedChannelId);
      if (!resolved) {
        return NextResponse.json(
          { error: `Could not resolve "${rawChannelId}" to a YouTube channel ID. Try pasting the channel URL.` },
          { status: 400 }
        );
      }
      resolvedChannelId = resolved.channelId;
    }

    if (!resolvedChannelId && !playlistId) {
      const { data: show } = await supabase
        .from("shows")
        .select("youtube_channel_id")
        .eq("id", showId)
        .single();

      if (show?.youtube_channel_id) {
        resolvedChannelId = show.youtube_channel_id;
      } else {
        return NextResponse.json(
          { error: "Please enter a YouTube channel URL, handle, or channel ID" },
          { status: 400 }
        );
      }
    }

    // Save channelId to show
    if (resolvedChannelId) {
      await supabase
        .from("shows")
        .update({ youtube_channel_id: resolvedChannelId })
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

    // Send Inngest event with resolved channel ID
    await inngest.send({
      name: "show/discover.requested",
      data: {
        showId,
        channelId: resolvedChannelId,
        playlistId: playlistId || null,
        maxPages: maxPages || 100,
        jobId: job?.id,
      },
    });

    return NextResponse.json({
      jobId: job?.id,
      channelId: resolvedChannelId,
      message: "Discovery started",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Resolve a YouTube URL, handle, or channel ID to a proper channel ID.
 */
async function resolveToChannelId(
  input: string
): Promise<{ channelId: string; title?: string } | null> {
  const trimmed = input.trim();

  // Already a channel ID
  if (/^UC[\w-]{20,}$/.test(trimmed)) {
    return { channelId: trimmed };
  }

  // URL with /channel/UCxyz
  const channelMatch = trimmed.match(/youtube\.com\/channel\/(UC[\w-]+)/);
  if (channelMatch) {
    return { channelId: channelMatch[1] };
  }

  // Extract handle from URL or use as-is
  let handle = trimmed;
  const handleMatch = trimmed.match(/youtube\.com\/@([\w.-]+)/);
  if (handleMatch) {
    handle = handleMatch[1];
  } else if (handle.startsWith("@")) {
    handle = handle.slice(1);
  }

  // Resolve via Supadata
  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) return null;

  try {
    const youtubeUrl = `https://www.youtube.com/@${handle}`;
    const res = await fetch(
      `https://api.supadata.ai/v1/youtube/channel?url=${encodeURIComponent(youtubeUrl)}`,
      { headers: { "x-api-key": apiKey } }
    );

    if (!res.ok) return null;

    const data = await res.json();
    if (data.id) {
      return { channelId: data.id, title: data.title };
    }
  } catch {
    // Ignore errors
  }

  return null;
}
