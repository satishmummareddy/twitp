"use client";

import dynamic from "next/dynamic";

const JobsTableInner = dynamic(
  () => import("./jobs-table").then((m) => m.JobsTable),
  {
    ssr: false,
    loading: () => <p className="text-sm text-zinc-500">Loading jobs...</p>,
  }
);

export function JobsTableLoader({ showNames }: { showNames: Record<string, string> }) {
  return <JobsTableInner showNames={showNames} />;
}
