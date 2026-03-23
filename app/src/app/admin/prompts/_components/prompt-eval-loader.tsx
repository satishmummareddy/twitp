"use client";

import dynamic from "next/dynamic";

const PromptEvalPanel = dynamic(
  () =>
    import("./prompt-eval-panel").then((m) => m.PromptEvalPanel),
  { ssr: false, loading: () => <p className="text-sm text-zinc-500">Loading eval tool...</p> }
);

interface Props {
  initialShows: { id: string; name: string }[];
}

export function PromptEvalLoader({ initialShows }: Props) {
  return <PromptEvalPanel initialShows={initialShows} />;
}
