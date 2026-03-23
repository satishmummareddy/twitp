import { createAdminClient } from "@/lib/supabase/admin";
import {
  EpisodeCard,
  type EpisodeData,
  groupByWeek,
} from "../_components/episode-card";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = createAdminClient();

  const { data: episodes } = await supabase
    .from("episodes")
    .select(
      `id, title, slug, guest_name, summary, youtube_url, duration_display, created_at,
       shows(name, slug),
       insights(position, content)`
    )
    .eq("is_published", true)
    .eq("processing_status", "completed")
    .order("created_at", { ascending: false })
    .limit(50);

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

  const weekGroups = groupByWeek(typed);

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

      {Array.from(weekGroups.entries()).map(([weekLabel, eps]) => (
        <section key={weekLabel} className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-zinc-800 dark:text-zinc-200">
            {weekLabel}
          </h2>
          <div className="space-y-4">
            {eps.map((ep) => (
              <EpisodeCard key={ep.id} episode={ep} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
