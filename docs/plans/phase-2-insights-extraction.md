# Phase 2: Bulk Podcast Insights Extraction

**Status:** Planned
**Dependencies:** Phase 1 complete (database schema, Supabase connected)
**Estimated Effort:** 4-6 sessions (across 3 implementation steps)
**Product Spec Reference:** Backlog item — "Bulk Podcast Insights Extraction"

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
  - [2A: Admin Auth & Dashboard](#2a-admin-auth--dashboard)
  - [2B: Transcript Parser & AI Pipeline](#2b-transcript-parser--ai-pipeline)
  - [2C: Processing UI & Vector Embeddings](#2c-processing-ui--vector-embeddings)
- [All Files Summary](#all-files-summary)
- [Verification Plan](#verification-plan)
- [Appendix A: AI Prompt Design](#appendix-a-ai-prompt-design)

---

## Context

This is the core value-creation phase. It builds the AI pipeline that transforms raw podcast transcripts into structured insights, topics, and metadata. It also creates the admin UI for configuring prompts, selecting models, and monitoring processing jobs.

**Why now:** Phase 1 created the database and project. We need data in the database before building any public-facing pages (Phases 3-6).

**Target:** Admin can log in, configure prompts, and process all 269 Lenny's Podcast transcripts. Each episode has 5 key insights, topic tags, guest name, summary, and publish date extracted. Vector embeddings built for future search.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                      ADMIN BROWSER                                │
│                                                                   │
│  ┌─────────────────────┐  ┌────────────────────┐                 │
│  │ Show Management      │  │ Prompt Editor       │                │
│  │ - Add/edit shows     │  │ - Template text      │                │
│  │ - Set source path    │  │ - Model selector     │                │
│  └──────────┬──────────┘  │ - Test with sample   │                │
│             │              └────────┬─────────────┘                │
│  ┌──────────┴──────────────────────┴──────────────┐              │
│  │ Processing Monitor                              │              │
│  │ - Start bulk/single processing                  │              │
│  │ - Progress bar (X / 269)                        │              │
│  │ - Status per episode                            │              │
│  └──────────┬──────────────────────────────────────┘              │
└─────────────┼────────────────────────────────────────────────────┘
              │
              ▼  POST /api/admin/processing/bulk
┌──────────────────────────────────────────────────────────────────┐
│  API Route (Serverless)                                           │
│                                                                   │
│  1. Read transcripts from filesystem                              │
│  2. Parse YAML frontmatter + transcript body                      │
│  3. Create episode record in DB (if new)                          │
│  4. Call AI API (Claude/OpenAI) with prompt + transcript          │
│  5. Parse structured response (insights, topics, summary)         │
│  6. Save insights, topics, episode_topics to DB                   │
│  7. Update episode processing_status = 'completed'                │
│  8. Update processing_job progress                                │
└──────────────────────┬───────────────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
┌──────────────┐ ┌──────────┐ ┌──────────────────┐
│ Supabase DB   │ │ Claude   │ │ YouTube Data API  │
│ episodes      │ │ API      │ │ (publish dates)   │
│ insights      │ │  or      │ │                    │
│ topics        │ │ OpenAI   │ │                    │
│ embeddings    │ │ API      │ │                    │
└──────────────┘ └──────────┘ └──────────────────┘
```

### Data Flow

1. **Import** → Admin triggers processing → API reads transcript files from local filesystem → Parses YAML metadata + transcript text.
2. **Extract** → Transcript sent to AI API with configured prompt → AI returns structured JSON (insights, topics, summary, guest).
3. **Store** → Parsed results saved to `episodes`, `insights`, `topics`, `episode_topics` tables.
4. **Date Fetch** → Separate job fetches publish dates from YouTube Data API using `video_id`.
5. **Embed** → Separate job generates vector embeddings for insights and summaries → Stored in `content_embeddings`.

---

## Key Architecture Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| **Processing approach** | Sequential API calls per episode (not batch) | Simplicity; AI APIs process one transcript at a time; easy to track progress and retry failures |
| **Transcript reading** | Read from local filesystem (not uploaded) | Transcripts already exist in Content/ folder; avoids upload UI complexity for MVP |
| **AI response format** | Structured JSON output | Reliable parsing; Claude and GPT-4o both support structured output |
| **YouTube date fetching** | Separate job from insights extraction | Different API, different rate limits; can run independently |
| **Admin auth** | Cookie-based password session | Simple for single admin; no Supabase Auth overhead |
| **Processing queue** | DB table (processing_jobs) polled by client | Simple; no external queue service needed for MVP scale |

---

## Database Schema

No new tables — all tables created in Phase 1. This phase populates:
- `shows` (Lenny's Podcast record)
- `episodes` (269 records)
- `insights` (5 per episode = ~1,345 records)
- `topics` (extracted from AI + existing keyword index)
- `episode_topics` (many-to-many links)
- `prompts` (default prompt updated/refined)
- `processing_jobs` (job tracking records)
- `content_embeddings` (vector embeddings)

---

## API Endpoints

### Admin APIs

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/admin/auth` | Admin login (set cookie) | Password |
| GET | `/api/admin/auth/check` | Verify admin session | Cookie |
| GET | `/api/admin/shows` | List shows with stats | Admin |
| POST | `/api/admin/shows` | Create show | Admin |
| PATCH | `/api/admin/shows/[id]` | Update show | Admin |
| GET | `/api/admin/prompts` | List prompts | Admin |
| PATCH | `/api/admin/prompts/[id]` | Update prompt | Admin |
| POST | `/api/admin/prompts/[id]/test` | Test prompt with sample | Admin |
| POST | `/api/admin/processing/bulk` | Start bulk extraction | Admin |
| POST | `/api/admin/processing/episode/[id]` | Reprocess single episode | Admin |
| GET | `/api/admin/processing/jobs` | List processing jobs | Admin |
| GET | `/api/admin/processing/jobs/[id]` | Job detail with progress | Admin |
| POST | `/api/admin/processing/fetch-dates` | Fetch YouTube dates | Admin |
| POST | `/api/admin/processing/build-embeddings` | Build vector embeddings | Admin |

---

## Admin Flow

### Authentication

1. Navigate to `/admin` → see login form
2. Enter password → `POST /api/admin/auth` → sets HTTP-only cookie
3. Cookie checked on all admin pages via middleware
4. Cookie expires after 24 hours

### Show Management

1. Navigate to `/admin/shows`
2. Click "Add Show" → form: name, slug, host, description, transcript path
3. For prototype: add "Lenny's Podcast" with path to `Content/lennys-podcast-transcripts/episodes/`
4. Show appears in list with episode count = 0 (not yet processed)

### Prompt Configuration

1. Navigate to `/admin/prompts`
2. See default "insights_extraction" prompt
3. Edit template — uses `{transcript}`, `{show_name}`, `{episode_title}` variables
4. Select model: Claude Sonnet or GPT-4o
5. Click "Test" → picks a random transcript → calls AI → shows parsed output
6. Iterate on prompt until quality is good
7. Save → prompt version incremented

### Bulk Processing

1. Navigate to `/admin/processing`
2. Select show (Lenny's Podcast)
3. Click "Process All Episodes"
4. System creates processing_job record
5. API starts processing:
   - Reads transcript files from filesystem
   - For each: parse → call AI → save results → update progress
6. Admin sees progress bar updating (polling every 3s)
7. Can see per-episode status (completed, failed, pending)
8. Failed episodes can be retried individually

### Date Fetching

1. Click "Fetch Publish Dates" for a show
2. System batch-fetches dates from YouTube Data API using `video_id`
3. Updates `published_at` and `published_week` on episode records
4. YouTube API quota: ~50 videos per request (batch endpoint)

### Embeddings

1. Click "Build Embeddings" after insights extraction is done
2. System generates embeddings for each insight and episode summary
3. Stores in `content_embeddings` with HNSW index

---

## Implementation Plan

### 2A: Admin Auth & Dashboard

*~1-2 sessions. Admin login, layout, show management.*

#### What Ships

- Admin login page (`/admin/login`)
- Admin auth API (password verification, cookie session)
- Admin middleware (check cookie on `/admin/*` routes)
- Admin layout with sidebar nav (Dashboard, Shows, Prompts, Processing)
- Admin dashboard with placeholder stats
- Show CRUD pages (list, create, edit)
- Supabase admin client (service role) for all write operations

---

### 2B: Transcript Parser & AI Pipeline

*~2-3 sessions. Core processing — the most complex step.*

#### What Ships

- Transcript parser: reads markdown files, extracts YAML frontmatter + body
- Episode importer: creates episode records from parsed transcripts (dedup by video_id)
- AI insights extraction function:
  - Loads configured prompt template
  - Substitutes variables ({transcript}, {show_name}, etc.)
  - Calls Claude or OpenAI API
  - Parses structured JSON response
  - Saves: 5 insights, topics (create-or-find), episode_topics, summary
- Processing queue: bulk endpoint processes episodes sequentially
- Progress tracking: updates processing_job record after each episode
- Error handling: catches API failures, marks episode as failed, continues
- YouTube date fetcher: batch API calls to get publish dates
- Week calculation: compute `published_week` (Monday of publish week)

---

### 2C: Processing UI & Vector Embeddings

*~1-2 sessions. Admin UI for monitoring + embeddings.*

#### What Ships

- Prompt editor page (`/admin/prompts`)
  - Template textarea with variable hints
  - Model selector dropdown (Claude Sonnet, GPT-4o)
  - "Test" button → calls API with sample transcript → shows results
- Processing monitor page (`/admin/processing`)
  - Start bulk processing button
  - Progress bar with episode count
  - Episode status table (sortable, filterable)
  - Retry failed button
  - Fetch dates button
  - Build embeddings button
- Vector embeddings pipeline:
  - Generate OpenAI embeddings for insights + summaries
  - Store in content_embeddings with metadata
  - HNSW index for similarity search

---

## All Files Summary

### New Files

| File | Purpose | Ships |
|------|---------|-------|
| `src/app/admin/login/page.tsx` | Admin login page | 2A |
| `src/app/admin/layout.tsx` | Admin layout with sidebar | 2A |
| `src/app/admin/page.tsx` | Admin dashboard | 2A |
| `src/app/admin/shows/page.tsx` | Show management list | 2A |
| `src/app/admin/shows/new/page.tsx` | Create show form | 2A |
| `src/app/admin/shows/[id]/page.tsx` | Edit show form | 2A |
| `src/app/admin/prompts/page.tsx` | Prompt editor | 2C |
| `src/app/admin/processing/page.tsx` | Processing monitor | 2C |
| `src/app/api/admin/auth/route.ts` | Login/logout API | 2A |
| `src/app/api/admin/shows/route.ts` | Shows CRUD API | 2A |
| `src/app/api/admin/shows/[id]/route.ts` | Show update API | 2A |
| `src/app/api/admin/prompts/route.ts` | Prompts list API | 2C |
| `src/app/api/admin/prompts/[id]/route.ts` | Prompt update API | 2C |
| `src/app/api/admin/prompts/[id]/test/route.ts` | Prompt test API | 2C |
| `src/app/api/admin/processing/bulk/route.ts` | Bulk processing API | 2B |
| `src/app/api/admin/processing/episode/[id]/route.ts` | Single episode reprocess | 2B |
| `src/app/api/admin/processing/jobs/route.ts` | Job listing API | 2B |
| `src/app/api/admin/processing/fetch-dates/route.ts` | YouTube date fetch API | 2B |
| `src/app/api/admin/processing/build-embeddings/route.ts` | Embeddings API | 2C |
| `src/lib/admin/auth.ts` | Admin auth helpers | 2A |
| `src/lib/admin/middleware.ts` | Admin route protection | 2A |
| `src/lib/transcripts/parser.ts` | Transcript file parser | 2B |
| `src/lib/transcripts/importer.ts` | Episode importer | 2B |
| `src/lib/ai/extract-insights.ts` | AI insights extraction | 2B |
| `src/lib/ai/providers.ts` | Claude + OpenAI API wrappers | 2B |
| `src/lib/youtube/fetch-dates.ts` | YouTube Data API client | 2B |
| `src/lib/embeddings/generate.ts` | OpenAI embeddings generator | 2C |

### New Environment Variables

None — all env vars defined in Phase 1.

---

## Deployment Infrastructure

### What Already Exists

| Layer | Service | Status |
|-------|---------|--------|
| Hosting | Vercel | Active (Phase 1) |
| Database | Supabase | Active (Phase 1) |
| GitHub | Source control + CI | Active (Phase 1) |

### What's New

| New Infrastructure | Cost | Notes |
|-------------------|------|-------|
| Anthropic Claude API | ~$5-15 for 269 episodes | ~$0.02-0.05 per transcript |
| OpenAI API (embeddings) | ~$0.50 for all embeddings | text-embedding-3-small is very cheap |
| YouTube Data API | Free | 10K quota units/day |

**Cost impact:** ~$15-20 one-time for processing Lenny's back catalog.

---

## Verification Plan

### After 2A

1. Admin login works with correct password
2. Admin login rejects wrong password
3. Admin pages redirect to login if not authenticated
4. Create "Lenny's Podcast" show record via admin UI
5. Show appears in admin show list

### After 2B

6. Transcript parser correctly reads YAML frontmatter from sample episode
7. AI extraction returns valid JSON with 5 insights, topics, summary
8. Process 5 test episodes → data appears in DB
9. Process all 269 episodes → all complete (or retried)
10. YouTube date fetch populates `published_at` for episodes with video_id
11. `published_week` correctly computed

### After 2C

12. Prompt editor displays current template
13. Prompt test button returns parsed insights for a sample episode
14. Processing monitor shows accurate progress during bulk run
15. Failed episodes can be retried from UI
16. Vector embeddings generated and stored
17. **Build check:** `npm run build` passes after each step

---

## Appendix A: AI Prompt Design

### Default Insights Extraction Prompt

```
You are an expert podcast analyst. Analyze the following podcast transcript and extract structured insights.

**Show:** {show_name}
**Episode Title:** {episode_title}

**Transcript:**
{transcript}

**Instructions:**
Return a JSON object with exactly this structure:

{
  "guest_name": "Full name of the guest (or null if no guest)",
  "summary": "2-3 sentence summary of the episode's main theme and key takeaway",
  "insights": [
    "First key insight — a specific, actionable or surprising takeaway",
    "Second key insight",
    "Third key insight",
    "Fourth key insight",
    "Fifth key insight"
  ],
  "topics": [
    "topic-slug-1",
    "topic-slug-2",
    "topic-slug-3"
  ]
}

**Rules for insights:**
- Each insight should be 1-2 sentences
- Focus on actionable advice, surprising data points, or novel frameworks
- Avoid generic statements — be specific about what was said
- Include the speaker's name when quoting or paraphrasing

**Rules for topics:**
- Use lowercase kebab-case slugs
- 3-7 topics per episode
- Prefer established topic names: product-management, growth-strategy, leadership, hiring, product-market-fit, ai, entrepreneurship, etc.
```

### Expected AI Response Shape

```typescript
interface ExtractionResult {
  guest_name: string | null;
  summary: string;
  insights: string[];  // exactly 5
  topics: string[];    // 3-7 kebab-case slugs
}
```
