"use client";

import { useState, useEffect, useCallback } from "react";
import { formatCost } from "@/lib/ai/cost";

interface Episode {
  id: string;
  title: string;
  slug: string;
  guest_name: string | null;
  published_at: string | null;
  duration_display: string | null;
  duration_seconds: number | null;
  view_count: number | null;
  like_count: number | null;
  thumbnail_url: string | null;
  youtube_url: string | null;
  processing_status: string;
  processing_error: string | null;
  has_transcript: boolean;
  transcript_length: number;
  summary: string | null;
  ai_model_used: string | null;
  content_type: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  processing_cost: number | null;
}

interface Props {
  showId: string;
  showName: string;
  channelId: string;
  playlistId: string;
  stats: {
    total: number;
    episodeCount: number;
    withTranscript: number;
    completed: number;
    failed: number;
    pending: number;
  };
}

export function WorkflowPanelInner({
  showId,
  showName,
  channelId: initialChannelId,
  playlistId: initialPlaylistId,
  stats: initialStats,
}: Props) {
  const [openStep, setOpenStep] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(initialStats);

  // Discovery state
  const [youtubeInput, setYoutubeInput] = useState(initialChannelId || "");
  const [resolvedChannelId, setResolvedChannelId] = useState(initialChannelId);
  const [resolvedChannelTitle, setResolvedChannelTitle] = useState("");
  const [resolving, setResolving] = useState(false);
  const [playlistId, setPlaylistId] = useState(initialPlaylistId);
  const [discovering, setDiscovering] = useState(false);
  const [discoverResult, setDiscoverResult] = useState<string | null>(null);

  // Transcript state
  const [fetchingTranscripts, setFetchingTranscripts] = useState(false);
  const [transcriptLimit, setTranscriptLimit] = useState(5);

  // Processing state
  const [processing, setProcessing] = useState(false);
  const [processLimit, setProcessLimit] = useState(5);
  const [forceReprocess, setForceReprocess] = useState(false);

  const fetchEpisodes = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all episodes (including shorts) for Step 1 display
      const res = await fetch(`/api/admin/shows/${showId}/episodes`);
      const data = await res.json();
      const allEps = data.episodes || [];
      setEpisodes(allEps);

      // Update stats from fetched data — episodes only (not shorts)
      const episodesOnly = allEps.filter((e: Episode) => e.content_type === "episode");
      const shortsOnly = allEps.filter((e: Episode) => e.content_type === "short");
      setStats({
        total: allEps.length,
        episodeCount: episodesOnly.length,
        withTranscript: episodesOnly.filter((e: Episode) => e.has_transcript).length,
        completed: episodesOnly.filter((e: Episode) => e.processing_status === "completed").length,
        failed: episodesOnly.filter((e: Episode) => e.processing_status === "failed").length,
        pending: episodesOnly.filter((e: Episode) => e.processing_status === "pending" || e.processing_status === "processing").length,
      });
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [showId]);

  // Auto-poll: refresh every 10s when a job is active
  const [isPolling, setIsPolling] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [prevFingerprint, setPrevFingerprint] = useState("");
  const [stableCount, setStableCount] = useState(0);

  // Tab state for episode list
  const [activeTab, setActiveTab] = useState<"episodes" | "shorts">("episodes");

  useEffect(() => {
    fetchEpisodes();
  }, [fetchEpisodes]);

  useEffect(() => {
    if (!isPolling) return;
    const interval = setInterval(() => {
      fetchEpisodes();
      setPollCount((c) => c + 1);
    }, 10_000);
    return () => clearInterval(interval);
  }, [isPolling, fetchEpisodes]);

  // Auto-stop polling: stop after data stabilizes (3 consecutive no-change polls)
  // or after 60 polls (10 minutes max)
  useEffect(() => {
    if (!isPolling) return;

    if (pollCount >= 60) {
      setIsPolling(false);
      setPollCount(0);
      return;
    }

    // Build a fingerprint that changes when any episode data changes
    const fingerprint = episodes.length + ":" + 
      episodes.filter((e) => e.has_transcript).length + ":" +
      episodes.filter((e) => e.processing_status === "completed").length + ":" +
      episodes.filter((e) => e.processing_status === "failed").length;
    const hasProcessing = episodes.some((e) => e.processing_status === "processing");

    if (fingerprint === prevFingerprint && !hasProcessing && episodes.length > 0) {
      setStableCount((c) => c + 1);
      if (stableCount >= 3) {
        setIsPolling(false);
        setPollCount(0);
        setStableCount(0);
      }
    } else {
      setStableCount(0);
    }

    setPrevFingerprint(fingerprint);
  }, [isPolling, pollCount, episodes, prevFingerprint, stableCount]);

  // ─── Step 1: Discovery ───────────────────────────────────────
  const handleResolveChannel = async () => {
    if (!youtubeInput.trim()) return;
    setResolving(true);
    setDiscoverResult(null);
    try {
      const res = await fetch("/api/admin/shows/resolve-channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: youtubeInput.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setResolvedChannelId(data.channelId);
        setResolvedChannelTitle(data.channelTitle || "");
        setDiscoverResult(`Resolved: ${data.channelTitle || data.channelId} (${data.channelId})`);
      } else {
        setDiscoverResult(`Error: ${data.error}`);
      }
    } catch (err) {
      setDiscoverResult(`Error: ${err instanceof Error ? err.message : "unknown"}`);
    }
    setResolving(false);
  };

  const handleDiscover = async () => {
    const cId = resolvedChannelId || youtubeInput.trim();
    if (!cId && !playlistId) return;
    setDiscovering(true);
    setDiscoverResult(null);
    try {
      const res = await fetch("/api/admin/shows/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          showId,
          channelId: cId || undefined,
          playlistId: playlistId || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setDiscoverResult(`Discovery started. Auto-refreshing...`);
        setIsPolling(true);
      } else {
        setDiscoverResult(`Error: ${data.error}`);
      }
    } catch (err) {
      setDiscoverResult(`Error: ${err instanceof Error ? err.message : "unknown"}`);
    }
    setDiscovering(false);
  };

  // ─── Step 2: Fetch Transcripts ───────────────────────────────
  const handleFetchTranscripts = async (limit?: number) => {
    setFetchingTranscripts(true);
    try {
      const res = await fetch("/api/admin/shows/transcripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showId, limit: limit || 0 }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Transcript fetching started. Page will auto-refresh.`);
        setIsPolling(true);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "unknown"}`);
    }
    setFetchingTranscripts(false);
  };

  // ─── Step 3: Process (AI Extraction) ─────────────────────────
  const handleProcess = async (limit?: number) => {
    setProcessing(true);
    try {
      const res = await fetch("/api/admin/inngest/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          showId,
          limit: limit || 0,
          forceReprocess,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Processing started. Page will auto-refresh.`);
        setIsPolling(true);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "unknown"}`);
    }
    setProcessing(false);
  };

  const toggleStep = (step: number) => {
    setOpenStep(openStep === step ? null : step);
  };

  return (
    <div className="space-y-4">
      {/* ─── Step 1: Discovery ────────────────────────────── */}
      <CollapsibleSection
        step={1}
        title="Discovery"
        subtitle={
          stats.total > 0
            ? (() => {
                const epCount = episodes.filter((e) => e.content_type !== "short").length;
                const shortCount = episodes.filter((e) => e.content_type === "short").length;
                return `${epCount} episodes, ${shortCount} shorts discovered`;
              })()
            : "Fetch episode list from YouTube"
        }
        status={stats.total > 0 ? "complete" : "not-started"}
        isOpen={openStep === 1}
        onToggle={() => toggleStep(1)}
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">
              YouTube Channel URL, Handle, or Channel ID
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={youtubeInput}
                onChange={(e) => setYoutubeInput(e.target.value)}
                placeholder="https://www.youtube.com/@LennysPodcast or UCxyz..."
                className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm"
              />
              <button
                onClick={handleResolveChannel}
                disabled={resolving || !youtubeInput.trim()}
                className="rounded bg-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-300 disabled:opacity-50"
              >
                {resolving ? "Resolving..." : "Resolve"}
              </button>
            </div>
            {resolvedChannelId && (
              <div className="mt-1 text-xs text-green-600">
                ✓ Channel ID: {resolvedChannelId}
                {resolvedChannelTitle && ` — ${resolvedChannelTitle}`}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleDiscover}
              disabled={discovering || (!resolvedChannelId && !youtubeInput.trim() && !playlistId)}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {discovering ? "Discovering..." : "Fetch Episodes"}
            </button>
            <button
              onClick={fetchEpisodes}
              disabled={loading}
              className="text-sm text-blue-600 hover:underline"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {discoverResult && (
            <p className={`text-sm ${discoverResult.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>
              {discoverResult}
            </p>
          )}

          {/* Episode List with Tabs */}
          {episodes.length > 0 && (() => {
            const episodesList = episodes.filter((e) => e.content_type !== "short");
            const shortsList = episodes.filter((e) => e.content_type === "short");
            const displayList = activeTab === "episodes" ? episodesList : shortsList;

            return (
              <div className="mt-4">
                {/* Tabs */}
                <div className="mb-2 flex items-center gap-1 border-b border-zinc-200">
                  <button
                    onClick={() => setActiveTab("episodes")}
                    className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px ${
                      activeTab === "episodes"
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-zinc-400 hover:text-zinc-600"
                    }`}
                  >
                    Episodes ({episodesList.length})
                  </button>
                  <button
                    onClick={() => setActiveTab("shorts")}
                    className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px ${
                      activeTab === "shorts"
                        ? "border-purple-600 text-purple-600"
                        : "border-transparent text-zinc-400 hover:text-zinc-600"
                    }`}
                  >
                    Shorts ({shortsList.length})
                  </button>
                </div>

                <div className="max-h-80 overflow-y-auto rounded border border-zinc-200">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 border-b bg-zinc-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Title</th>
                        <th className="px-3 py-2 text-left font-medium">Date</th>
                        <th className="px-3 py-2 text-right font-medium">Duration</th>
                        <th className="px-3 py-2 text-right font-medium">Views</th>
                        <th className="px-3 py-2 text-center font-medium">Transcript</th>
                        <th className="px-3 py-2 text-center font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {displayList.slice(0, 100).map((ep) => (
                        <tr key={ep.id} className="hover:bg-zinc-50">
                          <td className="max-w-xs truncate px-3 py-2" title={ep.title}>
                            {ep.title}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-zinc-500">
                            {ep.published_at
                              ? new Date(ep.published_at).toLocaleDateString()
                              : "\u2014"}
                          </td>
                          <td className="px-3 py-2 text-right text-zinc-500">
                            {ep.duration_display || "\u2014"}
                          </td>
                          <td className="px-3 py-2 text-right text-zinc-500">
                            {ep.view_count?.toLocaleString() || "\u2014"}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {ep.has_transcript ? (
                              <span className="text-green-600">\u2713</span>
                            ) : (
                              <span className="text-zinc-300">\u2014</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <MiniStatus status={ep.processing_status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {displayList.length > 100 && (
                    <div className="border-t bg-zinc-50 px-3 py-2 text-center text-xs text-zinc-400">
                      Showing 100 of {displayList.length}
                    </div>
                  )}
                  {displayList.length === 0 && (
                    <div className="px-3 py-6 text-center text-xs text-zinc-400">
                      No {activeTab} found
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </CollapsibleSection>

      {/* ─── Step 2: Fetch Transcripts ────────────────────── */}
      <CollapsibleSection
        step={2}
        title="Fetch Transcripts"
        subtitle={
          stats.total > 0
            ? (() => {
                const epCount = episodes.filter((e) => e.content_type !== "short").length;
                return `${stats.withTranscript} / ${epCount} episodes have transcripts`;
              })()
            : "Discovery required first"
        }
        status={
          stats.episodeCount === 0
            ? "blocked"
            : stats.withTranscript >= stats.episodeCount
              ? "complete"
              : stats.withTranscript > 0
                ? "partial"
                : "not-started"
        }
        isOpen={openStep === 2}
        onToggle={() => toggleStep(2)}
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-500">
            Fetch transcripts from YouTube via Supadata.
            {(() => {
              const epCount = stats.episodeCount;
              const missing = epCount - stats.withTranscript;
              return missing > 0 ? (
                <span className="font-medium text-amber-600">
                  {" "}{missing} episodes missing transcripts.
                </span>
              ) : null;
            })()}
          </p>

          <div className="flex items-center gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">
                Limit (0 = all)
              </label>
              <input
                type="number"
                value={transcriptLimit}
                onChange={(e) => setTranscriptLimit(Number(e.target.value))}
                min={0}
                className="w-24 rounded border border-zinc-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="pt-5">
              <button
                onClick={() => handleFetchTranscripts(transcriptLimit)}
                disabled={fetchingTranscripts || stats.total === 0}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {fetchingTranscripts
                  ? "Starting..."
                  : transcriptLimit > 0
                    ? `Fetch ${transcriptLimit} Transcripts`
                    : "Fetch All Transcripts"}
              </button>
            </div>

            <div className="pt-5">
              <button
                onClick={fetchEpisodes}
                className="text-sm text-blue-600 hover:underline"
              >
                Refresh
              </button>
            </div>
          </div>

          {/* Episode transcript status list */}
          {episodes.length > 0 && (() => {
            const episodesOnly = episodes.filter((e) => e.content_type !== "short");
            return (
              <div className="mt-2">
                <div className="mb-2 flex gap-6 text-sm">
                  <div>
                    <span className="font-medium text-green-600">{stats.withTranscript}</span>{" "}
                    <span className="text-zinc-400">have transcripts</span>
                  </div>
                  <div>
                    <span className="font-medium text-amber-600">
                      {episodesOnly.length - stats.withTranscript}
                    </span>{" "}
                    <span className="text-zinc-400">missing</span>
                  </div>
                </div>
                <div className="max-h-60 overflow-y-auto rounded border border-zinc-200">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 border-b bg-zinc-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Episode</th>
                        <th className="px-3 py-2 text-left font-medium">Date</th>
                        <th className="px-3 py-2 text-right font-medium">Duration</th>
                        <th className="px-3 py-2 text-center font-medium">Transcript</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {episodesOnly.slice(0, 100).map((ep) => (
                        <tr key={ep.id} className="hover:bg-zinc-50">
                          <td className="max-w-xs truncate px-3 py-2" title={ep.title}>
                            {ep.title}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-zinc-500">
                            {ep.published_at ? new Date(ep.published_at).toLocaleDateString() : "\u2014"}
                          </td>
                          <td className="px-3 py-2 text-right text-zinc-500">
                            {ep.duration_display || "\u2014"}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {ep.has_transcript ? (
                              <a
                                href={`/admin/transcript/${ep.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-green-600 font-medium hover:underline"
                              >
                                \u2713 {(ep.transcript_length / 1000).toFixed(0)}k chars
                              </a>
                            ) : (
                              <span className="text-zinc-300">\u2014</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {episodesOnly.length > 100 && (
                    <div className="border-t bg-zinc-50 px-3 py-2 text-center text-xs text-zinc-400">
                      Showing 100 of {episodesOnly.length}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </CollapsibleSection>

      {/* ─── Step 3: AI Processing ────────────────────────── */}
      <CollapsibleSection
        step={3}
        title="AI Processing"
        subtitle={
          stats.episodeCount === 0
            ? "Discovery required first"
            : `${stats.completed} / ${stats.episodeCount} episodes processed`
        }
        status={
          stats.episodeCount === 0
            ? "blocked"
            : stats.completed >= stats.episodeCount
              ? "complete"
              : stats.completed > 0
                ? "partial"
                : "not-started"
        }
        isOpen={openStep === 3}
        onToggle={() => toggleStep(3)}
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-500">
            Run AI insights extraction on episodes with transcripts.
            {stats.withTranscript === 0 && (
              <span className="font-medium text-amber-600">
                {" "}No transcripts available — complete Step 2 first.
              </span>
            )}
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">
                Limit (0 = all)
              </label>
              <input
                type="number"
                value={processLimit}
                onChange={(e) => setProcessLimit(Number(e.target.value))}
                min={0}
                className="w-24 rounded border border-zinc-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="pt-5">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={forceReprocess}
                  onChange={(e) => setForceReprocess(e.target.checked)}
                  className="rounded border-zinc-300"
                />
                Force reprocess completed
              </label>
            </div>

            <div className="pt-5">
              <button
                onClick={() => handleProcess(processLimit)}
                disabled={processing || stats.withTranscript === 0}
                className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
              >
                {processing
                  ? "Starting..."
                  : processLimit > 0
                    ? `Process ${processLimit} Episodes`
                    : "Process All Episodes"}
              </button>
            </div>

            {stats.failed > 0 && (
              <div className="pt-5">
                <button
                  onClick={async () => {
                    const res = await fetch("/api/admin/inngest/retry", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ jobId: null, episodeIds: episodes.filter(e => e.processing_status === "failed").map(e => e.id) }),
                    });
                    const data = await res.json();
                    alert(res.ok ? `Retrying ${data.retrying} episodes` : `Error: ${data.error}`);
                  }}
                  className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
                >
                  Retry {stats.failed} Failed
                </button>
              </div>
            )}

            <div className="pt-5">
              <button onClick={fetchEpisodes} className="text-sm text-blue-600 hover:underline">
                Refresh
              </button>
            </div>
          </div>

          {/* Processing status breakdown */}
          {episodes.length > 0 && (
            <div className="flex gap-6 text-sm">
              <div>
                <span className="font-medium text-green-600">{stats.completed}</span>{" "}
                <span className="text-zinc-400">completed</span>
              </div>
              <div>
                <span className="font-medium text-amber-600">{stats.pending}</span>{" "}
                <span className="text-zinc-400">pending</span>
              </div>
              <div>
                <span className="font-medium text-red-600">{stats.failed}</span>{" "}
                <span className="text-zinc-400">failed</span>
              </div>
            </div>
          )}

          {/* Episode AI processing status table */}
          {episodes.length > 0 && (() => {
            const episodesOnly = episodes.filter((e) => e.content_type !== "short");
            const totalCost = episodesOnly.reduce((sum, ep) => sum + (ep.processing_cost || 0), 0);
            return (
              <div className="mt-2">
                {totalCost > 0 && (
                  <div className="mb-2 text-sm">
                    <span className="text-zinc-400">Total cost:</span>{" "}
                    <span className="font-medium text-zinc-700">{formatCost(totalCost)}</span>
                  </div>
                )}
                <div className="max-h-80 overflow-y-auto rounded border border-zinc-200">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 border-b bg-zinc-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Episode</th>
                        <th className="px-3 py-2 text-left font-medium">Date</th>
                        <th className="px-3 py-2 text-right font-medium">Duration</th>
                        <th className="px-3 py-2 text-center font-medium">Transcript</th>
                        <th className="px-3 py-2 text-center font-medium">AI Status</th>
                        <th className="px-3 py-2 text-right font-medium">Cost</th>
                        <th className="px-3 py-2 text-left font-medium">Summary</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {episodesOnly.slice(0, 100).map((ep) => (
                        <tr key={ep.id} className="hover:bg-zinc-50">
                          <td className="max-w-xs truncate px-3 py-2" title={ep.title}>
                            <a
                              href={`/admin/transcript/${ep.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              {ep.title}
                            </a>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-zinc-500">
                            {ep.published_at ? new Date(ep.published_at).toLocaleDateString() : "\u2014"}
                          </td>
                          <td className="px-3 py-2 text-right text-zinc-500">
                            {ep.duration_display || "\u2014"}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {ep.has_transcript ? (
                              <span className="text-green-600">{"\u2713"}</span>
                            ) : (
                              <span className="text-zinc-300">{"\u2014"}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <MiniStatus status={ep.processing_status} />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right text-zinc-500 tabular-nums">
                            {ep.processing_cost ? formatCost(ep.processing_cost) : "\u2014"}
                          </td>
                          <td className="max-w-[200px] truncate px-3 py-2 text-zinc-500" title={ep.summary || ""}>
                            {ep.summary ? (
                              <a
                                href={`/admin/transcript/${ep.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-zinc-600 hover:text-blue-600 hover:underline"
                              >
                                {ep.summary.length > 80 ? ep.summary.slice(0, 80) + "\u2026" : ep.summary}
                              </a>
                            ) : (
                              <span className="text-zinc-300">{"\u2014"}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {episodesOnly.length > 100 && (
                    <div className="border-t bg-zinc-50 px-3 py-2 text-center text-xs text-zinc-400">
                      Showing 100 of {episodesOnly.length}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Failed episodes list */}
          {stats.failed > 0 && (
            <div className="mt-2">
              <div className="mb-1 text-xs font-medium text-red-600">Failed Episodes:</div>
              <div className="max-h-40 overflow-y-auto rounded border border-red-200 bg-red-50">
                {episodes
                  .filter((e) => e.processing_status === "failed")
                  .map((ep) => (
                    <div key={ep.id} className="border-b border-red-100 px-3 py-2 text-xs last:border-0">
                      <div className="font-medium">{ep.title}</div>
                      <div className="mt-0.5 text-red-500">{ep.processing_error || "Unknown error"}</div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
}

// ─── Reusable Components ────────────────────────────────────────

function CollapsibleSection({
  step,
  title,
  subtitle,
  status,
  isOpen,
  onToggle,
  children,
}: {
  step: number;
  title: string;
  subtitle: string;
  status: "not-started" | "partial" | "complete" | "blocked";
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const statusColors = {
    "not-started": "border-zinc-200 bg-white",
    partial: "border-amber-200 bg-amber-50/30",
    complete: "border-green-200 bg-green-50/30",
    blocked: "border-zinc-200 bg-zinc-50",
  };

  const statusIcons = {
    "not-started": "○",
    partial: "◐",
    complete: "●",
    blocked: "⊘",
  };

  const iconColors = {
    "not-started": "text-zinc-400",
    partial: "text-amber-500",
    complete: "text-green-500",
    blocked: "text-zinc-300",
  };

  return (
    <div className={`rounded-lg border ${statusColors[status]}`}>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-4 text-left"
      >
        <span className={`text-lg ${iconColors[status]}`}>{statusIcons[status]}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              Step {step}
            </span>
            <span className="font-semibold">{title}</span>
          </div>
          <div className="text-sm text-zinc-500">{subtitle}</div>
        </div>
        <span className="text-zinc-400">{isOpen ? "▼" : "▶"}</span>
      </button>
      {isOpen && <div className="border-t border-zinc-200 px-4 py-4">{children}</div>}
    </div>
  );
}

function MiniStatus({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-zinc-100 text-zinc-500",
    processing: "bg-blue-100 text-blue-600",
    completed: "bg-green-100 text-green-600",
    failed: "bg-red-100 text-red-600",
  };

  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${styles[status] || styles.pending}`}
    >
      {status}
    </span>
  );
}
