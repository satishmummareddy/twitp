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
    <article className="rounded-lg border border-zinc-200 transition-shadow hover:shadow-md dark:border-zinc-800">
      {/* Header: title, show, guest, meta + thumbnail */}
      <div className="flex items-start gap-3 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <div className="min-w-0 flex-1">
          {/* Episode title */}
          <h3 className="text-base font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
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

          {/* Show name + Guest name */}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {!hideShowName && (
              <Link href={`/shows/${showSlug}`}>
                <span
                  className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${showColor}`}
                >
                  {showName}
                </span>
              </Link>
            )}
            {episode.guest_name && (
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {episode.guest_name}
              </span>
            )}
          </div>

          {/* Date + duration */}
          <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
            <span>
              {formatDate(episode.published_at || episode.created_at)}
            </span>
            {episode.duration_display && (
              <>
                <span className="text-zinc-300 dark:text-zinc-600">&middot;</span>
                <span>{episode.duration_display}</span>
              </>
            )}
          </div>
        </div>

        {/* Thumbnail */}
        {episode.thumbnail_url && (
          <a
            href={episode.youtube_url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0"
          >
            <Image
              src={episode.thumbnail_url}
              alt={episode.guest_name || episode.title}
              width={96}
              height={72}
              className="rounded object-cover"
              unoptimized
            />
          </a>
        )}
      </div>

      {/* Details: summary + insights */}
      <div className="px-4 py-3">
        {episode.summary && (
          <p className="text-xs text-zinc-500 line-clamp-2">
            {episode.summary}
          </p>
        )}

        {episode.insights && episode.insights.length > 0 && (
          <ul className="mt-2.5 space-y-2">
            {episode.insights.map((insight) => {
              const parsed = parseInsightContent(insight.content);
              return (
                <li
                  key={insight.position}
                  className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    {insight.position}
                  </span>
                  {parsed.heading ? (
                    <div className="min-w-0">
                      <span className="font-semibold">{parsed.heading}</span>
                      {parsed.summary && (
                        <span className="text-zinc-500"> — {parsed.summary}</span>
                      )}
                    </div>
                  ) : (
                    <span>{typeof insight.content === "string" ? insight.content : JSON.stringify(insight.content)}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </article>
  );
}

/**
 * Parse insight content — handles plain text, JSON strings, and pre-parsed objects.
 * Supports: {"heading": "...", "summary": "...", "explanation": "...", ...}
 * Also handles nested: {"content": {"heading": "...", ...}}
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseInsightContent(content: any): {
  heading: string | null;
  summary: string | null;
  explanation: string | null;
} {
  // Already a parsed object (from episode_versions JSONB)
  if (typeof content === "object" && content !== null) {
    // Handle nested: { content: { heading, summary } }
    const obj = content.content && typeof content.content === "object" ? content.content : content;
    return {
      heading: (obj.heading || obj.title || obj.insight || "").replace(/\*\*/g, "").trim() || null,
      summary: obj.summary || null,
      explanation: obj.explanation || null,
    };
  }

  if (typeof content !== "string") return { heading: null, summary: null, explanation: null };

  // Try parsing as JSON string
  try {
    const trimmed = content.trim();
    if (trimmed.startsWith("{")) {
      const parsed = JSON.parse(trimmed);
      return parseInsightContent(parsed); // Recurse to handle object
    }
  } catch {
    // Not JSON — treat as plain text
  }

  return { heading: null, summary: null, explanation: null };
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
