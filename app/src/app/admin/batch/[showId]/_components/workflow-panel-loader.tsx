"use client";

import dynamic from "next/dynamic";

const WorkflowPanelInner = dynamic(
  () => import("./workflow-panel").then((m) => m.WorkflowPanelInner),
  {
    ssr: false,
    loading: () => <p className="text-sm text-zinc-500">Loading workflow...</p>,
  }
);

export function WorkflowPanel(props: {
  showId: string;
  showName: string;
  channelId: string;
  playlistId: string;
  stats: {
    total: number;
    withTranscript: number;
    completed: number;
    failed: number;
    pending: number;
  };
}) {
  return <WorkflowPanelInner {...props} />;
}
