"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PromptEditor, type PromptData } from "./prompt-editor";
import { EpisodePicker } from "./episode-picker";
import { EvalRunCard } from "./eval-run-card";
import { ComparisonView } from "./comparison-view";

interface Show {
  id: string;
  name: string;
}

interface EvalRun {
  id: string;
  name: string | null;
  prompt_id: string;
  model_provider: string;
  model_name: string;
  status: string;
  episode_ids: string[];
  progress_current: number;
  progress_total: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  prompts: { name: string } | null;
}

interface PromptEvalPanelProps {
  initialShows: Show[];
}

export function PromptEvalPanel({ initialShows }: PromptEvalPanelProps) {
  const [prompts, setPrompts] = useState<PromptData[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptData | null>(null);
  const [selectedEpisodes, setSelectedEpisodes] = useState<string[]>([]);
  const [evalRuns, setEvalRuns] = useState<EvalRun[]>([]);
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [runningEval, setRunningEval] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPrompts = useCallback(async () => {
    const res = await fetch("/api/admin/eval/prompts");
    const data = await res.json();
    setPrompts(data.prompts || []);
  }, []);

  const fetchRuns = useCallback(async () => {
    const res = await fetch("/api/admin/eval/runs");
    const data = await res.json();
    setEvalRuns(data.runs || []);
  }, []);

  useEffect(() => {
    fetchPrompts();
    fetchRuns();
  }, [fetchPrompts, fetchRuns]);

  // Poll for running eval runs
  useEffect(() => {
    const hasRunning = evalRuns.some((r) => r.status === "running");
    if (hasRunning && !pollRef.current) {
      pollRef.current = setInterval(fetchRuns, 3000);
    } else if (!hasRunning && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
      setRunningEval(false);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [evalRuns, fetchRuns]);

  async function startEval() {
    if (!selectedPrompt) {
      setError("Select a prompt first");
      return;
    }
    if (selectedEpisodes.length === 0) {
      setError("Select at least one episode");
      return;
    }

    setRunningEval(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/eval/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptId: selectedPrompt.id,
          episodeIds: selectedEpisodes,
          name: `${selectedPrompt.name} eval`,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start eval");
      }

      fetchRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setRunningEval(false);
    }
  }

  function toggleRunSelection(runId: string) {
    setSelectedRunIds((prev) => {
      if (prev.includes(runId)) {
        return prev.filter((id) => id !== runId);
      }
      if (prev.length >= 2) {
        return [prev[1], runId]; // Keep max 2 selected, drop oldest
      }
      return [...prev, runId];
    });
  }

  // Get episode IDs from selected runs for comparison
  const comparisonEpisodeIds = Array.from(
    new Set(
      evalRuns
        .filter((r) => selectedRunIds.includes(r.id))
        .flatMap((r) => r.episode_ids || [])
    )
  );

  return (
    <div className="space-y-8">
      {/* Section 1: Prompt Editor */}
      <section className="rounded-lg border border-zinc-200 p-4">
        <PromptEditor
          prompts={prompts}
          selectedPrompt={selectedPrompt}
          onSelectPrompt={setSelectedPrompt}
          onPromptsChanged={() => {
            fetchPrompts();
          }}
        />
      </section>

      {/* Section 2: Episode Selection & Run Eval */}
      <section className="rounded-lg border border-zinc-200 p-4">
        <EpisodePicker
          shows={initialShows}
          selectedEpisodes={selectedEpisodes}
          onSelectionChange={setSelectedEpisodes}
        />

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={startEval}
            disabled={
              runningEval || !selectedPrompt || selectedEpisodes.length === 0
            }
            className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {runningEval ? "Running..." : "Run Eval"}
          </button>
          {selectedPrompt && (
            <span className="text-sm text-zinc-500">
              Using: <strong>{selectedPrompt.name}</strong> (
              {selectedPrompt.model_provider}/{selectedPrompt.model_name})
            </span>
          )}
        </div>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </section>

      {/* Section 3: Eval Run History */}
      <section className="rounded-lg border border-zinc-200 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            Eval Runs{" "}
            <span className="text-sm font-normal text-zinc-400">
              (select up to 2 to compare)
            </span>
          </h3>
          <button
            onClick={fetchRuns}
            className="text-sm text-blue-600 hover:underline"
          >
            Refresh
          </button>
        </div>

        {evalRuns.length === 0 ? (
          <p className="text-sm text-zinc-500">No eval runs yet</p>
        ) : (
          <div className="space-y-2">
            {evalRuns.map((run) => (
              <EvalRunCard
                key={run.id}
                run={run}
                isSelected={selectedRunIds.includes(run.id)}
                onToggleSelect={toggleRunSelection}
              />
            ))}
          </div>
        )}
      </section>

      {/* Section 4: Comparison */}
      <section className="rounded-lg border border-zinc-200 p-4">
        <ComparisonView
          selectedRunIds={selectedRunIds}
          episodeIds={comparisonEpisodeIds}
        />
      </section>
    </div>
  );
}
