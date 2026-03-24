# ThisWeekInTechPodcasts.com — Implementation Plan Overview

> **Product Spec:** [docs/product-spec.md](./product-spec.md)
> **Status:** Mostly Complete (reflecting actual build state)
> **Date:** March 2026 (updated)

---

## Phase Dependency Graph

```
Phase 1: Project Setup & Data Model                           ✅ Complete
    │
    ▼
Phase 2: Bulk Podcast Insights Extraction (Admin UI + AI)     ✅ Complete
    │
    ▼
Phase 3: Home Page (weekly episode digest)                    ✅ Complete
    │
    ├──────────────────┐
    ▼                  ▼
Phase 4: Show Pages   Phase 5: Topic Pages                    ✅ Complete
    │                  │
    └──────────────────┘
             │
             ▼
Phase 6: Navigation & Polish                                  ⚠️ Partial
    │
    ▼
Phase 7: Scalable Job Queue Processing System
    ├── 7A: Inngest Integration + Single-Pass Queue           ✅ Complete
    ├── 7B: Two-Pass Processing Pipeline                      ❌ Not started
    ├── 7C: YouTube Discovery + Supadata Transcripts          ✅ Complete
    ├── 7D: Show Processing Workflow UI                       ✅ Complete
    ├── 7E: Scheduled Processing (cron)                       ❌ Not started
    └── 7F: Enhanced Admin Dashboard                          ✅ Complete
```

---

## Phase Summary

| Phase | Feature | Status | Notes | Plan Doc |
|-------|---------|--------|-------|----------|
| 1 | Project Setup & Data Model | ✅ Complete | Plus audit/cost columns added later | [phase-1-project-setup.md](./plans/phase-1-project-setup.md) |
| 2 | Bulk Insights Extraction | ✅ Complete | Plus eval system added later | [phase-2-insights-extraction.md](./plans/phase-2-insights-extraction.md) |
| 3 | Home Page | ✅ Complete | Infinite scroll with cursor-based pagination (30 episodes/page), hybrid SSR + client rendering | [phase-3-home-page.md](./plans/phase-3-home-page.md) |
| 4 | Show Pages | ✅ Complete | | [phase-4-show-pages.md](./plans/phase-4-show-pages.md) |
| 5 | Topic Pages | ✅ Complete | | [phase-5-topic-pages.md](./plans/phase-5-topic-pages.md) |
| 6 | Navigation & Polish | ⚠️ Partial | Basic nav works. No footer, no /shows or /topics index pages. | [phase-6-navigation-polish.md](./plans/phase-6-navigation-polish.md) |
| 7A | Inngest Integration | ✅ Complete | Inngest v4, concurrency limit of 5 per show | [phase-7-scalable-processing.md](./plans/phase-7-scalable-processing.md) |
| 7B | Two-Pass Pipeline | ❌ Not started | Single-pass works well; two-pass deferred as cost optimization | [phase-7-scalable-processing.md](./plans/phase-7-scalable-processing.md) |
| 7C | YouTube + Supadata Discovery | ✅ Complete | Hybrid: Supadata for video IDs, YouTube API for metadata | [phase-7-scalable-processing.md](./plans/phase-7-scalable-processing.md) |
| 7D | Workflow UI | ✅ Complete | 3-step workflow (Discovery → Transcripts → AI Processing) | [phase-7-scalable-processing.md](./plans/phase-7-scalable-processing.md) |
| 7E | Scheduled Processing | ❌ Not started | All discovery is manual via admin UI | [phase-7-scalable-processing.md](./plans/phase-7-scalable-processing.md) |
| 7F | Admin Dashboard | ✅ Complete | Stats, costs, jobs table, stale job cleanup, Inngest cancellation | [phase-7-scalable-processing.md](./plans/phase-7-scalable-processing.md) |

---

## Phase Details

### Phase 1: Project Setup & Data Model ✅
*Foundation — everything depends on this.*

- Initialize Next.js 15 project with TypeScript, Tailwind CSS 4, ESLint
- Set up Supabase project (dev)
- Create all database tables, indexes, RLS policies
- Configure GitHub repo + Vercel deployment
- Set up environment variables
- **Added later:** audit/cost columns on episodes (input_tokens, output_tokens, processing_cost, processing_duration_ms), content_type, thumbnail_url, youtube_tags, like_count
- **Added later:** New tables: processing_config, eval_runs, eval_results, processing_audit_log

### Phase 2: Bulk Podcast Insights Extraction ✅
*The core value — AI processing pipeline + admin UI.*

- Admin authentication (password-based)
- Admin dashboard with show management
- Prompt configuration UI (template editor, model selector, test button)
- Transcript parser (read YAML frontmatter + body from markdown files)
- AI insights extraction (Claude/OpenAI API calls)
- Episode date fetching (YouTube Data API)
- Processing queue with progress tracking
- **Added later:** Prompt eval system (A/B testing with side-by-side comparison, eval_runs + eval_results tables)
- **Not built:** Vector embeddings generation (deferred)

