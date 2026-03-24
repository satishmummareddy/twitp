import { createAdminClient } from "@/lib/supabase/admin";
import { type EpisodeData } from "../_components/episode-card";
import { EpisodeList } from "../_components/episode-list";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

export default async function HomePage() {
  const supabase = createAdminClient();

  const { data: episodes } = await supabase
    .from("episodes")
    .select(
      `id, title, slug, guest_name, summary, youtube_url, thumbnail_url, duration_display, published_at, created_at,
       shows(name, slug),
       insights(position, content)`
    )
    .eq("is_published", true)
    .eq("processing_status", "completed")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(PAGE_SIZE);

  if (!episodes || episodes.length === 0) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-3xl font-bold">This Week in Tech Podcasts</h1>
        <p className="mt-3 text-zinc-500">
          No episodes yet. Check back soon!
        </p>
      </div>
    );
  }

  const typed = episodes as unknown as EpisodeData[];
  for (const ep of typed) {
    ep.insights?.sort((a, b) => a.position - b.position);
  }

  // Compute cursor for client-side pagination
  const nextCursor =
    typed.length === PAGE_SIZE
      ? typed[typed.length - 1].published_at
      : null;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          This Week in Tech Podcasts
        </h1>
        <p className="mt-2 text-zinc-500">
          AI-powered insights from the best tech podcasts. Find episodes worth
          your time.
        </p>
      </div>

      <EpisodeList initialEpisodes={typed} initialCursor={nextCursor} />
    </div>
  );
}
