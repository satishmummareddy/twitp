import { fetchPublishedEpisodes } from "@/lib/queries/episodes";
import { EpisodeList } from "../_components/episode-list";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

export default async function HomePage() {
  const { episodes, nextCursor } = await fetchPublishedEpisodes({
    limit: PAGE_SIZE,
  });

  if (episodes.length === 0) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-3xl font-bold">This Week in Tech Podcasts</h1>
        <p className="mt-3 text-zinc-500">
          No episodes yet. Check back soon!
        </p>
      </div>
    );
  }

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

      <EpisodeList initialEpisodes={episodes} initialCursor={nextCursor} />
    </div>
  );
}
