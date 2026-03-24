import { isAdminAuthenticated } from "@/lib/admin/auth";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { BatchTabs } from "./_components/batch-tabs";
import { JobsTableLoader } from "./_components/jobs-table-loader";
import { formatCost } from "@/lib/ai/cost";

export const revalidate = 0;

export default async function BatchOverviewPage() {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) redirect("/admin/login");

  const supabase = createAdminClient();

  // Get all shows with processing stats
  const { data: shows } = await supabase
    .from("shows")
    .select("id, name, slug, youtube_channel_id, episode_count, is_active")
    .order("name");

  // Get episode stats per show
  const showStats: Record<
    string,
    { total: number; pending: number; completed: number; failed: number; hasTranscript: number }
  > = {};

  for (const show of shows || []) {
    const { count: total } = await supabase
      .from("episodes")
      .select("id", { count: "exact", head: true })
      .eq("show_id", show.id);

    const { count: completed } = await supabase
      .from("episodes")
      .select("id", { count: "exact", head: true })
      .eq("show_id", show.id)
      .eq("processing_status", "completed");

    const { count: failed } = await supabase
      .from("episodes")
      .select("id", { count: "exact", head: true })
      .eq("show_id", show.id)
      .eq("processing_status", "failed");

    const { count: pending } = await supabase
      .from("episodes")
      .select("id", { count: "exact", head: true })
      .eq("show_id", show.id)
      .eq("processing_status", "pending");

    showStats[show.id] = {
      total: total || 0,
      pending: pending || 0,
      completed: completed || 0,
      failed: failed || 0,
      hasTranscript: 0, // TODO: count episodes with transcripts
    };
  }

  // Get running jobs
  const { data: runningJobs } = await supabase
    .from("processing_jobs")
    .select("id, show_id, job_type, status, progress_current, progress_total")
    .eq("status", "running");

  // Get total cost from completed jobs
  const { data: costData } = await supabase
    .from("processing_jobs")
    .select("total_cost")
    .eq("status", "completed")
    .not("total_cost", "is", null);

  const totalCost = (costData || []).reduce((sum, j) => sum + (j.total_cost || 0), 0);

  // Aggregate stats
  const totalShows = shows?.length || 0;
  const totalEpisodes = Object.values(showStats).reduce((sum, s) => sum + s.total, 0);
  const totalCompleted = Object.values(showStats).reduce((sum, s) => sum + s.completed, 0);
  const totalFailed = Object.values(showStats).reduce((sum, s) => sum + s.failed, 0);
  const activeJobs = runningJobs?.length || 0;

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Batch Processing</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Manage episode discovery, transcript fetching, and AI processing for all shows.
      </p>

      {/* Summary Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-6">
        <StatCard label="Shows" value={totalShows} />
        <StatCard label="Total Episodes" value={totalEpisodes} />
        <StatCard label="Processed" value={totalCompleted} color="green" />
        <StatCard label="Failed" value={totalFailed} color="red" />
        <StatCard label="Active Jobs" value={activeJobs} color="blue" />
        <StatCard label="Total Cost" value={totalCost} color="green" isCost />
      </div>

      {/* Tabs: Shows + All Jobs */}
      <BatchTabs
        showsContent={
          <div className="overflow-hidden rounded-lg border border-zinc-200">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">Show</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-zinc-600">Episodes</th>
                  <th className="px-4 py-3 text-right font-medium text-zinc-600">Processed</th>
                  <th className="px-4 py-3 text-right font-medium text-zinc-600">Failed</th>
                  <th className="px-4 py-3 text-right font-medium text-zinc-600">Pending</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {(shows || []).map((show) => {
                  const stats = showStats[show.id];
                  const hasRunningJob = runningJobs?.some((j) => j.show_id === show.id);
                  const status = getShowStatus(stats, hasRunningJob);

                  return (
                    <tr key={show.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3">
                        <div className="font-medium">{show.name}</div>
                        {show.youtube_channel_id && (
                          <div className="text-xs text-zinc-400">
                            Channel: {show.youtube_channel_id.slice(0, 16)}...
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={status} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{stats.total}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-green-600">
                        {stats.completed}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-red-600">
                        {stats.failed > 0 ? stats.failed : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-zinc-400">
                        {stats.pending}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/batch/${show.id}`}
                          className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
                        >
                          Manage →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {(!shows || shows.length === 0) && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-zinc-400">
                      No shows yet.{" "}
                      <Link href="/admin/shows" className="text-blue-600 underline">
                        Add a show
                      </Link>{" "}
                      first.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        }
        jobsContent={
          <JobsTableLoader
            showNames={Object.fromEntries(
              (shows || []).map((s) => [s.id, s.name])
            )}
          />
        }
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  isCost,
}: {
  label: string;
  value: number;
  color?: "green" | "red" | "blue";
  isCost?: boolean;
}) {
  const colorClass =
    color === "green"
      ? "text-green-600"
      : color === "red"
        ? "text-red-600"
        : color === "blue"
          ? "text-blue-600"
          : "text-zinc-900";

  return (
    <div className="rounded-lg border border-zinc-200 p-4">
      <div className="text-xs font-medium text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${colorClass}`}>
        {isCost ? formatCost(value) : value}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    "Not Started": "bg-zinc-100 text-zinc-600",
    Discovering: "bg-blue-100 text-blue-700",
    Processing: "bg-amber-100 text-amber-700",
    Completed: "bg-green-100 text-green-700",
    "Has Failures": "bg-red-100 text-red-700",
  };

  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] || styles["Not Started"]}`}>
      {status}
    </span>
  );
}

function getShowStatus(
  stats: { total: number; pending: number; completed: number; failed: number },
  hasRunningJob?: boolean
): string {
  if (hasRunningJob) return "Processing";
  if (stats.total === 0) return "Not Started";
  if (stats.failed > 0) return "Has Failures";
  if (stats.completed === stats.total) return "Completed";
  if (stats.completed > 0 || stats.pending > 0) return "Processing";
  return "Not Started";
}
