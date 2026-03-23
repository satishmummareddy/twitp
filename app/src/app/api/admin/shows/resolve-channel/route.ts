import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";

/**
 * POST /api/admin/shows/resolve-channel
 * Resolves a YouTube channel URL or handle to a channel ID via Supadata.
 * Accepts:
 *   - Full URL: https://www.youtube.com/@LennysPodcast
 *   - Full URL: https://www.youtube.com/channel/UCxyz
 *   - Handle: @LennysPodcast
 *   - Channel ID: UCxyz (returned as-is)
 */
export async function POST(request: NextRequest) {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { input } = await request.json();
    if (!input || typeof input !== "string") {
      return NextResponse.json({ error: "input is required" }, { status: 400 });
    }

    const trimmed = input.trim();

    // Case 1: Already a channel ID (starts with UC)
    if (/^UC[\w-]{20,}$/.test(trimmed)) {
      return NextResponse.json({ channelId: trimmed, source: "direct" });
    }

    // Case 2: URL containing /channel/UCxyz
    const channelMatch = trimmed.match(/youtube\.com\/channel\/(UC[\w-]+)/);
    if (channelMatch) {
      return NextResponse.json({ channelId: channelMatch[1], source: "url" });
    }

    // Case 3: Handle or URL with @ — resolve via Supadata
    // Extract handle from URL or use as-is
    let handle = trimmed;
    const handleMatch = trimmed.match(/youtube\.com\/@([\w.-]+)/);
    if (handleMatch) {
      handle = handleMatch[1];
    } else if (handle.startsWith("@")) {
      handle = handle.slice(1);
    }

    // Use Supadata to resolve handle to channel ID
    const apiKey = process.env.SUPADATA_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "SUPADATA_API_KEY not configured" },
        { status: 500 }
      );
    }

    // Try fetching channel info via Supadata using the YouTube URL
    const youtubeUrl = `https://www.youtube.com/@${handle}`;
    const res = await fetch(
      `https://api.supadata.ai/v1/youtube/channel?id=${encodeURIComponent(youtubeUrl)}`,
      {
        headers: { "x-api-key": apiKey },
      }
    );

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json(
        { error: `Failed to resolve channel: ${err}` },
        { status: 400 }
      );
    }

    const data = await res.json();
    if (data.id) {
      return NextResponse.json({
        channelId: data.id,
        channelTitle: data.title,
        source: "supadata",
      });
    }

    return NextResponse.json(
      { error: "Could not resolve channel ID from the provided input" },
      { status: 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
