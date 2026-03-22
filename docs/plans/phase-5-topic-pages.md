# Phase 5: Topic Pages

**Status:** Planned
**Dependencies:** Phase 3 complete (EpisodeCard, WeekGroup, EpisodeList components, public episodes API)
**Estimated Effort:** 1-2 sessions (across 2 implementation steps)
**Product Spec Reference:** Section 4 — "Visitor Browses a Topic", Section 5 — Topic pages

---

## Table of Contents

- [Context](#context)
- [Architecture Overview](#architecture-overview)
- [Key Architecture Decisions](#key-architecture-decisions)
- [API Endpoints](#api-endpoints)
- [Visitor Flow](#visitor-flow)
- [Implementation Plan](#implementation-plan)
  - [5A: Topic Detail Page](#5a-topic-detail-page)
  - [5B: Topics Index Page](#5b-topics-index-page)
- [All Files Summary](#all-files-summary)
- [Verification Plan](#verification-plan)

---

## Context

Topic pages let visitors discover episodes about a specific subject (e.g., "product-market fit", "leadership", "AI"). This phase mirrors Phase 4 (Show Pages) but filters by topic instead of show.

**Why now:** Phase 3 created the shared components. Topics are a natural browsing dimension alongside shows.

**Target:** `/topics/leadership` displays all episodes tagged with "leadership", grouped by week. `/topics` lists all topics sorted by episode count.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│  /topics/[slug]                                                   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │ TopicHeader                                              │     │
│  │ Topic Name • Episode Count • Description                 │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │ EpisodeList (from Phase 3)                               │     │
│  │ Filtered by topic via episode_topics join                │     │
│  │ Same week grouping + pagination                          │     │
│  └─────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────┘
              │
              │  Server Component: fetch topic + episodes
              ▼
         Supabase DB (episodes JOIN episode_topics JOIN topics)
```

---

## Key Architecture Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| **Topic page rendering** | Server Component + ISR | Same pattern as home and show pages |
| **Episode filtering** | Pass `topic` param to existing episodes API | Reuse Phase 3 API — add topic filter via JOIN |
| **Topics index sorting** | By episode count (descending) | Most popular topics surface first |
| **Topic slug generation** | `generateStaticParams` for all topics | Pre-renders topic pages at build time |
| **Topic display on index** | Grid of topic cards with counts | Quick scanning of available topics |

---

## API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /api/public/topics | List all topics with episode counts | None |
| GET | /api/public/topics/[slug] | Topic detail | None |

**Note:** Episodes for a topic use the existing `/api/public/episodes?topic=[slug]` from Phase 3.

---

## Visitor Flow

### Browse a Topic

1. Click topic badge on an episode card, or select from nav dropdown
2. Navigate to `/topics/leadership`
3. See TopicHeader: "Leadership" — 73 episodes, description
4. Below: EpisodeList filtered by topic, same weekly grouping
5. Episodes from multiple shows appear together (cross-show browsing)

### Browse All Topics

1. Click "All Topics" in nav dropdown or navigate to `/topics`
2. See grid of topic cards sorted by episode count
3. Each card: topic name, episode count
4. Click → navigate to topic detail page

---

## Implementation Plan

### 5A: Topic Detail Page

*~1 session. Topic page with filtered episodes.*

#### What Ships

- `TopicHeader` component (topic name, episode count, description)
- Topic detail page (`/topics/[slug]/page.tsx`):
  - Server Component: fetch topic by slug + episodes filtered by topic
  - TopicHeader + EpisodeList (reused from Phase 3)
  - ISR with `revalidate = 3600`
  - `generateStaticParams` for all topics
- Topic detail API (`/api/public/topics/[slug]`)
- Update Phase 3 episodes API to support `topic` filter parameter:
  - JOIN `episode_topics` → `topics` WHERE `topics.slug = ?`
- 404 handling for invalid topic slugs

---

### 5B: Topics Index Page

*~0.5-1 session. Grid of all topics.*

#### What Ships

- `TopicCard` component (topic name, episode count)
- Topics index page (`/topics/page.tsx`):
  - Server Component: fetch all topics sorted by episode_count DESC
  - Grid layout of TopicCards (responsive: 2 cols mobile, 3 tablet, 4 desktop)
  - ISR with `revalidate = 3600`
- Topics list API (`/api/public/topics`)
- SEO meta tags for topic pages

---

## All Files Summary

### New Files

| File | Purpose | Ships |
|------|---------|-------|
| `src/components/topics/topic-header.tsx` | Topic page header | 5A |
| `src/components/topics/topic-card.tsx` | Topic card for index page | 5B |
| `src/app/topics/[slug]/page.tsx` | Topic detail page | 5A |
| `src/app/topics/page.tsx` | Topics index page | 5B |
| `src/app/api/public/topics/route.ts` | Topics list API | 5B |
| `src/app/api/public/topics/[slug]/route.ts` | Topic detail API | 5A |
| `src/lib/queries/topics.ts` | Supabase query helpers for topics | 5A |

### Modified Files

| File | Change | Ships |
|------|--------|-------|
| `src/app/api/public/episodes/route.ts` | Add `topic` filter parameter | 5A |
| `src/lib/queries/episodes.ts` | Add topic filtering logic | 5A |

---

## Verification Plan

### After 5A

1. `/topics/leadership` renders with correct topic header and episode count
2. Episodes display filtered to "leadership" topic only
3. Episodes from multiple shows appear (cross-show filtering works)
4. Week grouping and pagination work correctly
5. Topic badges on episode cards link to correct topic pages
6. Invalid topic slug returns 404

### After 5B

7. `/topics` displays all topics sorted by episode count
8. Topic cards show correct counts
9. Cards link to correct topic detail pages
10. Responsive grid layout works on all screen sizes
11. SEO: view source shows topic names
12. **Build check:** `npm run build` passes
