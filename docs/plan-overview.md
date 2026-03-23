# ThisWeekInTechPodcasts.com — Implementation Plan Overview

> **Product Spec:** [docs/product-spec.md](./product-spec.md)
> **Status:** Planning
> **Date:** March 2026

---

## Phase Dependency Graph

```
Phase 1: Project Setup & Data Model
    │
    ▼
Phase 2: Bulk Podcast Insights Extraction (Admin UI + AI Pipeline)
    │
    ▼
Phase 3: Home Page (weekly episode digest)
    │
    ├──────────────────┐
    ▼                  ▼
Phase 4: Show Pages   Phase 5: Topic Pages
    │                  │
    └──────────────────┘
             │
             ▼
Phase 6: Navigation & Polish (nav dropdowns, SEO, responsive)
    │
    ▼
Phase 7: Scalable Job Queue Processing System
    ├── 7A: Inngest Integration + Single-Pass Queue
    ├── 7B: Two-Pass Processing Pipeline
    ├── 7C: YouTube Discovery + Supadata Transcripts
    ├── 7D: Show Processing Workflow UI
    ├── 7E: Scheduled Processing (cron)
    └── 7F: Enhanced Admin Dashboard
```

---

## Phase Summary

| Phase | Feature | Est. Sessions | Dependencies | Plan Doc |
|-------|---------|---------------|-------------|----------|
| 1 | Project Setup & Data Model | 2-3 | None | [phase-1-project-setup.md](./plans/phase-1-project-setup.md) |
| 2 | Bulk Insights Extraction | 4-6 | Phase 1 | [phase-2-insights-extraction.md](./plans/phase-2-insights-extraction.md) |
| 3 | Home Page | 2-3 | Phase 2 | [phase-3-home-page.md](./plans/phase-3-home-page.md) |
| 4 | Show Pages | 1-2 | Phase 3 | [phase-4-show-pages.md](./plans/phase-4-show-pages.md) |
| 5 | Topic Pages | 1-2 | Phase 3 | [phase-5-topic-pages.md](./plans/phase-5-topic-pages.md) |
| 6 | Navigation & Polish | 2-3 | Phases 4-5 | [phase-6-navigation-polish.md](./plans/phase-6-navigation-polish.md) |
| 7 | Scalable Job Queue Processing | 16-18 | Phase 2 | [phase-7-scalable-processing.md](./plans/phase-7-scalable-processing.md) |

**Total estimated: 28-37 sessions**

---

## Phase Details

### Phase 1: Project Setup & Data Model
*Foundation — everything depends on this.*

- Initialize Next.js 15 project with TypeScript, Tailwind CSS 4, ESLint
- Set up Supabase project (dev)
- Create all database tables, indexes, RLS policies
- Configure GitHub repo + Vercel deployment
- Set up environment variables
- Verify: `npm run build` passes, Supabase tables created, Vercel deploys

### Phase 2: Bulk Podcast Insights Extraction
*The core value — AI processing pipeline + admin UI.*

- Admin authentication (password-based)
- Admin dashboard with show management
- Prompt configuration UI (template editor, model selector, test button)
- Transcript parser (read YAML frontmatter + body from markdown files)
- AI insights extraction (Claude/OpenAI API calls)
- Episode date fetching (YouTube Data API)
- Processing queue with progress tracking
- Vector embeddings generation
- Verify: Process all 269 Lenny's Podcast episodes, insights in DB

### Phase 3: Home Page
*First public-facing page — the weekly digest.*

- Episode card component (show name, guest, title, date, duration, 5 insights, topics)
- Week grouping logic (group by `published_week`, sort by date DESC)
- Home page with ISR (revalidate hourly)
- Pagination (load more weeks)
- Verify: Home page renders with real data from Phase 2

### Phase 4: Show Pages
*Reuses episode card from Phase 3, filtered by show.*

- Show detail page (`/shows/[slug]`)
- Show header (name, description, episode count)
- Filtered episode listing (same weekly grouping)
- Shows index page (`/shows`)
- Verify: Lenny's Podcast show page renders with all episodes

### Phase 5: Topic Pages
*Reuses episode card from Phase 3, filtered by topic.*

- Topic detail page (`/topics/[slug]`)
- Topic header (name, episode count)
- Filtered episode listing (same weekly grouping)
- Topics index page (`/topics`)
- Verify: Topic pages render with correctly tagged episodes

### Phase 6: Navigation & Polish
*Ties everything together.*

- Top navigation bar with logo, Home, Shows dropdown, Topics dropdown
- Mobile responsive nav (hamburger menu)
- SEO metadata (Open Graph, Twitter cards, structured data)
- Loading states and error pages
- Footer
- Performance optimization (image optimization, font loading)
- Verify: Full user flow works end-to-end, Lighthouse score > 90

### Phase 7: Scalable Job Queue Processing System
*Scale from prototype to 10K+ episodes across 100+ shows.*

- **7A: Inngest Integration** — Replace fire-and-forget with Inngest job queue, configurable concurrency
- **7B: Two-Pass Pipeline** — Pass 1 (metadata from title+description, cheap model) + Pass 2 (insights from transcript, premium model)
- **7C: YouTube + Supadata** — Discover episodes via YouTube API, fetch transcripts via Supadata API
- **7D: Workflow UI** — 3-step per-show workflow: Discover → Test Run (5 eps) → Full Batch. Batch overview page + show detail page with collapsible sections
- **7E: Scheduled Processing** — Inngest cron auto-discovers new episodes on configurable interval
- **7F: Dashboard** — Processing stats, cost estimation, job history, retry controls
- Verify: Process 10K+ episodes reliably with cost transparency

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
