# Phase 7: Scalable Job Queue Processing System

**Status:** Planned
**Dependencies:** Phase 2 complete (basic extraction pipeline + admin UI working)
**Estimated Effort:** 16-18 sessions (across 6 sub-phases)
**Product Spec Reference:** Backlog #2 — "Multi-Show Bulk Processing", Backlog #3 — "Daily Processing Pipeline"

---

## Table of Contents

- [Context](#context)
- [Architecture Overview](#architecture-overview)
  - [Data Flow](#data-flow)
- [Key Architecture Decisions](#key-architecture-decisions)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [Admin Flow](#admin-flow)
- [Implementation Plan](#implementation-plan)
  - [7A: Inngest Integration + Single-Pass Queue](#7a-inngest-integration--single-pass-queue)
  - [7B: Two-Pass Processing Pipeline](#7b-two-pass-processing-pipeline)
  - [7C: YouTube Discovery + Supadata Transcripts](#7c-youtube-discovery--supadata-transcripts)
  - [7D: Show Processing Workflow UI](#7d-show-processing-workflow-ui)
  - [7E: Scheduled Processing](#7e-scheduled-processing)
  - [7F: Enhanced Admin Dashboard](#7f-enhanced-admin-dashboard)
- [All Files Summary](#all-files-summary)
  - [New Files](#new-files)
  - [Modified Files](#modified-files)
  - [New Environment Variables](#new-environment-variables)
- [Deployment Infrastructure](#deployment-infrastructure)
- [Verification Plan](#verification-plan)
- [Appendix A: Inngest Function Specs](#appendix-a-inngest-function-specs)
- [Appendix B: Supadata API Integration](#appendix-b-supadata-api-integration)
- [Appendix C: YouTube Data API Integration](#appendix-c-youtube-data-api-integration)
- [Appendix D: Cost Estimation](#appendix-d-cost-estimation)

---

## Context

TWITP currently processes podcast transcripts through a fire-and-forget bulk API (`/api/admin/processing/bulk/route.ts`) that runs sequentially with 5-second delays between episodes, subject to Vercel's 5-minute function timeout. This works for small batches (~20 episodes) but will not scale to 10,000+ episodes across hundreds of shows.

**Why now:** The prototype is working with Lenny's Podcast (269 episodes, 5 processed). To expand to 100+ shows and handle ongoing daily ingestion, the system needs a proper job queue with retries, concurrency control, multi-pass AI extraction, automated transcript fetching, and a structured show onboarding workflow.

**Target:** Admin can onboard new shows via YouTube URL, follow a 3-step workflow (discover → test run → full batch), configure AI models per processing pass, and have new episodes auto-discovered and processed on a configurable schedule. The system handles 10,000+ episodes reliably with cost transparency.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        ADMIN BROWSER                                     │
│                                                                          │
│  ┌──────────────────────┐  ┌──────────────────────────────────────────┐ │
│  │ Batch Overview        │  │ Show Processing Detail                   │ │
│  │ /admin/batch          │  │ /admin/batch/[showId]                    │ │
│  │                       │  │                                          │ │
│  │ All shows with        │  │ ▶ Step 1: Discovery                     │ │
│  │ status + stats        │  │   YouTube API → episode list + metadata  │ │
│  │                       │  │                                          │ │
│  │ Click show → detail   │  │ ▶ Step 2: Test Run (5 episodes)         │ │
│  │                       │  │   Supadata → transcripts                 │ │
│  │                       │  │   AI Pass 1 (metadata) + Pass 2 (insights)│ │
│  │                       │  │   Admin reviews & tweaks prompts         │ │
│  │                       │  │                                          │ │
│  │                       │  │ ▶ Step 3: Full Batch                     │ │
│  │                       │  │   Cost estimate → Inngest queue → done   │ │
│  └──────────┬───────────┘  └──────────────────┬───────────────────────┘ │
│             │                                  │                         │
│    /api/admin/batch/*                 /api/admin/inngest/*               │
└─────────────┼──────────────────────────────────┼────────────────────────┘
              │                                  │
              ▼                                  ▼
┌────────────────────────┐  ┌──────────────────────────────────────────────┐
│  Inngest               │  │  External APIs                                │
│  (serverless job queue)│  │                                               │
│                        │  │  YouTube Data API v3                          │
│  batch-process         │  │  → channel info, video listing, metadata      │
│  → fan-out to episodes │  │                                               │
│                        │  │  Supadata API                                 │
│  process-episode       │  │  → fetch transcript per video URL             │
│  → fetch-transcript    │  │  → native captions (1 credit) or             │
│  → pass-1-metadata     │  │    AI transcription (2 credits/min)           │
│  → pass-2-insights     │  │                                               │
│                        │  │  AI Providers                                 │
│  scheduled-discover    │  │  → Gemini Flash / GPT-4o Mini (Pass 1)        │
│  (cron every N hours)  │  │  → Claude Sonnet (Pass 2)                     │
│  → check channels      │  │                                               │
│  → enqueue new eps     │  └──────────────────────────────────────────────┘
└────────────┬───────────┘
             │
             ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  Supabase DB                                                               │
│                                                                            │
│  shows (+ youtube_channel_id, auto_process_enabled, check_interval_hours)  │
│  episodes (+ metadata_status, insights_status, transcript_source, ...)     │
│  insights, topics, episode_topics                                          │
│  processing_config (concurrency, models per pass)                          │
│  processing_jobs (+ inngest_event_id, config_snapshot)                     │
│  prompts (+ pass_type)                                                     │
│  discovery_log (new — tracks auto-discovery runs)                          │
└────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Discover** → Admin enters YouTube URL → YouTube Data API fetches channel info + all video metadata → episodes created in DB with `processing_status: 'pending'`.
2. **Fetch Transcript** → Supadata API called per episode → transcript text stored in `episodes.transcript_text`.
3. **Pass 1 (Metadata)** → Cheap model (Gemini Flash) extracts guest_name, topics, tags from episode title + description (short input, very cheap).
4. **Pass 2 (Insights)** → Premium model (Claude Sonnet) extracts insights, summary, quotes from full transcript.
5. **Scheduled** → Inngest cron checks enabled shows for new videos since `last_checked_at` → auto-enqueues through full pipeline.

---

## Key Architecture Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| **Job queue runtime** | **Inngest** | Serverless, native Vercel/Next.js integration, built-in retries, concurrency control, step functions, cron. No infrastructure to manage. |
| **Transcript fetching** | **Supadata API** | Reliable paid API vs brittle scraper. Supports native captions + AI fallback. Async handling for long videos built in. |
| **Episode discovery** | **YouTube Data API v3** | Supadata only fetches transcripts, not video listings. YouTube API discovers all videos from a channel with full metadata. |
| **Processing model** | **Two-pass pipeline** | Pass 1 (metadata from title+description) is very cheap. Pass 2 (insights from transcript) needs quality. Each pass independently retryable. |
| **Concurrency** | **Configurable via admin UI** | Inngest supports `concurrency: { limit: N }` natively. Admin starts low, increases as rate limits allow. |
| **Admin workflow** | **3-step per show** | Discovery → Test Run → Full Batch prevents expensive mistakes. Admin reviews quality before committing to 10K API calls. |
| **Keep existing system** | **Parallel paths** | Current `/api/admin/processing/bulk` stays functional during migration. New Inngest path is separate. |

---

## Database Schema

### New Table: `processing_config`

```sql
-- processing_config
--   id              uuid PK default gen_random_uuid()
--   key             text UNIQUE NOT NULL
--   value           jsonb NOT NULL
--   updated_at      timestamptz default now()
--
-- Stores: concurrency_limit, pass_1_model, pass_1_prompt_id, pass_2_model,
--         pass_2_prompt_id, check_interval_hours, etc.
-- RLS: No public access (admin-only via service role)
```

### New Table: `discovery_log`

```sql
-- discovery_log
--   id                  uuid PK default gen_random_uuid()
--   show_id             uuid FK references shows(id) ON DELETE CASCADE
--   checked_at          timestamptz default now()
--   new_episodes_found  integer default 0
--   episodes_queued     integer default 0
--   error_message       text
--   created_at          timestamptz default now()
--
-- RLS: No public access (admin-only via service role)
```

### Modified Table: `episodes`

```sql
-- Add columns:
--   metadata_status      text default 'pending' CHECK IN ('pending','processing','completed','failed')
--   insights_status      text default 'pending' CHECK IN ('pending','processing','completed','failed')
--   metadata_model       text          -- e.g. 'google/gemini-flash'
--   insights_model       text          -- e.g. 'anthropic/claude-sonnet-4-5-20250929'
--   metadata_error       text
--   insights_error       text
--   transcript_source    text default 'manual' CHECK IN ('manual','youtube','supadata')
--   youtube_view_count   integer
--   youtube_like_count   integer
--   youtube_thumbnail_url text
--   youtube_published_at timestamptz
--   has_native_captions  boolean
```

### Modified Table: `shows`

```sql
-- Add columns:
--   youtube_channel_url    text
--   youtube_playlist_id    text
--   last_checked_at        timestamptz
--   auto_process_enabled   boolean default false
--   check_interval_hours   integer default 24
```

### Modified Table: `prompts`

```sql
-- Add column:
--   pass_type    text default 'full' CHECK IN ('full', 'metadata', 'insights')
```

### Modified Table: `processing_jobs`

```sql
-- Add columns:
--   inngest_event_id    text
--   config_snapshot     jsonb
--   concurrency_used    integer
```

---

## API Endpoints

### Inngest & Processing APIs

| Method | Endpoint | Description | Phase |
|--------|----------|-------------|-------|
| POST | `/api/inngest` | Inngest serve endpoint (required by SDK) | 7A |
| POST | `/api/admin/inngest/batch` | Start batch processing via Inngest | 7A |
| GET | `/api/admin/inngest/status` | Get queue status | 7A |
| POST | `/api/admin/inngest/cancel` | Cancel a running batch | 7A |
| POST | `/api/admin/inngest/retry` | Retry failed episodes | 7A |
| GET | `/api/admin/config` | Get processing config | 7A |
| PUT | `/api/admin/config` | Update processing config | 7A |

### YouTube & Supadata APIs

| Method | Endpoint | Description | Phase |
|--------|----------|-------------|-------|
| POST | `/api/admin/youtube/discover` | Discover videos from YouTube channel | 7C |
| POST | `/api/admin/shows/add-youtube` | Add show by YouTube URL | 7C |

### Batch Workflow APIs

| Method | Endpoint | Description | Phase |
|--------|----------|-------------|-------|
| GET | `/api/admin/batch/[showId]/status` | Show processing status | 7D |
| POST | `/api/admin/batch/[showId]/test-run` | Start test run (5 episodes) | 7D |
| POST | `/api/admin/batch/[showId]/full-batch` | Start full batch | 7D |

### Dashboard APIs

| Method | Endpoint | Description | Phase |
|--------|----------|-------------|-------|
| GET | `/api/admin/dashboard/stats` | Aggregate processing stats | 7F |

---

## Admin Flow

### Show Onboarding Workflow (3 Steps)

**Step 1: Discovery**
1. Admin navigates to `/admin/batch` → clicks "Add Show"
2. Enters YouTube channel/playlist URL
3. System resolves channel ID, fetches metadata, creates show record
4. Clicks "Fetch Episodes" → YouTube API discovers all videos
5. Episode list appears: title, date, duration, views, has captions ✓/✗

**Step 2: Test Run**
1. Admin selects 5 episodes (or accepts auto-selection)
2. Clicks "Fetch Transcripts" → Supadata fetches transcripts for selected episodes
3. Clicks "Run Pass 1 (Metadata)" → cheap model extracts guest_name, topics, tags
4. Clicks "Run Pass 2 (Insights)" → premium model extracts insights, summary, quotes
5. Reviews output inline → tweaks prompts if needed → re-runs

**Step 3: Full Batch**
1. System shows cost estimate (based on episode count, caption availability, model pricing)
2. Admin sets concurrency, selects passes (metadata only / insights only / both)
3. Clicks "Start Full Batch"
4. Watches granular progress: Transcripts N/M → Metadata N/M → Insights N/M → Failed N
5. Can expand failed episodes to see errors, retry individual episodes

---

## Implementation Plan

### 7A: Inngest Integration + Single-Pass Queue

*~3 sessions. Install Inngest, create serve route, migrate current bulk processing to Inngest step functions with configurable concurrency.*

#### What Ships

- Inngest SDK installed and configured with Next.js serve route at `/api/inngest`
- `batch-process` Inngest function that replaces fire-and-forget bulk processing
- Each episode processed as an independent Inngest step with automatic retry (3 attempts, exponential backoff)
- Configurable concurrency via `processing_config` table
- Admin Processing page extended with concurrency selector, cancel button, retry button
- Existing `/api/admin/processing/bulk` route remains functional (not deleted)

---

### 7B: Two-Pass Processing Pipeline

*~3 sessions. Split extraction into metadata pass (cheap model, uses title+description) and insights pass (premium model, uses transcript).*

#### What Ships

- Two-pass processing: Pass 1 (metadata) and Pass 2 (insights) as separate Inngest steps
- Pass 1 uses only episode title + description — very cheap, no transcript needed
- Pass 2 uses full transcript — premium model for quality insights
- Admin Settings page to configure model/prompt for each pass
- Google Gemini provider added to `providers.ts`
- Ability to re-run just one pass independently
- `prompts` table extended with `pass_type` column
- `episodes` table extended with per-pass status columns

---

### 7C: YouTube Discovery + Supadata Transcripts

*~3 sessions. Auto-discover videos from YouTube channels and fetch transcripts via Supadata API.*

#### What Ships

- YouTube Data API v3 integration for video discovery (channel listing, video metadata)
- Supadata API integration for transcript fetching (native captions + AI fallback)
- Add show by YouTube URL (supports `@Channel`, `/channel/UCxxx`, playlist URLs)
- "Discover Episodes" Inngest function: paginate all videos, create episode records
- "Fetch Transcript" Inngest function: call Supadata per episode, handle async jobs for long videos
- Episodes store full YouTube metadata: title, description, publishedAt, duration, viewCount, likeCount, thumbnails, caption availability

---

### 7D: Show Processing Workflow UI

*~3 sessions. The core admin experience: structured 3-step workflow for onboarding and processing each show.*

#### What Ships

**Batch Overview Page** (`/admin/batch`):
- Summary stats: total shows, total episodes processed, currently running, queued, failed
- Shows table: name, status (Planned/Discovering/Test Run/Processing/Completed), episode counts, last updated
- Grouped by status: Currently Processing → Queued → Completed → Planned

**Show Processing Detail Page** (`/admin/batch/[showId]`):

- **▶ Step 1: Discovery** (collapsible)
  - YouTube URL input, "Fetch Episodes" button
  - Status: Not Started / Fetching / Complete (N episodes found)
  - Episode list: title, date, duration, views, has captions ✓/✗
  - Select/deselect episodes

- **▶ Step 2: Test Run** (collapsible)
  - Auto-selects 5 episodes or admin picks
  - Buttons: Fetch Transcripts → Run Pass 1 → Run Pass 2
  - Inline output review: guest_name, topics, insights, summary per episode
  - "Re-run with different prompt" option
  - Per-episode status: transcript ✓ / metadata ✓ / insights ✓

- **▶ Step 3: Full Batch** (collapsible)
  - Cost estimate before starting
  - Concurrency selector, pass selector
  - "Start Full Batch" button
  - Progress: Transcripts N/M → Metadata N/M → Insights N/M → Failed N
  - Failed episodes expandable with errors + retry button

---

### 7E: Scheduled Processing

*~2 sessions. Inngest cron that auto-discovers new episodes on configurable interval.*

#### What Ships

- Inngest cron function `scheduled-discover` that runs hourly
- Checks `processing_config.check_interval_hours` and skips if not enough time since `show.last_checked_at`
- Per-show enable/disable toggle in admin
- Auto-enqueues new episodes through full pipeline (transcript → Pass 1 → Pass 2)
- `discovery_log` table records each check: when, how many found, how many queued

---

### 7F: Enhanced Admin Dashboard

*~2 sessions. Comprehensive dashboard with cost estimation and job history.*

#### What Ships

- Dashboard page with running/queued/completed/failed counts
- Per-show processing status with completion percentage
- Cost estimator: calculates expected cost before starting a batch based on episode count, caption availability, and model pricing
- Filterable job history table
- Retry controls for failed episodes

---

## All Files Summary

### New Files

| File | Purpose | Ships |
|------|---------|-------|
| `src/lib/inngest/client.ts` | Inngest client initialization | 7A |
| `src/lib/inngest/functions/batch-process.ts` | Fan-out batch function | 7A |
| `src/lib/inngest/functions/process-episode.ts` | Per-episode processing steps | 7A |
| `src/app/api/inngest/route.ts` | Inngest serve endpoint | 7A |
| `src/app/api/admin/inngest/batch/route.ts` | Start batch | 7A |
| `src/app/api/admin/inngest/status/route.ts` | Queue status | 7A |
| `src/app/api/admin/inngest/cancel/route.ts` | Cancel batch | 7A |
| `src/app/api/admin/inngest/retry/route.ts` | Retry failed | 7A |
| `src/app/api/admin/config/route.ts` | Config CRUD | 7A |
| `supabase/migrations/00003_processing_queue.sql` | Config + jobs schema | 7A |
| `src/lib/ai/extract-metadata.ts` | Pass 1: metadata from title+description | 7B |
| `src/lib/ai/extract-insights-v2.ts` | Pass 2: insights from transcript | 7B |
| `src/app/admin/settings/page.tsx` | Admin settings page | 7B |
| `src/app/admin/settings/_components/processing-settings.tsx` | Model/prompt config per pass | 7B |
| `supabase/migrations/00004_two_pass_pipeline.sql` | Two-pass schema | 7B |
| `src/lib/youtube/client.ts` | YouTube Data API v3 client | 7C |
| `src/lib/youtube/discover.ts` | Video discovery + pagination | 7C |
| `src/lib/supadata/client.ts` | Supadata API client | 7C |
| `src/lib/supadata/transcript.ts` | Async transcript fetching + polling | 7C |
| `src/lib/inngest/functions/discover-episodes.ts` | YouTube discovery Inngest function | 7C |
| `src/lib/inngest/functions/fetch-transcript.ts` | Supadata transcript Inngest function | 7C |
| `src/app/api/admin/youtube/discover/route.ts` | Discovery API | 7C |
| `src/app/api/admin/shows/add-youtube/route.ts` | Add show by YouTube URL | 7C |
| `supabase/migrations/00005_youtube_ingestion.sql` | YouTube schema | 7C |
| `src/app/admin/batch/page.tsx` | Batch overview page | 7D |
| `src/app/admin/batch/_components/show-table.tsx` | Shows table | 7D |
| `src/app/admin/batch/_components/summary-stats.tsx` | Summary cards | 7D |
| `src/app/admin/batch/[showId]/page.tsx` | Show processing detail | 7D |
| `src/app/admin/batch/[showId]/_components/discovery-section.tsx` | Step 1 UI | 7D |
| `src/app/admin/batch/[showId]/_components/test-run-section.tsx` | Step 2 UI | 7D |
| `src/app/admin/batch/[showId]/_components/full-batch-section.tsx` | Step 3 UI | 7D |
| `src/app/admin/batch/[showId]/_components/episode-status-table.tsx` | Per-episode status | 7D |
| `src/app/api/admin/batch/[showId]/status/route.ts` | Status endpoint | 7D |
| `src/app/api/admin/batch/[showId]/test-run/route.ts` | Test run endpoint | 7D |
| `src/app/api/admin/batch/[showId]/full-batch/route.ts` | Full batch endpoint | 7D |
| `src/lib/inngest/functions/scheduled-discover.ts` | Cron function | 7E |
| `src/app/admin/settings/_components/scheduling-settings.tsx` | Scheduling UI | 7E |
| `supabase/migrations/00006_scheduling.sql` | Scheduling schema | 7E |
| `src/app/admin/dashboard/page.tsx` | Dashboard page | 7F |
| `src/app/admin/dashboard/_components/queue-status.tsx` | Queue status cards | 7F |
| `src/app/admin/dashboard/_components/cost-estimator.tsx` | Cost estimation | 7F |
| `src/app/admin/dashboard/_components/job-history.tsx` | Job history table | 7F |
| `src/app/api/admin/dashboard/stats/route.ts` | Stats endpoint | 7F |
| `src/lib/cost/estimator.ts` | Cost estimation logic | 7F |

### Modified Files

| File | Change | Ships |
|------|--------|-------|
| `package.json` | Add `inngest` | 7A |
| `processing-panel.tsx` | Concurrency selector, cancel/retry, Inngest endpoint | 7A |
| `extract-insights.ts` | Refactor core logic for reuse | 7A |
| `process-episode.ts` | Two-pass steps | 7B |
| `providers.ts` | Add Google Gemini provider | 7B |
| `package.json` | Add `googleapis` or YouTube client | 7C |
| `src/app/admin/layout.tsx` | Add "Batch" and "Dashboard" nav links | 7D |
| `src/app/api/inngest/route.ts` | Register cron function | 7E |
| `src/app/admin/settings/page.tsx` | Add scheduling tab | 7E |

### New Environment Variables

| Variable | Purpose | Phase |
|----------|---------|-------|
| `INNGEST_EVENT_KEY` | Inngest event key (production) | 7A |
| `INNGEST_SIGNING_KEY` | Inngest webhook signing (production) | 7A |
| `GOOGLE_AI_API_KEY` | Gemini Flash for cheap metadata extraction | 7B |
| `YOUTUBE_API_KEY` | YouTube Data API v3 | 7C |
| `SUPADATA_API_KEY` | Supadata transcript API | 7C |

---

## Deployment Infrastructure

### What Already Exists

| Layer | Service | Status |
|-------|---------|--------|
| Hosting | Vercel (Next.js) | Active |
| Database | Supabase (PostgreSQL) | Active |
| AI | Anthropic Claude API | Active |
| AI | OpenAI API | Active |
| Source Control | GitHub | Active |

### What's New

| New Infrastructure | Cost | Notes |
|-------------------|------|-------|
| Inngest (job queue) | Free: 25K steps/mo. Pro: $50/mo for 100K steps | Each episode ≈ 4-6 steps. 10K eps = ~50K steps. |
| YouTube Data API v3 | Free: 10,000 units/day | Channel with 300 videos costs ~10 units. |
| Supadata API | Native captions: 1 credit/video. AI transcription: 2 credits/min | 10K eps with 90% native captions ≈ 10K-15K credits. |
| Google Gemini API | Gemini Flash: ~$0.075/M input tokens | For metadata extraction. ~$0.001 per episode. |

**Cost impact at 10K episodes:**

| Item | Cost |
|------|------|
| AI Pass 1 (metadata, Gemini Flash, short input) | ~$10-20 |
| AI Pass 2 (insights, Claude Sonnet, full transcript) | ~$100-150 |
| Supadata (native captions ~90%) | ~$10-15 |
| Supadata (AI transcription ~10%) | ~$50-100 |
| Inngest | Free tier or $50/mo Pro |
| YouTube API | Free |
| **Total for 10K episodes** | **~$200-350** |

---

## Verification Plan

### After 7A (Inngest Integration)

1. Inngest Dev Server runs alongside Next.js (`npx inngest-cli@latest dev`)
2. Process 5 episodes via admin → all complete successfully
3. Set concurrency to 2 → verify only 2 run simultaneously in Inngest dashboard
4. Kill one mid-flight → confirm automatic retry
5. Cancel a batch → confirm remaining episodes stop
6. Old `/api/admin/processing/bulk` route still works independently
7. `npm run build` passes

### After 7B (Two-Pass Pipeline)

8. Process 5 episodes through both passes sequentially
9. `metadata_status` and `insights_status` update independently
10. Re-run "insights only" → metadata unchanged
11. Switch Pass 1 to GPT-4o Mini → verify it uses cheap model
12. Eval system still works (completely separate, untouched)
13. `npm run build` passes

### After 7C (YouTube + Supadata)

14. Add Lenny's Podcast by YouTube channel URL (`@LennysPodcast`)
15. Discover episodes → all videos found with full metadata
16. Fetch transcripts for 5 episodes via Supadata
17. Re-run discovery → no duplicates created
18. `has_native_captions` correctly reflects caption availability
19. `npm run build` passes

### After 7D (Workflow UI)

20. `/admin/batch` shows all shows with correct statuses and stats
21. Click into show → 3 collapsible sections render
22. Step 1: Discovery fetches episodes, list populates
23. Step 2: Test Run processes 5 episodes, inline output visible
24. Step 3: Full Batch shows cost estimate, progress updates in real-time
25. Retry failed episode from detail page
26. `npm run build` passes

### After 7E (Scheduled Processing)

27. Enable auto-processing for a show
28. Manually trigger cron via Inngest dashboard → detects check needed
29. `discovery_log` records the run
30. Disable auto-processing → cron skips the show
31. `npm run build` passes

### After 7F (Dashboard)

32. Dashboard shows accurate aggregate counts
33. Cost estimation reasonable for batch of 100 episodes
34. Job history filterable by show and status
35. Retry failed episodes from dashboard
36. `npm run build` passes

---

# Appendices — Detailed Implementation Specs

---

## Appendix A: Inngest Function Specs

### A.1 Inngest Client

```typescript
// src/lib/inngest/client.ts
import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "twitp" });
```

### A.2 Inngest Serve Route

```typescript
// src/app/api/inngest/route.ts
import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { batchProcess } from "@/lib/inngest/functions/batch-process";
import { processEpisode } from "@/lib/inngest/functions/process-episode";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [batchProcess, processEpisode],
});
```

### A.3 Batch Process Function

- Event: `"batch/process.requested"`
- Data: `{ jobId, showId, limit?, forceReprocess? }`
- Steps: query episodes → filter → fan-out individual events
- No concurrency limit (coordinator, not worker)

### A.4 Process Episode Function

- Event: `"episode/process.requested"`
- Data: `{ episodeId, jobId, passes: ("metadata" | "insights")[] }`
- Concurrency: `{ limit: N, key: "event.data.showId" }` — N from `processing_config`
- Retries: 3 with exponential backoff
- Steps (Phase 7B):
  1. `step.run("fetch-transcript")` — Supadata if not already stored
  2. `step.run("pass-1-metadata")` — cheap model, title+description input
  3. `step.run("save-metadata")` — update episodes + topics
  4. `step.run("pass-2-insights")` — premium model, transcript input
  5. `step.run("save-insights")` — update insights table + episode summary
  6. `step.run("update-progress")` — increment job progress

---

## Appendix B: Supadata API Integration

### B.1 Transcript Fetching

```
GET https://api.supadata.ai/v1/transcript
Headers: x-api-key: {SUPADATA_API_KEY}
Params:
  url: https://www.youtube.com/watch?v={videoId}
  text: true          (plain text, not timestamped)
  mode: auto           (native captions first, AI fallback)
```

### B.2 Async Handling (videos >20min)

Most podcast episodes are 30-90 minutes → will return HTTP 202 with `jobId`.

```
Poll: GET https://api.supadata.ai/v1/transcript/{jobId}
Status: queued → active → completed → failed
```

Inngest step with `step.sleep()` + `step.run()` polling loop, or use Inngest's `step.waitForEvent()`.

### B.3 Cost

- Native captions: 1 credit per video
- AI transcription: 2 credits per minute of audio
- 60min podcast with no captions: 120 credits

---

## Appendix C: YouTube Data API Integration

### C.1 Channel URL Parsing

Support these URL formats:
- `https://www.youtube.com/@LennysPodcast` → search API to resolve channel ID
- `https://www.youtube.com/channel/UCxyz` → direct channel ID
- `https://www.youtube.com/playlist?list=PLxyz` → playlist ID

### C.2 Video Discovery Flow

1. `channels.list(id=channelId, part=contentDetails)` → get uploads playlist ID
2. `playlistItems.list(playlistId, part=snippet, maxResults=50)` → paginate all video IDs
3. `videos.list(id=videoIds, part=snippet,contentDetails,statistics)` → batch of 50, get full metadata

### C.3 Metadata Returned Per Video

| Field | Source | Used For |
|-------|--------|----------|
| title | snippet.title | Episode title, guest name parsing |
| description | snippet.description | Topics, guest bio, show notes |
| publishedAt | snippet.publishedAt | Published date, week grouping |
| duration | contentDetails.duration | Episode duration |
| caption | contentDetails.caption | Has native captions (true/false) |
| viewCount | statistics.viewCount | Popularity signal |
| likeCount | statistics.likeCount | Quality signal |
| thumbnails | snippet.thumbnails | Episode artwork |
| tags | snippet.tags | Creator-provided topics |

### C.4 API Quota

- 10,000 units/day (free tier)
- `channels.list` = 1 unit, `playlistItems.list` = 1 unit/page, `videos.list` = 1 unit/batch
- Channel with 300 videos ≈ 10 units total

---

## Appendix D: Cost Estimation

### D.1 Model Pricing Map

```typescript
const MODEL_PRICING: Record<string, { inputPer1kTokens: number; outputPer1kTokens: number }> = {
  "anthropic/claude-sonnet-4-5-20250929": { inputPer1kTokens: 0.003, outputPer1kTokens: 0.015 },
  "openai/gpt-4o-mini": { inputPer1kTokens: 0.00015, outputPer1kTokens: 0.0006 },
  "google/gemini-flash": { inputPer1kTokens: 0.000075, outputPer1kTokens: 0.0003 },
};
```

### D.2 Estimation Formula

```
Pass 1 cost = episodes × avg(title + description tokens) × Pass 1 model input price
Pass 2 cost = episodes × avg(transcript tokens) × Pass 2 model input price
Supadata cost = (episodes with captions × 1 credit) + (episodes without × avg_duration_min × 2 credits)
Total = Pass 1 + Pass 2 + Supadata
```
