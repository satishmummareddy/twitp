"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EpisodeCard, groupByWeek, type EpisodeData } from "./episode-card";

interface EpisodeListProps {
  initialEpisodes: EpisodeData[];
  initialCursor: string | null;
}

export function EpisodeList({
  initialEpisodes,
  initialCursor,
}: EpisodeListProps) {
  const [episodes, setEpisodes] = useState<EpisodeData[]>(initialEpisodes);
  const [nextCursor, setNextCursor] = useState<string | null>(initialCursor);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialCursor !== null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore || !nextCursor) return;

    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/public/episodes?cursor=${encodeURIComponent(nextCursor)}&limit=30`
      );
      const data = await res.json();

      if (data.episodes && data.episodes.length > 0) {
        setEpisodes((prev) => [...prev, ...data.episodes]);
        setNextCursor(data.nextCursor);
        setHasMore(data.nextCursor !== null);
      } else {
        setHasMore(false);
      }
    } catch {
      // Silently fail — user can scroll again to retry
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, hasMore, nextCursor]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: "400px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  const weekGroups = groupByWeek(episodes);

  return (
    <div>
      {Array.from(weekGroups.entries()).map(([weekLabel, weekEpisodes]) => (
        <section key={weekLabel} className="mb-10">
          <h2 className="mb-4 border-b border-zinc-200 pb-2 text-lg font-semibold text-zinc-800">
            {weekLabel}
          </h2>
          <div className="space-y-4">
            {weekEpisodes.map((ep) => (
              <EpisodeCard key={ep.id} episode={ep} />
            ))}
          </div>
        </section>
      ))}

      {/* Sentinel for IntersectionObserver */}
      <div ref={sentinelRef} className="h-1" />

      {isLoading && (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
        </div>
      )}

      {!hasMore && episodes.length > 0 && (
        <p className="py-8 text-center text-sm text-zinc-400">
          You&apos;ve reached the end — {episodes.length} episodes loaded
        </p>
      )}
    </div>
  );
}
