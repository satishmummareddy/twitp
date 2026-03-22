# Phase 4: Show Pages

**Status:** Planned
**Dependencies:** Phase 3 complete (EpisodeCard, WeekGroup, EpisodeList components, public episodes API)
**Estimated Effort:** 1-2 sessions (across 2 implementation steps)
**Product Spec Reference:** Section 4 — "Visitor Browses a Show", Section 5 — Show pages

---

## Table of Contents

- [Context](#context)
- [Architecture Overview](#architecture-overview)
- [Key Architecture Decisions](#key-architecture-decisions)
- [API Endpoints](#api-endpoints)
- [Visitor Flow](#visitor-flow)
- [Implementation Plan](#implementation-plan)
  - [4A: Show Detail Page](#4a-show-detail-page)
  - [4B: Shows Index Page](#4b-shows-index-page)
- [All Files Summary](#all-files-summary)
- [Verification Plan](#verification-plan)

---

## Context

Show pages let visitors browse episodes from a specific podcast. This reuses the episode card and week grouping components from Phase 3, adding a show header and filtering.

**Why now:** Phase 3 created the shared components. Show pages are a simple filter on top.

**Target:** `/shows/lennys-podcast` displays all 269 episodes for Lenny's Podcast, grouped by week. `/shows` lists all available shows.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│  /shows/[slug]                                                    │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │ ShowHeader                                               │     │
│  │ Show Name • Host Name • Episode Count • Description      │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │ EpisodeList (from Phase 3)                               │     │
│  │ Filtered by show_id                                      │     │
│  │ Same week grouping + pagination                          │     │
│  └─────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────┘
              │
              │  Server Component: fetch show + episodes
              ▼
         Supabase DB
```

---

## Key Architecture Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| **Show page rendering** | Server Component + ISR | Same as home page — SEO + performance |
| **Show data fetching** | Single query: show + count | Denormalized episode_count avoids COUNT(*) |
| **Episode filtering** | Pass `show` param to existing episodes API | Reuse Phase 3 API, no new endpoint needed |
| **Show slug generation** | `generateStaticParams` for all active shows | Pre-renders show pages at build time |

---

## API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /api/public/shows | List all active shows with episode counts | None |
| GET | /api/public/shows/[slug] | Show detail | None |

**Note:** Episodes for a show use the existing `/api/public/episodes?show=[slug]` from Phase 3.

---

## Visitor Flow

### Browse a Show

1. Click show name on episode card (home page) or nav dropdown
2. Navigate to `/shows/lennys-podcast`
3. See ShowHeader: "Lenny's Podcast" — host, 269 episodes, description
4. Below: same EpisodeList as home page, filtered to this show
5. Same week grouping, same pagination

### Browse All Shows

1. Click "All Shows" in nav dropdown or navigate to `/shows`
2. See grid of show cards: name, host, episode count, cover image
3. Click a show → navigate to show detail page

---

## Implementation Plan

### 4A: Show Detail Page

*~1 session. Show page with filtered episodes.*

#### What Ships

- `ShowHeader` component (name, host, description, episode count)
- Show detail page (`/shows/[slug]/page.tsx`):
  - Server Component: fetch show by slug + episodes filtered by show
  - ShowHeader + EpisodeList (reused from Phase 3)
  - ISR with `revalidate = 3600`
  - `generateStaticParams` for all active shows
- Show detail API (`/api/public/shows/[slug]`)
- 404 handling for invalid show slugs

---

### 4B: Shows Index Page

*~0.5-1 session. Grid of all shows.*

#### What Ships

- `ShowCard` component (name, host, episode count, cover image placeholder)
- Shows index page (`/shows/page.tsx`):
  - Server Component: fetch all active shows
  - Grid layout of ShowCards
  - ISR with `revalidate = 3600`
- Shows list API (`/api/public/shows`)
- SEO meta tags for show pages

---

## All Files Summary

### New Files

| File | Purpose | Ships |
|------|---------|-------|
| `src/components/shows/show-header.tsx` | Show page header | 4A |
| `src/components/shows/show-card.tsx` | Show card for index page | 4B |
| `src/app/shows/[slug]/page.tsx` | Show detail page | 4A |
| `src/app/shows/page.tsx` | Shows index page | 4B |
| `src/app/api/public/shows/route.ts` | Shows list API | 4B |
| `src/app/api/public/shows/[slug]/route.ts` | Show detail API | 4A |
| `src/lib/queries/shows.ts` | Supabase query helpers for shows | 4A |

---

## Verification Plan

### After 4A

1. `/shows/lennys-podcast` renders with correct show header
2. Episodes display filtered to Lenny's Podcast only
3. Week grouping and pagination work correctly
4. Invalid slug returns 404 page
5. Links from home page episode cards navigate correctly

### After 4B

6. `/shows` displays all active shows in a grid
7. Show cards link to correct show detail pages
8. SEO: view source shows show name and description
9. **Build check:** `npm run build` passes
