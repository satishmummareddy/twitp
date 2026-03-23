import { isAdminAuthenticated } from "@/lib/admin/auth";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { WorkflowPanel } from "./_components/workflow-panel-loader";

export const revalidate = 0;

export default async function ShowProcessingPage({
  params,
}: {
  params: Promise<{ showId: string }>;
}) {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) redirect("/admin/login");

  const { showId } = await params;
  const supabase = createAdminClient();

  // Get show
  const { data: show } = await supabase
    .from("shows")
    .select("*")
    .eq("id", showId)
    .single();

  if (!show) {
    return (
      <div className="py-12 text-center text-zinc-500">
        Show not found.{" "}
        <Link href="/admin/batch" className="text-blue-600 underline">
          Back to batch
        </Link>
      </div>
    );
  }

  // Get episode stats — all videos (for total) and episodes only (for workflow status)
  const { count: totalAll } = await supabase
    .from("episodes")
    .select("id", { count: "exact", head: true })
    .eq("show_id", showId);

  const { count: episodeCount } = await supabase
    .from("episodes")
    .select("id", { count: "exact", head: true })
    .eq("show_id", showId)
    .eq("content_type", "episode");

  const { count: withTranscript } = await supabase
    .from("episodes")
    .select("id", { count: "exact", head: true })
    .eq("show_id", showId)
    .eq("content_type", "episode")
    .neq("transcript_text", "")
    .not("transcript_text", "is", null);

  const { count: completed } = await supabase
    .from("episodes")
    .select("id", { count: "exact", head: true })
    .eq("show_id", showId)
    .eq("content_type", "episode")
    .eq("processing_status", "completed");

  const { count: failed } = await supabase
    .from("episodes")
    .select("id", { count: "exact", head: true })
    .eq("show_id", showId)
    .eq("content_type", "episode")
    .eq("processing_status", "failed");

  const { count: pending } = await supabase
    .from("episodes")
    .select("id", { count: "exact", head: true })
    .eq("show_id", showId)
    .eq("content_type", "episode")
    .eq("processing_status", "pending");

  const stats = {
    total: totalAll || 0,
    episodeCount: episodeCount || 0,
    withTranscript: withTranscript || 0,
    completed: completed || 0,
    failed: failed || 0,
    pending: pending || 0,
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/admin/batch"
          className="text-sm text-zinc-400 hover:text-zinc-600"
        >
          ← Batch
        </Link>
        <span className="text-zinc-300">/</span>
        <h1 className="text-2xl font-bold">{show.name}</h1>
      </div>

      {/* Stats Bar */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <MiniStat label="Episodes" value={stats.episodeCount} />
        <MiniStat label="Transcripts" value={stats.withTranscript} color="blue" />
        <MiniStat label="Processed" value={stats.completed} color="green" />
        <MiniStat label="Failed" value={stats.failed} color="red" />
        <MiniStat label="Pending" value={stats.pending} color="zinc" />
      </div>

      {/* Workflow Panel (client component) */}
      <WorkflowPanel
        showId={showId}
        showName={show.name}
        channelId={show.youtube_channel_id || ""}
        playlistId={show.youtube_playlist_id || ""}
        stats={stats}
      />
    </div>
  );
}

function MiniStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: "green" | "red" | "blue" | "zinc";
}) {
  const colorClass =
    color === "green"
      ? "text-green-600"
      : color === "red"
        ? "text-red-600"
        : color === "blue"
          ? "text-blue-600"
          : color === "zinc"
            ? "text-zinc-400"
            : "text-zinc-900";

  return (
    <div className="rounded-lg border border-zinc-200 px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${colorClass}`}>{value}</div>
    </div>
  );
}
