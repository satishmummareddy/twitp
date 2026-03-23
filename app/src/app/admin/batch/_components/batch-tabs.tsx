"use client";

import { useState, type ReactNode } from "react";

export function BatchTabs({
  showsContent,
  jobsContent,
}: {
  showsContent: ReactNode;
  jobsContent: ReactNode;
}) {
  const [tab, setTab] = useState<"shows" | "jobs">("shows");

  return (
    <div>
      <div className="mb-6 flex gap-1 rounded-lg border border-zinc-200 bg-zinc-100 p-1">
        <button
          onClick={() => setTab("shows")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
            tab === "shows"
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-500 hover:text-zinc-700"
          }`}
        >
          Shows
        </button>
        <button
          onClick={() => setTab("jobs")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
            tab === "jobs"
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-500 hover:text-zinc-700"
          }`}
        >
          All Jobs
        </button>
      </div>

      {tab === "shows" ? showsContent : jobsContent}
    </div>
  );
}
