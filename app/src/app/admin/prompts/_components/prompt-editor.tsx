"use client";

import { useState, useMemo } from "react";

export interface PromptData {
  id: string;
  name: string;
  description: string | null;
  template: string;
  model_provider: string;
  model_name: string;
  is_active: boolean;
  is_promoted: boolean;
  version: number;
  created_at: string;
}

interface PromptEditorProps {
  prompts: PromptData[];
  selectedPrompt: PromptData | null;
  onSelectPrompt: (prompt: PromptData | null) => void;
  onPromptsChanged: () => void;
}

const DEFAULT_MODELS: Record<string, string[]> = {
  anthropic: ["claude-sonnet-4-5-20250929", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
};

export function PromptEditor({
  prompts,
  selectedPrompt,
  onSelectPrompt,
  onPromptsChanged,
}: PromptEditorProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState("");
  const [modelProvider, setModelProvider] = useState<string>("anthropic");
  const [modelName, setModelName] = useState("claude-sonnet-4-5-20250929");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Build the final prompt preview — shows exactly what the AI will receive
  const finalPrompt = useMemo(() => {
    if (!template) return "";

    const sampleShow = "Lenny's Podcast";
    const sampleTitle = "How to build a high-performing growth team | Adam Fishman";
    const sampleTranscript = "[... transcript would appear here — typically 60,000-90,000 characters ...]";

    let prompt = template
      .replace("{show_name}", sampleShow)
      .replace("{episode_title}", sampleTitle)
      .replace("{transcript}", sampleTranscript);

    const autoAppended: string[] = [];

    if (!template.includes("{transcript}")) {
      const contextBlock = `\n\n**Show:** ${sampleShow}\n**Episode:** ${sampleTitle}\n\n**Transcript:**\n${sampleTranscript}`;
      prompt += contextBlock;
      autoAppended.push("transcript context (template missing {transcript})");
    }

    if (!prompt.toLowerCase().includes("json")) {
      const jsonBlock = `\n\nRespond with valid JSON only, in this format:\n{"guest_name": "...", "summary": "...", "insights": ["insight1", "insight2", ...], "topics": ["topic-slug-1", "topic-slug-2", ...]}`;
      prompt += jsonBlock;
      autoAppended.push("JSON format instructions");
    }

    return { text: prompt, autoAppended };
  }, [template]);

  function loadPrompt(prompt: PromptData) {
    onSelectPrompt(prompt);
    setName(prompt.name);
    setDescription(prompt.description || "");
    setTemplate(prompt.template);
    setModelProvider(prompt.model_provider);
    setModelName(prompt.model_name);
    setError(null);
  }

  function newPrompt() {
    onSelectPrompt(null);
    setName("");
    setDescription("");
    setTemplate("");
    setModelProvider("anthropic");
    setModelName("claude-sonnet-4-5-20250929");
    setError(null);
  }

  function duplicatePrompt() {
    if (!selectedPrompt) return;
    onSelectPrompt(null);
    setName(`${selectedPrompt.name} (copy)`);
    setDescription(selectedPrompt.description || "");
    setTemplate(selectedPrompt.template);
    setModelProvider(selectedPrompt.model_provider);
    setModelName(selectedPrompt.model_name);
    setError(null);
  }

  async function save() {
    if (!name || !template || !modelProvider || !modelName) {
      setError("Name, template, provider, and model are required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (selectedPrompt) {
        // Update existing
        const res = await fetch("/api/admin/eval/prompts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: selectedPrompt.id,
            name,
            description: description || null,
            template,
            model_provider: modelProvider,
            model_name: modelName,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to update prompt");
        }
      } else {
        // Create new
        const res = await fetch("/api/admin/eval/prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            description: description || null,
            template,
            model_provider: modelProvider,
            model_name: modelName,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to create prompt");
        }
      }
      onPromptsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Prompt Editor</h3>
        <div className="flex gap-2">
          <button
            onClick={newPrompt}
            className="rounded bg-zinc-200 px-3 py-1 text-sm hover:bg-zinc-300"
          >
            New
          </button>
          {selectedPrompt && (
            <button
              onClick={duplicatePrompt}
              className="rounded bg-zinc-200 px-3 py-1 text-sm hover:bg-zinc-300"
            >
              Duplicate
            </button>
          )}
        </div>
      </div>

      {/* Prompt list */}
      <div className="space-y-2">
        {prompts.map((p) => (
          <div
            key={p.id}
            className={`flex items-center gap-2 rounded border px-3 py-2 ${
              selectedPrompt?.id === p.id
                ? "border-blue-500 bg-blue-50"
                : "border-zinc-200 hover:bg-zinc-50"
            }`}
          >
            <button
              onClick={() => loadPrompt(p)}
              className="flex-1 text-left text-sm"
            >
              <span className="font-medium">{p.name}</span>
              <span className="ml-2 text-xs text-zinc-400">
                {p.model_provider}/{p.model_name}
              </span>
            </button>
            <div className="flex items-center gap-1.5">
              {p.is_active && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                  Active
                </span>
              )}
              {p.is_promoted && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                  Promoted
                </span>
              )}
              {!p.is_active && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    await fetch("/api/admin/prompts/activate", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ promptId: p.id }),
                    });
                    onPromptsChanged();
                  }}
                  className="rounded bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-600 hover:bg-green-100"
                >
                  Set Active
                </button>
              )}
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  await fetch("/api/admin/prompts/promote", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ promptId: p.id, promoted: !p.is_promoted }),
                  });
                  onPromptsChanged();
                }}
                className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                  p.is_promoted
                    ? "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                    : "bg-blue-50 text-blue-600 hover:bg-blue-100"
                }`}
              >
                {p.is_promoted ? "Demote" : "Promote"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Edit form */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm"
              placeholder="e.g., insights_extraction_v2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm"
              placeholder="Optional description"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Provider</label>
            <select
              value={modelProvider}
              onChange={(e) => {
                setModelProvider(e.target.value);
                setModelName(DEFAULT_MODELS[e.target.value]?.[0] || "");
              }}
              className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm"
            >
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Model</label>
            <select
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm"
            >
              {(DEFAULT_MODELS[modelProvider] || []).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-sm font-medium">
              {showPreview ? "Final Prompt Preview" : "Prompt Template"}
            </label>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="text-xs text-blue-600 hover:underline"
            >
              {showPreview ? "Edit Template" : "Preview Final Prompt"}
            </button>
          </div>

          {showPreview ? (
            <div>
              {finalPrompt && typeof finalPrompt === "object" && finalPrompt.autoAppended.length > 0 && (
                <div className="mb-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Auto-appended: {finalPrompt.autoAppended.join(", ")}
                </div>
              )}
              <pre className="max-h-[500px] overflow-auto whitespace-pre-wrap rounded border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-700">
                {typeof finalPrompt === "object" ? finalPrompt.text : ""}
              </pre>
            </div>
          ) : (
            <>
              <textarea
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                rows={16}
                className="w-full rounded border border-zinc-300 px-3 py-2 font-mono text-sm"
                placeholder="Enter your prompt template..."
              />
              <p className="mt-1 text-xs text-zinc-500">
                Variables: <code>{"{show_name}"}</code>,{" "}
                <code>{"{episode_title}"}</code>, <code>{"{transcript}"}</code>
                {" "}— If omitted, transcript and JSON format are auto-appended.
              </p>
            </>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <button
          onClick={save}
          disabled={saving}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving
            ? "Saving..."
            : selectedPrompt
              ? "Update Prompt"
              : "Create Prompt"}
        </button>
      </div>
    </div>
  );
}
