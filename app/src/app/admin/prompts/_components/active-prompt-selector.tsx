"use client";

import { useState } from "react";

interface Prompt {
  id: string;
  name: string;
  is_active: boolean;
  is_promoted: boolean;
  model_provider: string;
  model_name: string;
}

export function ActivePromptSelector({ prompts: initialPrompts }: { prompts: Prompt[] }) {
  const [prompts, setPrompts] = useState(initialPrompts);
  const [saving, setSaving] = useState(false);

  const activePrompt = prompts.find((p) => p.is_active);

  async function handleActivate(promptId: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/prompts/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptId }),
      });
      if (res.ok) {
        setPrompts((prev) =>
          prev.map((p) => ({ ...p, is_active: p.id === promptId }))
        );
      } else {
        const data = await res.json();
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-8 rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-blue-900">
            Public Site Display Prompt
          </h2>
          <p className="mt-0.5 text-xs text-blue-700">
            This prompt&apos;s AI-generated content (summary + insights) is shown to visitors on the public site.
            Changing this takes effect immediately — no re-processing needed.
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <select
          value={activePrompt?.id || ""}
          onChange={(e) => handleActivate(e.target.value)}
          disabled={saving}
          className="rounded border border-blue-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="" disabled>
            Select a prompt...
          </option>
          {prompts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.model_provider}/{p.model_name})
            </option>
          ))}
        </select>

        {saving && (
          <span className="text-xs text-blue-600">Saving...</span>
        )}

        {activePrompt && !saving && (
          <span className="text-xs text-green-700">
            ✓ Active: {activePrompt.name}
          </span>
        )}
      </div>

      {activePrompt && (
        <p className="mt-2 text-xs text-blue-600">
          Episodes without content from this prompt will fall back to the latest available version.
        </p>
      )}
    </div>
  );
}
