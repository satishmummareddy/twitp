import Link from "next/link";
import Image from "next/image";

export interface EpisodeData {
  id: string;
  title: string;
  slug: string;
  guest_name: string | null;
  summary: string | null;
  youtube_url: string | null;
  thumbnail_url: string | null;
  duration_display: string | null;
  published_at: string | null;
  created_at?: string;
  shows: { name: string; slug: string };
  insights: { position: number; content: string }[];
}

// Consistent colors for show name badges
const SHOW_COLORS: Record<string, string> = {};
const COLOR_PALETTE = [
  "bg-blue-50 text-blue-700 border-blue-200",
  "bg-purple-50 text-purple-700 border-purple-200",
  "bg-emerald-50 text-emerald-700 border-emerald-200",
  "bg-amber-50 text-amber-700 border-amber-200",
  "bg-rose-50 text-rose-700 border-rose-200",
  "bg-cyan-50 text-cyan-700 border-cyan-200",
  "bg-indigo-50 text-indigo-700 border-indigo-200",
  "bg-orange-50 text-orange-700 border-orange-200",
];

function getShowColor(showName: string): string {
  if (!SHOW_COLORS[showName]) {
    const index = Object.keys(SHOW_COLORS).length % COLOR_PALETTE.length;
    SHOW_COLORS[showName] = COLOR_PALETTE[index];
  }
  return SHOW_COLORS[showName];
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
  const showColor = getShowColor(showName);

  return (
    <article className="overflow-hidden rounded-lg border border-zinc-200 transition-shadow hover:shadow-md dark:border-zinc-800">
      <div className="flex">
        {/* Thumbnail */}
        {episode.thumbnail_url && (
          <div className="hidden sm:block sm:w-44 md:w-52 shrink-0">
            <a
              href={episode.youtube_url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="block h-full"
            >
              <Image
                src={episode.thumbnail_url}
                alt={episode.guest_name || episode.title}
                width={480}
                height={360}
                className="h-full w-full object-cover"
                unoptimized
              />
            </a>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 p-4 sm:p-5">
          {/* Top row: show badge + meta */}
          <div className="flex flex-wrap items-center gap-2">
            {!hideShowName && (
              <Link href={`/shows/${showSlug}`}>
                <span
                  className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${showColor}`}
                >
                  {showName}
                </span>
              </Link>
            )}
            <span className="text-xs text-zinc-400">
              {formatDate(episode.published_at || episode.created_at)}
            </span>
            {episode.duration_display && (
              <>
                <span className="text-zinc-300 dark:text-zinc-600">&middot;</span>
                <span className="text-xs text-zinc-400">
                  {episode.duration_display}
                </span>
              </>
            )}
          </div>

          {/* Guest name */}
          {episode.guest_name && (
            <div className="mt-1.5 text-sm font-bold text-zinc-900 dark:text-zinc-100">
              {episode.guest_name}
            </div>
          )}

          {/* Title */}
          <h3 className="mt-0.5 text-sm font-medium leading-snug text-zinc-700 dark:text-zinc-300">
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

          {/* Summary */}
          {episode.summary && (
            <p className="mt-1.5 text-xs text-zinc-500 line-clamp-2">
              {episode.summary}
            </p>
          )}

          {/* Insights */}
          {episode.insights && episode.insights.length > 0 && (
            <ul className="mt-3 space-y-1">
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
        </div>
      </div>
    </article>
  );
}

export function groupByWeek(
  episodes: EpisodeData[]
): Map<string, EpisodeData[]> {
  const groups = new Map<string, EpisodeData[]>();
  for (const ep of episodes) {
    const label = getWeekLabel(
      ep.published_at || ep.created_at || new Date().toISOString()
    );
    const group = groups.get(label) ?? [];
    group.push(ep);
    groups.set(label, group);
  }
  return groups;
}

function getWeekLabel(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "Unknown Date";
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
