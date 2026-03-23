import Link from "next/link";

export interface EpisodeData {
  id: string;
  title: string;
  slug: string;
  guest_name: string | null;
  summary: string | null;
  youtube_url: string | null;
  duration_display: string | null;
  published_at: string;
  shows: { name: string; slug: string };
  insights: { position: number; content: string }[];
}

export function EpisodeCard({
  episode,
  hideShowName,
}: {
  episode: EpisodeData;
  hideShowName?: boolean;
}) {
  const showName =
    typeof episode.shows === "object" && episode.shows
      ? episode.shows.name
      : "Unknown Show";
  const showSlug =
    typeof episode.shows === "object" && episode.shows
      ? episode.shows.slug
      : "";

  return (
    <article className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            {!hideShowName &&
              (showSlug ? (
                <Link
                  href={`/shows/${showSlug}`}
                  className="font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
                >
                  {showName}
                </Link>
              ) : (
                <span className="font-medium">{showName}</span>
              ))}
            {episode.guest_name && (
              <>
                {!hideShowName && (
                  <span className="text-zinc-300 dark:text-zinc-600">·</span>
                )}
                <span>{episode.guest_name}</span>
              </>
            )}
            {episode.duration_display && (
              <>
                <span className="text-zinc-300 dark:text-zinc-600">·</span>
                <span>{episode.duration_display}</span>
              </>
            )}
          </div>

          <h3 className="mt-1 text-base font-semibold leading-snug">
            {episode.youtube_url ? (
              <a
                href={episode.youtube_url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-600 dark:hover:text-blue-400"
              >
                {episode.title}
              </a>
            ) : (
              episode.title
            )}
          </h3>

          {episode.summary && (
            <p className="mt-1 text-sm text-zinc-500 line-clamp-2">
              {episode.summary}
            </p>
          )}
        </div>
      </div>

      {episode.insights && episode.insights.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {episode.insights.map((insight) => (
            <li
              key={insight.position}
              className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300"
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                {insight.position}
              </span>
              <span>{insight.content}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function groupByWeek(
  episodes: EpisodeData[]
): Map<string, EpisodeData[]> {
  const groups = new Map<string, EpisodeData[]>();
  for (const ep of episodes) {
    const label = getWeekLabel(ep.published_at);
    const group = groups.get(label) ?? [];
    group.push(ep);
    groups.set(label, group);
  }
  return groups;
}

function getWeekLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() - date.getDay());

  const startOfThisWeek = new Date(now);
  startOfThisWeek.setDate(now.getDate() - now.getDay());

  const diff = Math.round(
    (startOfThisWeek.getTime() - startOfWeek.getTime()) /
      (7 * 24 * 60 * 60 * 1000)
  );

  if (diff === 0) return "This Week";
  if (diff === 1) return "Last Week";

  return startOfWeek.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
