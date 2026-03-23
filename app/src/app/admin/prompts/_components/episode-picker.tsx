"use client";

import { useState, useEffect } from "react";

interface Episode {
  id: string;
  title: string;
  guest_name: string | null;
  processing_status: string;
  show_id: string;
  shows: { name: string };
}

interface Show {
  id: string;
  name: string;
}

interface EpisodePickerProps {
  shows: Show[];
  selectedEpisodes: string[];
  onSelectionChange: (episodeIds: string[]) => void;
}

export function EpisodePicker({
  shows,
  selectedEpisodes,
  onSelectionChange,
}: EpisodePickerProps) {
  const [selectedShow, setSelectedShow] = useState<string>(
    shows[0]?.id || ""
  );
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!selectedShow) return;
    setLoading(true);
    fetch(`/api/admin/eval/episodes?showId=${selectedShow}`)
      .then((r) => r.json())
      .then((data) => setEpisodes(data.episodes || []))
      .finally(() => setLoading(false));
  }, [selectedShow]);

  const filtered = episodes.filter(
    (ep) =>
      ep.title?.toLowerCase().includes(search.toLowerCase()) ||
      ep.guest_name?.toLowerCase().includes(search.toLowerCase())
  );

  function toggleEpisode(id: string) {
    if (selectedEpisodes.includes(id)) {
      onSelectionChange(selectedEpisodes.filter((e) => e !== id));
    } else if (selectedEpisodes.length < 3) {
      onSelectionChange([...selectedEpisodes, id]);
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">Select Episodes (max 3)</h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Show</label>
          <select
            value={selectedShow}
            onChange={(e) => setSelectedShow(e.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm"
          >
            {shows.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Search</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by title or guest..."
            className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {selectedEpisodes.length > 0 && (
        <p className="text-sm text-blue-600">
          {selectedEpisodes.length}/3 episodes selected
        </p>
      )}

      <div className="max-h-48 overflow-y-auto rounded border border-zinc-200">
        {loading ? (
          <p className="p-3 text-sm text-zinc-500">Loading episodes...</p>
        ) : filtered.length === 0 ? (
          <p className="p-3 text-sm text-zinc-500">No episodes found</p>
        ) : (
          filtered.map((ep) => (
            <label
              key={ep.id}
              className={`flex cursor-pointer items-center gap-2 border-b border-zinc-100 px-3 py-2 text-sm last:border-0 hover:bg-zinc-50 ${
                selectedEpisodes.includes(ep.id) ? "bg-blue-50" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={selectedEpisodes.includes(ep.id)}
                onChange={() => toggleEpisode(ep.id)}
                disabled={
                  !selectedEpisodes.includes(ep.id) &&
                  selectedEpisodes.length >= 3
                }
                className="rounded"
              />
              <span className="flex-1 truncate">{ep.title}</span>
              {ep.guest_name && (
                <span className="text-xs text-zinc-400">{ep.guest_name}</span>
              )}
              <span
                className={`rounded px-1.5 py-0.5 text-xs ${
                  ep.processing_status === "completed"
                    ? "bg-green-100 text-green-700"
                    : "bg-zinc-100 text-zinc-500"
                }`}
              >
                {ep.processing_status}
              </span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
