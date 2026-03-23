"use client";

interface EvalRun {
  id: string;
  name: string | null;
  model_provider: string;
  model_name: string;
  status: string;
  progress_current: number;
  progress_total: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  prompts: { name: string } | null;
}

interface EvalRunCardProps {
  run: EvalRun;
  isSelected: boolean;
  onToggleSelect: (runId: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  running: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

export function EvalRunCard({
  run,
  isSelected,
  onToggleSelect,
}: EvalRunCardProps) {
  const pct =
    run.progress_total > 0
      ? Math.round((run.progress_current / run.progress_total) * 100)
      : 0;

  return (
    <div
      className={`rounded border p-3 ${
        isSelected ? "border-blue-500 bg-blue-50" : "border-zinc-200"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(run.id)}
            disabled={run.status !== "completed"}
            className="rounded"
          />
          <span className="text-sm font-medium">
            {run.name || run.prompts?.name || "Eval Run"}
          </span>
          <span
            className={`rounded px-1.5 py-0.5 text-xs ${
              STATUS_COLORS[run.status] || "bg-zinc-100"
            }`}
          >
            {run.status}
          </span>
        </div>
        <span className="text-xs text-zinc-400">
          {new Date(run.created_at).toLocaleString()}
        </span>
      </div>

      <div className="mt-1 text-xs text-zinc-500">
        {run.model_provider}/{run.model_name} · {run.progress_total} episode
        {run.progress_total !== 1 ? "s" : ""}
      </div>

      {run.status === "running" && (
        <div className="mt-2">
          <div className="flex justify-between text-xs text-zinc-500">
            <span>
              {run.progress_current}/{run.progress_total}
            </span>
            <span>{pct}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-200">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {run.error_message && (
        <p className="mt-1 text-xs text-red-600">{run.error_message}</p>
      )}
    </div>
  );
}
