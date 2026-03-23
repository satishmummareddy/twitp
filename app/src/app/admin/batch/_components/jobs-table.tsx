"use client";

import { useState, useEffect } from "react";

interface Job {
  id: string;
  show_id: string;
  show_name?: string;
  job_type: string;
  status: string;
  progress_current: number;
  progress_total: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export function JobsTable({ showNames }: { showNames: Record<string, string> }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "running" | "completed" | "failed">("all");

  const fetchJobs = async () => {
    try {
      const res = await fetch("/api/admin/inngest/status");
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch {
      /* ignore */
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchJobs();
    // Poll every 10s if there are running jobs
    const interval = setInterval(fetchJobs, 10_000);
    return () => clearInterval(interval);
  }, []);

  const filtered = filter === "all" ? jobs : jobs.filter((j) => j.status === filter);

  const jobTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      discover_episodes: "Discovery",
      fetch_transcripts: "Transcripts",
      inngest_batch: "AI Processing",
      bulk_extract: "AI Processing (legacy)",
      single_extract: "Single Extract",
    };
    return labels[type] || type;
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      running: "bg-blue-100 text-blue-700",
      completed: "bg-green-100 text-green-700",
      failed: "bg-red-100 text-red-700",
      queued: "bg-amber-100 text-amber-700",
    };
    return (
      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || "bg-zinc-100 text-zinc-600"}`}>
        {status}
      </span>
    );
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const duration = (start: string | null, end: string | null) => {
    if (!start) return "—";
    const s = new Date(start).getTime();
    const e = end ? new Date(end).getTime() : Date.now();
    const secs = Math.floor((e - s) / 1000);
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
    return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  };

  if (loading) return <p className="text-sm text-zinc-500">Loading jobs...</p>;

  return (
    <div>
      {/* Filter tabs */}
      <div className="mb-4 flex gap-2">
        {(["all", "running", "completed", "failed"] as const).map((f) => {
          const count = f === "all" ? jobs.length : jobs.filter((j) => j.status === f).length;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                filter === f
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)} ({count})
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-400">No jobs found.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Show</th>
                <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Type</th>
                <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Status</th>
                <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Progress</th>
                <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Started</th>
                <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Duration</th>
                <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((job) => (
                <tr key={job.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-2.5 font-medium">
                    {showNames[job.show_id] || job.show_id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                      {jobTypeLabel(job.job_type)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{statusBadge(job.status)}</td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {job.progress_total > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-zinc-200">
                          <div
                            className="h-full rounded-full bg-green-500 transition-all"
                            style={{
                              width: `${Math.min(100, (job.progress_current / job.progress_total) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs text-zinc-500">
                          {job.progress_current}/{job.progress_total}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-zinc-500">
                    {formatTime(job.started_at || job.created_at)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-zinc-500 tabular-nums">
                    {duration(job.started_at || job.created_at, job.completed_at)}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-2.5 text-xs text-red-600">
                    {job.error_message || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
