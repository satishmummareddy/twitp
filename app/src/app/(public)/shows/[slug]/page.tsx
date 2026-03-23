import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  EpisodeCard,
  type EpisodeData,
  groupByWeek,
} from "../../../_components/episode-card";

export const dynamic = "force-dynamic";

export default async function ShowPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createAdminClient();

  const { data: show } = await supabase
    .from("shows")
    .select("id, name, description, host_name")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!show) notFound();

  const { data: episodes } = await supabase
    .from("episodes")
    .select(
      `id, title, slug, guest_name, summary, youtube_url, duration_display, published_at,
       shows(name, slug),
       insights(position, content)`
    )
    .eq("show_id", show.id)
    .eq("is_published", true)
    .eq("processing_status", "completed")
    .order("published_at", { ascending: false })
    .limit(100);

  const typed = (episodes ?? []) as unknown as EpisodeData[];
  for (const ep of typed) {
    ep.insights?.sort((a, b) => a.position - b.position);
  }

  const weekGroups = groupByWeek(typed);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{show.name}</h1>
        {show.host_name && (
          <p className="mt-1 text-sm text-zinc-500">
            Hosted by {show.host_name}
          </p>
        )}
        {show.description && (
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            {show.description}
          </p>
        )}
        <p className="mt-2 text-sm text-zinc-500">
          {typed.length} episode{typed.length !== 1 ? "s" : ""}
        </p>
      </div>

      {typed.length === 0 ? (
        <p className="text-zinc-500">No episodes processed yet.</p>
      ) : (
        Array.from(weekGroups.entries()).map(([weekLabel, eps]) => (
          <section key={weekLabel} className="mb-10">
            <h2 className="mb-4 text-lg font-semibold text-zinc-800 dark:text-zinc-200">
              {weekLabel}
            </h2>
            <div className="space-y-4">
              {eps.map((ep) => (
                <EpisodeCard key={ep.id} episode={ep} hideShowName />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
