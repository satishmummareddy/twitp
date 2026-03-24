"use client";

import { useState } from "react";
import { formatCost, formatTokens } from "@/lib/ai/cost";

interface Version {
  id: string;
  prompt_id: string;
  prompt_name: string;
  is_active: boolean;
  guest_name: string | null;
  summary: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insights: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  topics: any[];
  model_provider: string;
  model_name: string;
  input_tokens: number | null;
  output_tokens: number | null;
  processing_cost: number | null;
  processing_duration_ms: number | null;
  status: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface LegacyData {
  summary: string | null;
  guest_name: string | null;
  insights: { position: number; content: unknown }[];
  model_used: string | null;
}

function parseInsight(content: unknown): {
  heading: string | null;
  summary: string | null;
  explanation: string | null;
} {
  function extract(obj: Record<string, string>) {
    const heading = (obj.heading || obj.title || obj.insight || "").replace(/\*\*/g, "").trim() || null;
    const summary = obj.summary || null;
    const explanation = obj.explanation || null;
    return { heading, summary, explanation };
  }

  if (typeof content === "object" && content !== null) {
    const c = content as Record<string, unknown>;
    if (c.content && typeof c.content === "object") {
      return extract(c.content as Record<string, string>);
    }
    return extract(content as Record<string, string>);
  }
  if (typeof content === "string") {
    try {
      const trimmed = content.trim();
      if (trimmed.startsWith("{")) {
        return parseInsight(JSON.parse(trimmed));
      }
    } catch { /* not JSON */ }
  }
  return { heading: null, summary: null, explanation: null };
}

export function VersionTabs({
  versions,
  legacy,
}: {
  versions: Version[];
  legacy: LegacyData;
}) {
  const tabs = [
    { id: "legacy", label: legacy.model_used || "Legacy", isActive: false },
    ...versions.map((v) => ({
      id: v.prompt_id,
      label: v.prompt_name,
      isActive: v.is_active,
    })),
  ];

  // Default to active version, or first version, or legacy
  const defaultTab = versions.find((v) => v.is_active)?.prompt_id
    || (versions.length > 0 ? versions[0].prompt_id : "legacy");
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Get the data for the selected tab
  const selectedVersion = versions.find((v) => v.prompt_id === activeTab);

  const displayData = selectedVersion
    ? {
        summary: selectedVersion.summary,
        guest_name: selectedVersion.guest_name,
        insights: selectedVersion.insights || [],
        model: `${selectedVersion.model_provider}/${selectedVersion.model_name}`,
        inputTokens: selectedVersion.input_tokens,
        outputTokens: selectedVersion.output_tokens,
        cost: selectedVersion.processing_cost,
        duration: selectedVersion.processing_duration_ms,
        status: selectedVersion.status,
        error: selectedVersion.error_message,
        topics: selectedVersion.topics || [],
      }
    : {
        summary: legacy.summary,
        guest_name: legacy.guest_name,
        insights: legacy.insights.map((i) => i.content),
        model: legacy.model_used,
        inputTokens: null,
        outputTokens: null,
        cost: null,
        duration: null,
        status: "completed",
        error: null,
        topics: [],
      };

  return (
    <div>
      {/* Tab bar */}
      <div className="mb-4 flex flex-wrap gap-2 border-b border-zinc-200 pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-t px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-blue-600 text-blue-700"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {tab.label}
            {tab.isActive && (
              <span className="ml-1.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                Display
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Status + cost bar */}
      {selectedVersion && (
        <div className="mb-4 flex flex-wrap gap-4 rounded-lg bg-zinc-50 px-4 py-2 text-xs">
          <span>
            <span className="text-zinc-400">Model:</span>{" "}
            <span className="font-medium text-zinc-700">{displayData.model}</span>
          </span>
          <span>
            <span className="text-zinc-400">Status:</span>{" "}
            <span className={`font-medium ${displayData.status === "completed" ? "text-green-600" : displayData.status === "failed" ? "text-red-600" : "text-zinc-600"}`}>
              {displayData.status}
            </span>
          </span>
          {displayData.inputTokens != null && displayData.inputTokens > 0 && (
            <span>
              <span className="text-zinc-400">Tokens:</span>{" "}
              <span className="font-medium text-zinc-700">
                {formatTokens(displayData.inputTokens)} / {formatTokens(displayData.outputTokens || 0)}
              </span>
            </span>
          )}
          {displayData.cost != null && displayData.cost > 0 && (
            <span>
              <span className="text-zinc-400">Cost:</span>{" "}
              <span className="font-medium text-green-700">{formatCost(displayData.cost)}</span>
            </span>
          )}
          {displayData.duration != null && displayData.duration > 0 && (
            <span>
              <span className="text-zinc-400">Duration:</span>{" "}
              <span className="font-medium text-zinc-700">
                {displayData.duration < 1000
                  ? `${displayData.duration}ms`
                  : `${(displayData.duration / 1000).toFixed(1)}s`}
              </span>
            </span>
          )}
        </div>
      )}

      {/* Error */}
      {displayData.error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-600">
          {displayData.error}
        </div>
      )}

      {/* Summary */}
      {displayData.summary && (
        <div className="mb-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Summary</h3>
          <p className="text-sm leading-relaxed text-zinc-700">{displayData.summary}</p>
        </div>
      )}

      {/* Guest name */}
      {displayData.guest_name && (
        <div className="mb-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Guest</h3>
          <p className="text-sm font-medium text-zinc-700">{displayData.guest_name}</p>
        </div>
      )}

      {/* Insights */}
      {displayData.insights.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Insights</h3>
          <ol className="space-y-3">
            {displayData.insights.map((insight: unknown, idx: number) => {
              // Handle both versioned {content: {...}} and legacy string
              const raw = typeof insight === "object" && insight !== null
                ? (insight as Record<string, unknown>).content || insight
                : insight;
              const parsed = parseInsight(raw);
              const position = typeof insight === "object" && insight !== null
                ? (insight as Record<string, unknown>).position as number || idx + 1
                : idx + 1;

              return (
                <li key={idx} className="rounded-lg border border-zinc-100 bg-zinc-50/50 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-bold text-zinc-600">
                      {position}
                    </span>
                    <div className="min-w-0 flex-1">
                      {parsed.heading ? (
                        <>
                          <div className="font-semibold text-zinc-900">{parsed.heading}</div>
                          {parsed.summary && (
                            <div className="mt-1 text-sm text-zinc-600">{parsed.summary}</div>
                          )}
                          {parsed.explanation && (
                            <div className="mt-2 text-sm leading-relaxed text-zinc-500">{parsed.explanation}</div>
                          )}
                        </>
                      ) : (
                        <div className="text-sm text-zinc-700">{String(raw)}</div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Topics */}
      {displayData.topics.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Topics</h3>
          <div className="flex flex-wrap gap-2">
            {displayData.topics.map((topic: string, idx: number) => (
              <span key={idx} className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
