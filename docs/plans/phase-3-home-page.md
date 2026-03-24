# Phase 3: Home Page

**Status:** Complete
**Dependencies:** Phase 2 complete (episodes + insights populated in DB)
**Estimated Effort:** 2-3 sessions (across 2 implementation steps)
**Product Spec Reference:** Section 4 — "Visitor Browses Weekly Episodes", Section 5 — Home page

---

## Table of Contents

- [Context](#context)
- [Architecture Overview](#architecture-overview)
  - [Data Flow](#data-flow)
- [Key Architecture Decisions](#key-architecture-decisions)
- [API Endpoints](#api-endpoints)
- [Visitor Flow](#visitor-flow)
- [Implementation Plan](#implementation-plan)
  - [3A: Episode Card & Week Grouping Components](#3a-episode-card--week-grouping-components)
  - [3B: Home Page with ISR & Pagination](#3b-home-page-with-isr--pagination)
- [All Files Summary](#all-files-summary)
- [Verification Plan](#verification-plan)
- [Appendix A: Episode Card Design](#appendix-a-episode-card-design)

---

## Context

This is the first public-facing page. It's the primary entry point for visitors and the showcase of TWITP's value: quickly scanning podcast episodes to decide what to listen to.

**Why now:** Phase 2 populated the database with episode insights. Now we render them.

**Target:** A responsive home page showing episodes grouped by week (most recent first). Each episode card displays show name, guest, title, date, duration, 5 insights, and topic tags.

**What was actually built:** Hybrid SSR + client rendering. The first batch of episodes is server-rendered for SEO, then an `EpisodeList` client component uses `IntersectionObserver` to implement infinite scroll, fetching subsequent pages from `/api/public/episodes` with cursor-based pagination (30 episodes per page).

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                      VISITOR BROWSER                              │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐      │
│  │ Home Page (/)                                           │      │
│  │                                                         │      │
│  │  ┌─ Week of March 16, 2026 ──────────────────────────┐ │      │
│  │  │ ┌──────────────────────────────────────────────┐   │ │      │
│  │  │ │ EpisodeCard                                   │   │ │      │
│  │  │ │ Show • Guest • Title • Date • Duration        │   │ │      │
│  │  │ │ • Insight 1                                   │   │ │      │
│  │  │ │ • Insight 2                                   │   │ │      │
│  │  │ │ • Insight 3                                   │   │ │      │
│  │  │ │ • Insight 4                                   │   │ │      │
│  │  │ │ • Insight 5                                   │   │ │      │
│  │  │ │ [topic] [topic] [topic]                       │   │ │      │
│  │  │ └──────────────────────────────────────────────┘   │ │      │
│  │  │ ┌──────────────────────────────────────────────┐   │ │      │
│  │  │ │ EpisodeCard (next episode this week)          │   │ │      │
│  │  │ └──────────────────────────────────────────────┘   │ │      │
│  │  └────────────────────────────────────────────────────┘ │      │
│  │                                                         │      │
│  │  ┌─ Week of March 9, 2026 ───────────────────────────┐ │      │
│  │  │ ...                                                │ │      │
│  │  └────────────────────────────────────────────────────┘ │      │
│  │                                                         │      │
│  │  [ Load More Weeks ]                                    │      │
│  └────────────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────────┘
              │
              │  Server Component fetch (build time / ISR)
              ▼
┌──────────────────────────────────────────────────────────────────┐
│  Supabase DB                                                      │
│  SELECT episodes + insights + topics                              │
│  WHERE is_published = true                                        │
│  ORDER BY published_at DESC                                       │
│  GROUP BY published_week                                          │
└──────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Build/ISR** → Server Component fetches episodes with insights and topics from Supabase.
2. **Group** → Episodes grouped by `published_week`, sorted by `published_at` DESC within each week.
3. **Render** → Week sections with EpisodeCard components rendered as static HTML.
4. **Paginate** → Initial load shows ~4 weeks. "Load More" fetches next batch via client-side API call.

---

## Key Architecture Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| **Rendering** | Hybrid SSR + client rendering | SSR first batch for SEO and fast initial load; client-side infinite scroll for subsequent pages |
| **Pagination** | Infinite scroll with cursor-based pagination (30 episodes/page) | Smooth UX, automatic loading via `IntersectionObserver` in `EpisodeList` client component |
| **API** | `/api/public/episodes` with cursor-based pagination | Cursor (last `published_at` timestamp) avoids offset drift; returns `nextCursor` for next page |
| **Week grouping** | Computed from `published_week` column | Pre-computed in Phase 2, no runtime calculation needed |
| **Episode card** | Shared component | Reused in Phases 4 (shows) and 5 (topics) |
| **Topic tags** | Clickable badges linking to /topics/[slug] | Cross-navigation without dedicated topic page yet |

---

## API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /api/public/episodes | Paginated episodes with insights + topics | None |

### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `cursor` | string | - | Cursor for pagination (ISO timestamp of last episode's `published_at`) |
| `limit` | number | 30 | Episodes per page |
| `show` | string | - | Filter by show slug |
| `topic` | string | - | Filter by topic slug |
| `week` | string | - | Filter by specific week (YYYY-MM-DD) |

---

## Visitor Flow

### Browse Weekly Episodes

1. Navigate to `thisweekintechpodcasts.com`
2. See hero/header: "This Week in Tech Podcasts"
3. See first week section: "Week of [Date]"
4. Within each week: episode cards sorted by date (newest first)
5. Each card shows: show name, guest, title, date, duration, 5 insights, topic badges
6. Click topic badge → navigates to `/topics/[slug]` (Phase 5)
7. Click show name → navigates to `/shows/[slug]` (Phase 4)
8. Click episode title or "Listen" → opens YouTube URL in new tab
9. Scroll to bottom → "Load More" button fetches older weeks
10. Continue loading until all episodes exhausted

---

## Implementation Plan

### 3A: Episode Card & Week Grouping Components

*~1-2 sessions. Reusable components that Phase 4 and 5 will share.*

#### What Ships

- `EpisodeCard` component:
  - Show name (linked to show page)
  - Guest name
  - Episode title (linked to YouTube)
  - Publish date (formatted: "Mar 16, 2026")
  - Duration
  - 5 insights as bullet points
  - Topic badges (linked to topic pages)
  - Responsive: stacked on mobile, comfortable on desktop
- `WeekGroup` component:
  - Week header ("Week of March 16, 2026")
  - Contains list of EpisodeCards
- `EpisodeList` client component:
  - Takes initial SSR episodes array, groups by `published_week`
  - Renders WeekGroups in order
  - Uses `IntersectionObserver` to trigger infinite scroll loading
  - Fetches subsequent pages from `/api/public/episodes` with cursor-based pagination
- `TopicBadge` component:
  - Small tag/chip with topic name
  - Links to `/topics/[slug]`
- Public episodes API route (`/api/public/episodes`)
  - Paginated, filterable
  - Joins episodes → insights + episode_topics → topics
  - Returns structured response

---

### 3B: Home Page with ISR & Pagination

*~1 session. Wire components into the home page.*

#### What Ships

- Home page (`/app/page.tsx`):
  - Server Component fetching initial episodes
  - Hero section with site title and tagline
  - EpisodeList with SSR first batch of episodes (30 episodes)
  - Infinite scroll via `IntersectionObserver` fetching subsequent pages from `/api/public/episodes`
  - Hybrid SSR + client rendering (no ISR; force-dynamic for SSR portion)
- Public layout updates:
  - Basic page wrapper (header placeholder, main content area)
  - Meta tags (title, description, OG)
- Loading state for "Load More"
- Empty state if no episodes

---

## All Files Summary

### New Files

| File | Purpose | Ships |
|------|---------|-------|
| `src/components/episodes/episode-card.tsx` | Episode card with insights | 3A |
| `src/components/episodes/week-group.tsx` | Week section wrapper | 3A |
| `src/components/episodes/episode-list.tsx` | Grouped list + pagination | 3A |
| `src/components/ui/topic-badge.tsx` | Topic tag/chip | 3A |
| `src/components/ui/load-more-button.tsx` | Client component for pagination | 3A |
| `src/app/api/public/episodes/route.ts` | Public episodes API | 3A |
| `src/lib/queries/episodes.ts` | Supabase query helpers for episodes | 3A |

### Modified Files

| File | Change | Ships |
|------|--------|-------|
| `src/app/page.tsx` | Replace placeholder with home page | 3B |
| `src/app/layout.tsx` | Add basic layout wrapper, meta tags | 3B |

---

## Verification Plan

### After 3A

1. EpisodeCard renders correctly with mock data
2. API returns paginated episodes with insights and topics
3. Episodes correctly grouped by week
4. Topic badges display and link correctly

### After 3B

5. Home page loads with real data from Supabase
6. Episodes appear grouped by week, most recent first
7. "Load More" fetches and renders additional weeks
8. Page is responsive (mobile, tablet, desktop)
9. ISR works — page loads from cache
10. SEO: view source shows rendered HTML with episode content
11. **Build check:** `npm run build` passes

---

## Appendix A: Episode Card Design

```
┌─────────────────────────────────────────────────────────┐
│ Lenny's Podcast  •  Mar 16, 2026  •  1:13:28            │
│                                                          │
│ Brian Chesky's new playbook                              │
│ Guest: Brian Chesky                                      │
│                                                          │
│ Key Insights:                                            │
│ • Leaders should be in the details — knowing details     │
│   isn't micromanagement, it's responsible leadership     │
│ • Airbnb shifted from paid growth to product-led growth  │
│   — build the best product and tell people about it      │
│ • One single roadmap across the entire company keeps     │
│   everyone rowing in the same direction                  │
│ • Founders shouldn't apologize for how they want to      │
│   run the company — clarity beats compromise             │
│ • The key to avoiding burnout: continuous learning and   │
│   staying ahead of the business                          │
│                                                          │
│ [leadership] [growth-strategy] [product-management]      │
│                                           ▶ Listen on YT │
└─────────────────────────────────────────────────────────┘
```

- Show name, date, duration on first line (muted text)
- Episode title as heading (bold)
- Guest name below title
- 5 insights as bullet list
- Topic badges at bottom
- "Listen on YT" link to YouTube (opens in new tab)
- Responsive: full width on mobile, max-width ~700px on desktop
