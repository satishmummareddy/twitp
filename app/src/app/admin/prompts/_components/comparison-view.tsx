"use client";

import { useState, useEffect } from "react";

interface ComparisonData {
  episode: {
    id: string;
    title: string;
    guest_name: string | null;
    summary: string | null;
    insights: { position: number; content: string }[];
  };
  productionTopics: string[];
  evalResults: EvalResult[];
}

interface EvalResult {
  id: string;
  eval_run_id: string;
  episode_id: string;
  status: string;
  guest_name: string | null;
  summary: string | null;
  insights: string[] | null;
  topics: string[] | null;
  duration_ms: number | null;
  error_message: string | null;
  eval_runs: {
    id: string;
    name: string | null;
    model_provider: string;
    model_name: string;
    prompts: { name: string } | null;
  };
}

interface ComparisonViewProps {
  selectedRunIds: string[];
  episodeIds: string[];
}

export function ComparisonView({
  selectedRunIds,
  episodeIds,
}: ComparisonViewProps) {
  const [comparisons, setComparisons] = useState<ComparisonData[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedRunIds.length === 0 || episodeIds.length === 0) return;

    setLoading(true);
    const runIdsStr = selectedRunIds.join(",");

    Promise.all(
      episodeIds.map((epId) =>
        fetch(
          `/api/admin/eval/compare?episodeId=${epId}&runIds=${runIdsStr}`
        ).then((r) => r.json())
      )
    )
      .then((results) => setComparisons(results))
      .finally(() => setLoading(false));
  }, [selectedRunIds, episodeIds]);

  if (selectedRunIds.length === 0) {
    return (
      <div className="rounded border border-zinc-200 p-6 text-center text-sm text-zinc-500">
        Select completed eval runs above to compare results
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded border border-zinc-200 p-6 text-center text-sm text-zinc-500">
        Loading comparison...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Comparison</h3>

      {comparisons.map((comp) => (
        <EpisodeComparison key={comp.episode?.id} data={comp} />
      ))}
    </div>
  );
}

function EpisodeComparison({ data }: { data: ComparisonData }) {
  if (!data.episode) return null;

  const productionInsights = (data.episode.insights || [])
    .sort((a, b) => a.position - b.position)
    .map((i) => i.content);

  return (
    <div className="rounded border border-zinc-200">
      <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2">
        <h4 className="font-medium">{data.episode.title}</h4>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-0">
          {/* Production column */}
          <Column
            label="Production (current)"
            sublabel={data.episode.guest_name ? `Guest: ${data.episode.guest_name}` : undefined}
            summary={data.episode.summary}
            insights={productionInsights}
            topics={data.productionTopics}
            guestName={data.episode.guest_name}
          />

          {/* Eval result columns */}
          {data.evalResults.map((result) => (
            <Column
              key={result.id}
              label={
                result.eval_runs?.name ||
                result.eval_runs?.prompts?.name ||
                "Eval"
              }
              sublabel={`${result.eval_runs?.model_provider}/${result.eval_runs?.model_name}`}
              summary={result.summary}
              insights={result.insights || []}
              topics={result.topics || []}
              guestName={result.guest_name}
              durationMs={result.duration_ms}
              status={result.status}
              error={result.error_message}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Column({
  label,
  sublabel,
  summary,
  insights,
  topics,
  guestName,
  durationMs,
  status,
  error,
}: {
  label: string;
  sublabel?: string;
  summary: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insights: any[];
  topics: string[];
  guestName: string | null;
  durationMs?: number | null;
  status?: string;
  error?: string | null;
}) {
  return (
    <div className="min-w-[300px] flex-1 border-r border-zinc-200 last:border-0">
      {/* Header */}
      <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-2">
        <p className="text-sm font-medium">{label}</p>
        {sublabel && <p className="text-xs text-zinc-400">{sublabel}</p>}
        {durationMs != null && (
          <p className="text-xs text-zinc-400">
            {(durationMs / 1000).toFixed(1)}s
          </p>
        )}
      </div>

      {status === "failed" ? (
        <div className="p-4 text-sm text-red-600">
          Failed: {error || "Unknown error"}
        </div>
      ) : (
        <div className="space-y-3 p-4">
          {/* Guest */}
          <div>
            <p className="text-xs font-semibold uppercase text-zinc-400">
              Guest
            </p>
            <p className="text-sm">{guestName || "—"}</p>
          </div>

          {/* Summary */}
          <div>
            <p className="text-xs font-semibold uppercase text-zinc-400">
              Summary
            </p>
            <p className="text-sm leading-relaxed">
              {summary || "—"}
            </p>
          </div>

          {/* Insights */}
          <div>
            <p className="text-xs font-semibold uppercase text-zinc-400">
              Insights
            </p>
            {insights.length > 0 ? (
              <ol className="mt-1 list-decimal space-y-1 pl-4 text-sm">
                {insights.map((insight, i) => (
                  <li key={i} className="leading-relaxed">
                    {typeof insight === "string"
                      ? insight
                      : insight?.heading || insight?.summary || JSON.stringify(insight)}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-zinc-400">—</p>
            )}
          </div>

          {/* Topics */}
          <div>
            <p className="text-xs font-semibold uppercase text-zinc-400">
              Topics
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {topics.length > 0 ? (
                topics.map((t) => (
                  <span
                    key={t}
                    className="rounded bg-zinc-100 px-2 py-0.5 text-xs"
                  >
                    {t}
                  </span>
                ))
              ) : (
                <span className="text-sm text-zinc-400">—</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
