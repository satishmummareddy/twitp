import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchPublishedEpisodes } from "@/lib/queries/episodes";
import {
  EpisodeCard,
  groupByWeek,
} from "../../../_components/episode-card";

export const dynamic = "force-dynamic";

export default async function TopicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createAdminClient();

  const { data: topic } = await supabase
    .from("topics")
    .select("id, name")
    .eq("slug", slug)
    .single();

  if (!topic) notFound();

  const { episodes } = await fetchPublishedEpisodes({
    topicSlug: slug,
    limit: 200,
  });

  const weekGroups = groupByWeek(episodes);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{topic.name}</h1>
        <p className="mt-2 text-sm text-zinc-500">
          {episodes.length} episode{episodes.length !== 1 ? "s" : ""}
        </p>
      </div>

      {episodes.length === 0 ? (
        <p className="text-zinc-500">No episodes for this topic yet.</p>
      ) : (
        Array.from(weekGroups.entries()).map(([weekLabel, eps]) => (
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
        ))
      )}
    </div>
  );
}
