import { NextRequest, NextResponse } from "next/server";
import { fetchPublishedEpisodes } from "@/lib/queries/episodes";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor") || undefined;
  const limit = Math.min(parseInt(searchParams.get("limit") || "30", 10), 50);

  const { episodes, nextCursor } = await fetchPublishedEpisodes({
    cursor,
    limit,
  });

  return NextResponse.json({ episodes, nextCursor });
}