### Phase 3: Home Page ✅
*First public-facing page — the weekly digest.*

- Episode card component (show name, guest, title, date, duration, 5 insights, topics)
- Week grouping logic (group by `published_week`, sort by date DESC)
- Home page with hybrid SSR + client rendering (SSR first batch for SEO, client-side infinite scroll for subsequent pages)
- Infinite scroll with cursor-based pagination via `/api/public/episodes` (30 episodes per page)
- `EpisodeList` client component with `IntersectionObserver` for automatic loading

### Phase 4: Show Pages ✅
*Reuses episode card from Phase 3, filtered by show.*

- Show detail page (`/shows/[slug]`)
- Show header (name, description, episode count)
- Filtered episode listing (same weekly grouping)
- **Not built:** Shows index page (`/shows`) — no dedicated listing page

### Phase 5: Topic Pages ✅
*Reuses episode card from Phase 3, filtered by topic.*

- Topic detail page (`/topics/[slug]`)
- Topic header (name, episode count)
- Filtered episode listing (same weekly grouping)
- **Not built:** Topics index page (`/topics`) — no dedicated listing page

### Phase 6: Navigation & Polish ⚠️ Partial
*Basic navigation works, but incomplete.*

- Top navigation bar with logo, Home, Shows dropdown, Topics dropdown
- Mobile responsive nav (hamburger menu)
- **Not built:** Footer
- **Not built:** Shows index page (`/shows`)
- **Not built:** Topics index page (`/topics`)
- **Not built:** SEO metadata (Open Graph, Twitter cards, structured data)
- **Not built:** Performance optimization (image optimization, font loading)

### Phase 7: Scalable Job Queue Processing System
*Scale from prototype to 10K+ episodes across 100+ shows.*

- **7A: Inngest Integration** ✅ — Inngest v4 job queue with concurrency limit of 5 per show. Triggers defined inside options object.
- **7B: Two-Pass Pipeline** ❌ — Not implemented. Single-pass approach works well. Two-pass is a cost optimization for 10K+ episodes.
- **7C: YouTube + Supadata** ✅ — Hybrid discovery: Supadata for video ID listing, YouTube API for full metadata. Uploads playlist pagination (UC→UU trick). Content type filtering (episodes vs shorts <10 min).
- **7D: Workflow UI** ✅ — 3-step per-show workflow (Discovery → Transcripts → AI Processing). Auto-polling for status updates. Granular status badges. Episode table with transcript/AI status columns.
- **7E: Scheduled Processing** ❌ — Not implemented. All discovery is manual via admin UI.
- **7F: Dashboard** ✅ — Stats, cost tracking columns, processing audit trail, auto-cleanup of stale jobs (>15 min with no progress), Inngest REST API cancellation.

### Unplanned Features Built

These features were not in the original plan but were added during implementation:

- **Prompt Eval System** — Full A/B testing tool for prompts with side-by-side comparison (eval_runs, eval_results tables)
- **Audit Trail & Cost Tracking** — Per-episode token/cost tracking (input_tokens, output_tokens, processing_cost, processing_duration_ms), processing_audit_log table
- **Content Type Filtering** — Videos <10 min automatically tagged as shorts/clips, excluded from processing
- **Auto-cleanup of Stale Jobs** — Auto-detects jobs running >15 min with no progress
- **Inngest Cancellation** — REST API integration to cancel running Inngest functions
- **Granular Show Status** — Not Started → Episodes Ready → Transcripts Ready → Summaries Ready

---

## Shared Components (Created Across Phases)

| Component | Created In | Used In |
|-----------|------------|---------|
| `EpisodeCard` | Phase 3 | Phases 3, 4, 5 |
| `WeekGroup` | Phase 3 | Phases 3, 4, 5 |
| `EpisodeList` (with pagination) | Phase 3 | Phases 3, 4, 5 |
| `TopicBadge` | Phase 3 | Phases 3, 4, 5 |
| `TopNav` | Phase 6 | All public pages |
| `AdminLayout` | Phase 2 | All admin pages |

---

## Key Infrastructure Created Per Phase

| Phase | Database | APIs | Pages | Components |
|-------|----------|------|-------|------------|
| 1 | All tables + RLS | None | None | None |
| 2 | Data populated | Admin APIs | Admin pages | Admin components |
| 3 | None | Public episode API | Home | EpisodeCard, WeekGroup |
| 4 | None | Public show API | Show pages | ShowHeader |
| 5 | None | Public topic API | Topic pages | TopicHeader |
| 6 | None | None | None | TopNav, Footer |
