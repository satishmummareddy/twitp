import { isAdminAuthenticated } from "@/lib/admin/auth";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";

export const revalidate = 0;

export default async function TranscriptViewerPage({
  params,
}: {
  params: Promise<{ episodeId: string }>;
}) {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) redirect("/admin/login");

  const { episodeId } = await params;
  const supabase = createAdminClient();

  // Get episode with transcript
  const { data: episode } = await supabase
    .from("episodes")
    .select(
      "id, title, published_at, duration_display, youtube_url, transcript_text, show_id"
    )
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

  // Get the show for the back link and show name
  const { data: show } = await supabase
    .from("shows")
    .select("id, name")
    .eq("id", episode.show_id)
    .single();

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
      {/* Back link */}
      <div className="mb-6">
        <Link
          href={show ? `/admin/batch/${show.id}` : "/admin/batch"}
          className="text-sm text-zinc-400 hover:text-zinc-600"
        >
          &larr; Back to {show?.name || "Batch"}
        </Link>
      </div>

      {/* Episode header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold leading-tight text-zinc-900">
          {episode.title}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-500">
          {show && <span className="font-medium text-zinc-700">{show.name}</span>}
          {publishedDate && <span>{publishedDate}</span>}
          {episode.duration_display && (
            <span>{episode.duration_display}</span>
          )}
          {charCount > 0 && (
            <span className="text-zinc-400">
              {(charCount / 1000).toFixed(0)}k characters
            </span>
          )}
        </div>

        {episode.youtube_url && (
          <div className="mt-2">
            <a
              href={episode.youtube_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline"
            >
              Watch on YouTube &rarr;
            </a>
          </div>
        )}
      </div>

      {/* Transcript */}
      {episode.transcript_text ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="prose prose-zinc max-w-none">
            <div
              className="whitespace-pre-wrap text-[15px] leading-[1.8] text-zinc-700"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
            >
              {episode.transcript_text}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-6 py-12 text-center text-zinc-400">
          No transcript available for this episode.
        </div>
      )}
    </div>
  );
}
