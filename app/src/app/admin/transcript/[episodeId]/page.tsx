import { isAdminAuthenticated } from "@/lib/admin/auth";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { formatCost, formatTokens } from "@/lib/ai/cost";

export const revalidate = 0;

export default async function EpisodeDetailPage({
  params,
}: {
  params: Promise<{ episodeId: string }>;
}) {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) redirect("/admin/login");

  const { episodeId } = await params;
  const supabase = createAdminClient();

  const { data: episode } = await supabase
    .from("episodes")
    .select("*")
    .eq("id", episodeId)
    .single();

  if (!episode) {
    return (
      <div className="py-12 text-center text-zinc-500">
        Episode not found.{" "}
        <Link href="/admin/batch" className="text-blue-600 underline">
          Back to batch
        </Link>
      </div>
    );
  }

  const { data: show } = await supabase
    .from("shows")
    .select("id, name")
    .eq("id", episode.show_id)
    .single();

  const { data: insights } = await supabase
    .from("insights")
    .select("position, content")
    .eq("episode_id", episodeId)
    .order("position");

  const { data: episodeTopics } = await supabase
    .from("episode_topics")
    .select("topic_id, topics(name, slug)")
    .eq("episode_id", episodeId);

  const { data: auditLog } = await supabase
    .from("processing_audit_log")
    .select("*")
    .eq("episode_id", episodeId)
    .order("created_at", { ascending: false });

  const publishedDate = episode.published_at
    ? new Date(episode.published_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const charCount = episode.transcript_text?.length || 0;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <Link
          href={show ? `/admin/batch/${show.id}` : "/admin/batch"}
          className="text-sm text-zinc-400 hover:text-zinc-600"
        >
          &larr; Back to {show?.name || "Batch"}
        </Link>
      </div>

      {/* Header with thumbnail */}
      <div className="mb-8">
        <div className="flex gap-6">
          {episode.thumbnail_url && (
            <div className="flex-shrink-0">
              <img
                src={episode.thumbnail_url}
                alt={episode.title}
                className="h-32 w-56 rounded-lg object-cover"
              />
            </div>
          )}
          <div className="flex-1">
            <h1 className="text-2xl font-bold leading-tight text-zinc-900">
              {episode.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-500">
              {show && <span className="font-medium text-zinc-700">{show.name}</span>}
              {episode.guest_name && (
                <span>Guest: <span className="font-medium">{episode.guest_name}</span></span>
              )}
              {publishedDate && <span>{publishedDate}</span>}
              {episode.duration_display && <span>{episode.duration_display}</span>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-400">
              {episode.view_count != null && (
                <span>{episode.view_count.toLocaleString()} views</span>
              )}
              {episode.like_count != null && (
                <span>{episode.like_count.toLocaleString()} likes</span>
              )}
              {episode.comment_count != null && (
                <span>{episode.comment_count.toLocaleString()} comments</span>
              )}
              {charCount > 0 && <span>{(charCount / 1000).toFixed(0)}k chars</span>}
            </div>
            {episode.youtube_url && (
              <div className="mt-2">
                <a href={episode.youtube_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
                  Watch on YouTube &rarr;
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status pills */}
      <div className="mb-6 flex flex-wrap gap-3">
        <Pill label="Processing" value={episode.processing_status} color={episode.processing_status === "completed" ? "green" : episode.processing_status === "failed" ? "red" : "zinc"} />
        <Pill label="Type" value={episode.content_type || "episode"} color={episode.content_type === "short" ? "purple" : "blue"} />
        {episode.ai_model_used && <Pill label="Model" value={episode.ai_model_used} color="zinc" />}
        {episode.transcript_lang && <Pill label="Lang" value={episode.transcript_lang} color="zinc" />}
      </div>

      {/* Insights */}
      {insights && insights.length > 0 && (
        <Section title="Key Insights">
          <ol className="space-y-2">
            {insights.map((i: { position: number; content: unknown }) => (
              <li key={i.position} className="flex gap-3 text-sm">
                <span className="flex-shrink-0 text-zinc-400">{i.position}.</span>
                <span className="text-zinc-700">
                  {typeof i.content === "string" ? i.content : typeof i.content === "object" && i.content !== null ? (i.content as Record<string, string>).heading || (i.content as Record<string, string>).summary || JSON.stringify(i.content) : String(i.content)}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* Topics */}
      {episodeTopics && episodeTopics.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Topics</h2>
          <div className="flex flex-wrap gap-2">
            {episodeTopics.map((et: Record<string, unknown>) => {
              const topic = et.topics as { name: string; slug: string } | null;
              return topic ? (
                <span key={et.topic_id as string} className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">{topic.name}</span>
              ) : null;
            })}
          </div>
        </div>
      )}

      {/* Description */}
      {episode.description && (
        <Section title="YouTube Description">
          <div className="max-h-48 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-zinc-600">
            {episode.description}
          </div>
        </Section>
      )}

      {/* Tags */}
      {episode.youtube_tags && episode.youtube_tags.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Tags</h2>
          <div className="flex flex-wrap gap-1.5">
            {episode.youtube_tags.map((tag: string) => (
              <span key={tag} className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">{tag}</span>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {episode.processing_error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
          <h2 className="mb-1 text-sm font-semibold text-red-700">Processing Error</h2>
          <pre className="whitespace-pre-wrap text-xs text-red-600">{episode.processing_error}</pre>
        </div>
      )}

      {/* Summary */}
      {episode.summary && (
        <Section title="Summary">
          <p className="text-sm leading-relaxed text-zinc-700">{episode.summary}</p>
        </Section>
      )}

      {/* Processing History */}
      <Section title="Processing History">
        {/* Cost summary */}
        {(episode.input_tokens || episode.output_tokens || episode.processing_cost || episode.processing_duration_ms) && (
          <div className="mb-4 flex flex-wrap gap-4 rounded-lg bg-zinc-50 px-4 py-3 text-sm">
            {episode.input_tokens != null && episode.input_tokens > 0 && (
              <div>
                <span className="text-zinc-400">Input:</span>{" "}
                <span className="font-medium text-zinc-700">{formatTokens(episode.input_tokens)} tokens</span>
              </div>
            )}
            {episode.output_tokens != null && episode.output_tokens > 0 && (
              <div>
                <span className="text-zinc-400">Output:</span>{" "}
                <span className="font-medium text-zinc-700">{formatTokens(episode.output_tokens)} tokens</span>
              </div>
            )}
            {episode.processing_cost != null && episode.processing_cost > 0 && (
              <div>
                <span className="text-zinc-400">Cost:</span>{" "}
                <span className="font-medium text-green-700">{formatCost(episode.processing_cost)}</span>
              </div>
            )}
            {episode.processing_duration_ms != null && episode.processing_duration_ms > 0 && (
              <div>
                <span className="text-zinc-400">Duration:</span>{" "}
                <span className="font-medium text-zinc-700">
                  {episode.processing_duration_ms < 1000
                    ? `${episode.processing_duration_ms}ms`
                    : episode.processing_duration_ms < 60000
                      ? `${(episode.processing_duration_ms / 1000).toFixed(1)}s`
                      : `${Math.floor(episode.processing_duration_ms / 60000)}m ${Math.floor((episode.processing_duration_ms % 60000) / 1000)}s`}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Audit timeline */}
        {auditLog && auditLog.length > 0 ? (
          <div className="overflow-hidden rounded border border-zinc-200">
            <table className="w-full text-xs">
              <thead className="border-b bg-zinc-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-zinc-600">Timestamp</th>
                  <th className="px-3 py-2 text-left font-medium text-zinc-600">Event</th>
                  <th className="px-3 py-2 text-left font-medium text-zinc-600">Model</th>
                  <th className="px-3 py-2 text-right font-medium text-zinc-600">Tokens</th>
                  <th className="px-3 py-2 text-right font-medium text-zinc-600">Cost</th>
                  <th className="px-3 py-2 text-right font-medium text-zinc-600">Duration</th>
                  <th className="px-3 py-2 text-left font-medium text-zinc-600">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {auditLog.map((entry: Record<string, unknown>, idx: number) => (
                  <tr key={idx} className="hover:bg-zinc-50">
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-500">
                      {entry.created_at
                        ? new Date(entry.created_at as string).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })
                        : "\u2014"}
                    </td>
                    <td className="px-3 py-2">
                      <AuditEventBadge event={entry.event_type as string} />
                    </td>
                    <td className="px-3 py-2 text-zinc-500">
                      {(entry.model as string) || "\u2014"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-zinc-500 tabular-nums">
                      {(entry.input_tokens as number) || (entry.output_tokens as number)
                        ? `${formatTokens((entry.input_tokens as number) || 0)} / ${formatTokens((entry.output_tokens as number) || 0)}`
                        : "\u2014"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-zinc-500 tabular-nums">
                      {(entry.cost as number) ? formatCost(entry.cost as number) : "\u2014"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-zinc-500 tabular-nums">
                      {(entry.duration_ms as number)
                        ? (entry.duration_ms as number) < 1000
                          ? `${entry.duration_ms}ms`
                          : `${((entry.duration_ms as number) / 1000).toFixed(1)}s`
                        : "\u2014"}
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2 text-red-600" title={(entry.error_message as string) || ""}>
                      {(entry.error_message as string) || "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-zinc-400">No processing history available.</p>
        )}
      </Section>

      {/* Transcript */}
      <div className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Full Transcript</h2>
        {episode.transcript_text ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="whitespace-pre-wrap text-[15px] leading-[1.8] text-zinc-700" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
              {episode.transcript_text}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-6 py-12 text-center text-zinc-400">
            No transcript available.
          </div>
        )}
      </div>
    </div>
  );
}

function Pill({ label, value, color }: { label: string; value: string; color: "green" | "red" | "blue" | "purple" | "zinc" }) {
  const c = { green: "bg-green-100 text-green-700", red: "bg-red-100 text-red-700", blue: "bg-blue-100 text-blue-700", purple: "bg-purple-100 text-purple-700", zinc: "bg-zinc-100 text-zinc-600" };
  return <div className={`rounded-full px-3 py-1 text-xs font-medium ${c[color]}`}>{label}: {value}</div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 rounded-lg border border-zinc-200 p-4">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
      {children}
    </div>
  );
}

function AuditEventBadge({ event }: { event: string }) {
  const styles: Record<string, string> = {
    processing_started: "bg-blue-100 text-blue-700",
    ai_call_completed: "bg-green-100 text-green-700",
    processing_completed: "bg-green-100 text-green-700",
    processing_failed: "bg-red-100 text-red-700",
    processing_cancelled: "bg-amber-100 text-amber-700",
  };

  const label = event
    ? event.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Unknown";

  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${styles[event] || "bg-zinc-100 text-zinc-600"}`}
    >
      {label}
    </span>
  );
}
