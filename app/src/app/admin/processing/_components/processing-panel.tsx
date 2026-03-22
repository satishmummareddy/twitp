"use client";

import { useState, useEffect, useCallback } from "react";

interface Show {
  id: string;
  name: string;
  slug: string;
  episode_count: number;
}

interface Job {
  id: string;
  show_id: string;
  job_type: string;
  status: string;
  progress_current: number;
  progress_total: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export function ProcessingPanel({
  shows,
  initialJobs,
}: {
  shows: Show[];
  initialJobs: Job[];
}) {
  const [selectedShowId, setSelectedShowId] = useState(shows[0]?.id ?? "");
  const [episodeLimit, setEpisodeLimit] = useState(5);
  const [forceReprocess, setForceReprocess] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [error, setError] = useState("");

  const refreshJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/processing/jobs");
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs);
      }
    } catch {
      // Silently fail on refresh
    }
  }, []);

  // Poll for job updates when any job is running
  useEffect(() => {
    const hasRunning = jobs.some((j) => j.status === "running");
    if (!hasRunning) return;

    const interval = setInterval(refreshJobs, 3000);
    return () => clearInterval(interval);
  }, [jobs, refreshJobs]);

  async function startBulkProcessing() {
    if (!selectedShowId) return;
    setError("");
    setProcessing(true);

    try {
      const res = await fetch("/api/admin/processing/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          showId: selectedShowId,
          limit: episodeLimit > 0 ? episodeLimit : undefined,
          forceReprocess,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to start processing");
        return;
      }

      // Refresh jobs to show the new one
      await refreshJobs();
    } catch {
      setError("Failed to start processing");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Start Processing */}
      <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <h2 className="font-medium">Start Bulk Processing</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Process all transcripts for a show using the active AI prompt
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Show
            </label>
            <select
              value={selectedShowId}
              onChange={(e) => setSelectedShowId(e.target.value)}
              className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
            >
              {shows.length === 0 && (
                <option value="">No shows — add one first</option>
              )}
              {shows.map((show) => (
                <option key={show.id} value={show.id}>
                  {show.name} ({show.episode_count} episodes)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Limit
            </label>
            <select
              value={episodeLimit}
              onChange={(e) => setEpisodeLimit(Number(e.target.value))}
              className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
            >
              <option value={5}>5 episodes</option>
              <option value={10}>10 episodes</option>
              <option value={25}>25 episodes</option>
              <option value={50}>50 episodes</option>
              <option value={0}>All episodes</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={forceReprocess}
              onChange={(e) => setForceReprocess(e.target.checked)}
              className="rounded border-zinc-300"
            />
            Force reprocess completed episodes
          </label>

          <button
            onClick={startBulkProcessing}
            disabled={processing || !selectedShowId}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {processing ? "Starting..." : "Process All Episodes"}
          </button>
        </div>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {/* Job History */}
      <div>
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Processing Jobs</h2>
          <button
            onClick={refreshJobs}
            className="text-sm text-zinc-500 hover:text-zinc-700"
          >
            Refresh
          </button>
        </div>

        {jobs.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No processing jobs yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function JobCard({ job }: { job: Job }) {
  const progress =
    job.progress_total > 0
      ? Math.round((job.progress_current / job.progress_total) * 100)
      : 0;

  const statusColors: Record<string, string> = {
    queued: "bg-yellow-100 text-yellow-700",
    running: "bg-blue-100 text-blue-700",
    completed: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  };

  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[job.status] ?? "bg-zinc-100 text-zinc-500"}`}
          >
            {job.status}
          </span>
          <span className="text-sm font-medium">{job.job_type}</span>
        </div>
        <span className="text-xs text-zinc-500">
          {new Date(job.created_at).toLocaleString()}
        </span>
      </div>

      {job.progress_total > 0 && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>
              {job.progress_current} / {job.progress_total} episodes
            </span>
            <span>{progress}%</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
            <div
              className={`h-full rounded-full transition-all ${
                job.status === "running" ? "bg-blue-500" : "bg-green-500"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {job.error_message && (
        <p className="mt-1 text-xs text-red-600">{job.error_message}</p>
      )}
    </div>
  );
}
