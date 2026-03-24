import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  EpisodeCard,
  type EpisodeData,
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

  // Get episode IDs for this topic
  const { data: episodeTopics } = await supabase
    .from("episode_topics")
    .select("episode_id")
    .eq("topic_id", topic.id);

  const episodeIds = (episodeTopics ?? []).map((et) => et.episode_id);

  if (episodeIds.length === 0) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">{topic.name}</h1>
          <p className="mt-2 text-zinc-500">No episodes for this topic yet.</p>
        </div>
      </div>
    );
  }

  const { data: episodes } = await supabase
    .from("episodes")
    .select(
      `id, title, slug, guest_name, summary, youtube_url, thumbnail_url, duration_display, published_at, created_at,
       shows(name, slug),
       insights(position, content)`
    )
    .in("id", episodeIds)
    .eq("is_published", true)
    .eq("processing_status", "completed")
    .order("published_at", { ascending: false });

  const typed = (episodes ?? []) as unknown as EpisodeData[];
  for (const ep of typed) {
    ep.insights?.sort((a, b) => a.position - b.position);
  }

  const weekGroups = groupByWeek(typed);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{topic.name}</h1>
        <p className="mt-2 text-sm text-zinc-500">
          {typed.length} episode{typed.length !== 1 ? "s" : ""}
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
