# ThisWeekInTechPodcasts.com — Product Specification

> **Version**: 2.0
> **Date**: March 2026
> **Status**: Built (reflecting actual implementation)

---

## 1. Product Overview

### 1.1 Problem Statement

Tech professionals and podcast listeners face a discovery and time-investment problem. Hundreds of tech podcast episodes are published weekly, each 30-90 minutes long. Episode quality is inconsistent — listeners only discover whether an episode was worth their time after investing the full duration. There's no efficient way to scan across shows, compare episodes, or find the best content on a specific topic without listening to everything.

### 1.2 Solution Summary

ThisWeekInTechPodcasts.com (TWITP) uses AI to extract key insights, topics, and metadata from podcast transcripts, then presents them in a browsable, scannable format. Users see weekly digests of episodes with 5 key insights per episode — enough to decide whether to listen. They can also browse by show, by topic, or discover cross-episode insights on subjects they care about. The platform processes transcripts in bulk (back catalog) and in real-time (new episodes daily).

### 1.3 Success Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Weekly active visitors | 1,000 within 3 months | Vercel Analytics |
| Episodes processed | 10,000+ across 100+ shows | Admin dashboard count |
| Average time on site | > 3 minutes | Vercel Analytics |
| Pages per session | > 3 | Vercel Analytics |
| SEO organic traffic | 500 weekly visits within 6 months | Google Search Console |

### 1.4 Scope

**In Scope (MVP / Prototype):**
- Process Lenny's Podcast back catalog (269 episodes)
- AI-powered insights extraction (5 key insights per episode)
- Home page with episodes grouped by week
- Show page for Lenny's Podcast
- Topic pages for extracted topics
- Top navigation with show/topic dropdowns
- Admin UI for prompt configuration and processing triggers
- SEO-optimized static/ISR pages

**Built (Phase 7 — Scalable Processing):**
- Inngest job queue for scalable processing with configurable concurrency (limit of 5 per show)
- Single-pass AI pipeline (insights from full transcript via premium model)
- Hybrid discovery: Supadata API for video ID listing + YouTube Data API v3 for full metadata
- Content type filtering: videos <10 min tagged as shorts/clips, excluded from processing
- Admin batch workflow: 3-step per show (Discovery → Transcripts → AI Processing) with collapsible sections
- Granular show status: Not Started → Episodes Ready → Transcripts Ready → Summaries Ready
- Prompt eval system: full A/B testing tool for prompts with side-by-side comparison
- Audit trail and cost tracking: per-episode token/cost tracking, processing audit log
- Auto-cleanup of stale jobs: auto-detects jobs running >15 min with no progress
- Inngest cancellation via REST API integration
- Batch overview page (all shows, status, stats) + show detail page
- Admin dashboard with stats, costs, and jobs table

**Not Yet Implemented:**
- Two-pass AI pipeline (cheap model for metadata + premium model for insights) — single-pass works well
- Scheduled processing (Inngest cron for auto-discovery) — all discovery is manual via admin UI
- Semantic search (vector-based search across insights)
- Email digest (weekly email with top episodes)
- Cross-episode topic insights
- Episode detail page with full summary, quotes, timestamps

**Out of Scope (Future):**
- User accounts / authentication
- Ratings or upvotes
- Podcast player integration
- Payments / premium tier
- Comments or social features
- Mobile app

---

## 2. Tech Stack

| Layer | Technology | Version | Rationale |
|-------|------------|---------|-----------|
| Frontend | Next.js (React) | 15.x | App Router, Server Components, force-dynamic for public pages |
| Backend | Next.js API Routes | - | Unified codebase, no separate server |
| Database | Supabase (PostgreSQL) | - | Hosted, RLS, real-time capable. Uses publishable/secret keys (not anon/service_role) |
| Vector DB | pgvector (Supabase) | - | HNSW index, native PostgreSQL extension (not yet used) |
| AI (Insights) | Anthropic Claude API | claude-sonnet-4-5-20250929 | Premium model for single-pass insights extraction |
| AI (Alt) | OpenAI API | gpt-4o-mini | Alternative model option in admin |
| AI (Alt) | Google Gemini Flash | gemini-2.0-flash | Alternative model option in admin |
| Embeddings | OpenAI API | text-embedding-3-small | 1536 dims, cost-effective (not yet used) |
| Job Queue | Inngest | v4 | Serverless, native Vercel integration, retries, concurrency control. Triggers defined inside options object. |
| Transcripts | Supadata API | - | Fetch YouTube transcripts (native captions + AI fallback). Also used for video ID listing (hybrid discovery). |
| Video Metadata | YouTube Data API v3 | - | Full metadata (title, description, date, views, captions, tags, thumbnails). Uploads playlist pagination (UC→UU trick). |
| Hosting | Vercel | - | Native Next.js, edge functions |
| Styling | Tailwind CSS | 4.x | Utility-first, fast iteration |
| Analytics | Vercel Analytics | - | Built-in, privacy-friendly |
| Source Control | GitHub | - | CI/CD integration with Vercel |

### 2.1 Technical Constraints

| Constraint | Impact | Mitigation |
|------------|--------|------------|
| Transcript size (25K+ tokens) | Exceeds some model context windows | Use Claude (200K context) or chunk for OpenAI |
| AI API rate limits | Bulk processing 10K+ episodes | Inngest job queue with configurable concurrency and automatic retries |
| No publish dates in transcripts | Can't group by week without dates | YouTube Data API fetches full metadata including publishedAt |
| Vercel serverless timeout (60s) | AI extraction takes 30-60s per episode | Inngest step functions bypass timeout (each step independent) |
| Transcript sourcing at scale | Can't rely on local files for 100+ shows | Supadata API fetches transcripts from YouTube URLs automatically |
| Dynamic rendering | No static caching, every request hits DB | Acceptable for current scale; ISR can be added later for performance |

### 2.2 Key Technical Decisions

| Decision | Choice | Alternatives Considered | Why This Choice |
|----------|--------|------------------------|-----------------|
| Rendering strategy | force-dynamic (SSR) | ISR, full static | Simpler than ISR revalidation; data changes frequently during processing |
| AI model config | Admin-configurable | Hardcoded | Different models for cost/quality tradeoff; easy to experiment |
| Processing pipeline | Inngest job queue (v4) | API routes + queue table, separate worker | Retries, concurrency, step functions — all built-in. Native Vercel integration. |
| Episode discovery | Hybrid: Supadata (video IDs) + YouTube API v3 (metadata) | YouTube-only, manual entry, RSS | Supadata lists video IDs cheaply; YouTube API provides full metadata. UC→UU playlist trick for uploads. |
| Transcript fetching | Supadata API | youtube-transcript (scraper), Whisper | Reliable paid API, native captions + AI fallback, async handling for long videos |
| AI extraction model | Single-pass (premium model) | Two-pass (cheap + premium) | Single-pass works well enough; two-pass is a future cost optimization for 10K+ episodes |
| Content type filtering | Videos <10 min = shorts, excluded | Process everything | Keeps data quality high; shorts/clips don't have meaningful insights |
| Prompt evaluation | A/B testing with side-by-side comparison | Manual review | Systematic prompt iteration with eval_runs and eval_results tables |
| Public pages | No auth required | Auth-gated | Maximizes reach, SEO, simplicity |
| Admin auth | Simple password/env-based for MVP | Supabase Auth | Only 1 admin user needed; avoids auth complexity |

---

## 3. User Roles

### 3.1 Role Definitions

| Role | Description | Scope |
|------|-------------|-------|
| **Visitor** | Public user browsing the site | Read-only access to all public pages |
| **Admin** | Site operator who configures and triggers processing | Full access to admin UI |

### 3.2 Role Hierarchy

```
Admin (password-protected)
└── Manages content processing, prompts, models

Visitor (public, no auth)
└── Browses episodes, shows, topics
```

### 3.3 Role Assignment

| Role | Assigned By | Assignment Method |
|------|-------------|-------------------|
| Visitor | Automatic | Anyone visiting the site |
| Admin | Environment variable | `ADMIN_PASSWORD` env var, checked on admin pages |

---

## 4. Features & User Flows

### 4.1 Feature List (MVP)

| Feature | Description | Primary Role(s) |
|---------|-------------|-----------------|
| Bulk Insights Extraction | Process transcript folders → AI insights + metadata → DB | Admin |
| Admin UI | Configure AI prompts, select models, trigger/monitor processing | Admin |
| Home Page | Episodes grouped by week, sorted by date, with 5 key insights each | Visitor |
| Show Pages | Per-show episode listing with same weekly grouping | Visitor |
| Topic Pages | Per-topic episode listing filtered by topic tag | Visitor |
| Navigation | Top nav with home, shows dropdown, topics dropdown | Visitor |
| Episode Date Extraction | Fetch publish dates from YouTube API using video_id | Admin (automated) |
| Vector Database | Store insights + topics + guest names as embeddings | System |

### 4.2 User Flows

#### Flow: Admin Processes Podcast Back Catalog

**Actor:** Admin
**Goal:** Extract insights from all transcripts for a show

```
1. Navigate to /admin
2. Enter admin password (if not already authenticated in session)
3. See admin dashboard with processing status
4. Click "Shows" → "Add Show" or select existing show
5. Configure show: name, slug, transcript source folder path
6. Click "Prompts" tab → review/edit the insights extraction prompt
7. Select AI model (Claude Sonnet or GPT-4o)
8. Click "Process All Episodes" for the show
9. See progress: X/269 episodes processed, estimated time remaining
10. Each episode: parse transcript → call AI API → extract insights → save to DB
11. Processing completes → episodes appear on public pages
```

**Implied pages:** Admin dashboard, show config, prompt editor, processing monitor
**Implied operations:** show_create, prompt_update, processing_trigger, episode_create, insight_create

---

#### Flow: Admin Configures AI Prompts

**Actor:** Admin
**Goal:** Customize the prompt used for insights extraction

```
1. Navigate to /admin/prompts
2. See current prompt template with variable placeholders ({transcript}, {show_name}, etc.)
3. Edit prompt text in rich text area
4. Select target model (Claude / OpenAI)
5. Click "Test" with a sample transcript to preview output
6. Review extracted insights, topics, guest info
7. Click "Save" to update the active prompt
```

**Implied pages:** Prompt editor
**Implied operations:** prompt_read, prompt_update, prompt_test

---

#### Flow: Admin Onboards a New Show (Post-MVP / Phase 7)

**Actor:** Admin
**Goal:** Add a new podcast show and process its entire back catalog

```
1. Navigate to /admin/batch → click "Add Show"
2. Enter YouTube channel URL (e.g., youtube.com/@LennysPodcast)
3. System resolves channel ID, fetches channel metadata, creates show record

Step 1: Discovery
4. Click "Fetch Episodes" → YouTube Data API discovers all videos
5. See episode list: title, date, duration, views, has captions ✓/✗
6. Select/deselect episodes for processing

Step 2: Test Run
7. Select 5 episodes (or accept auto-selection)
8. Click "Fetch Transcripts" → Supadata API fetches transcripts
9. Click "Run Pass 1 (Metadata)" → cheap model extracts guest_name, topics, tags
10. Click "Run Pass 2 (Insights)" → premium model extracts insights, summary, quotes
11. Review output inline → tweak prompts if needed → re-run

Step 3: Full Batch
12. See cost estimate (based on episode count, caption availability, model pricing)
13. Set concurrency level, select passes (metadata only / insights only / both)
14. Click "Start Full Batch" → Inngest processes all episodes
15. Watch granular progress: Transcripts N/M → Metadata N/M → Insights N/M
16. Expand failed episodes → retry individually
17. Processing completes → episodes appear on public pages
```

**Implied pages:** Batch overview (/admin/batch), Show processing detail (/admin/batch/[showId])
**Implied operations:** show_create, youtube_discover, supadata_transcript, ai_pass_1, ai_pass_2, inngest_batch

---

#### Flow: Visitor Browses Weekly Episodes

**Actor:** Visitor
**Goal:** Discover which episodes from this week are worth listening to

```
1. Navigate to thisweekintechpodcasts.com (home page)
2. See hero section: "This Week in Tech Podcasts"
3. Below hero: episodes grouped by week (most recent first)
4. Each week section: "Week of March 16, 2026" header
5. Each episode card shows:
   - Show name (e.g., "Lenny's Podcast")
   - Guest name
   - Episode title
   - Publish date
   - Duration
   - 5 key insights (bullet points)
   - Link to original episode (YouTube)
6. Scroll down for previous weeks
7. Pagination or infinite scroll for older weeks
```

**Implied pages:** Home page
**Implied operations:** episode_read (grouped by week, sorted by date)

---

#### Flow: Visitor Browses a Show

**Actor:** Visitor
**Goal:** See all episodes from a specific podcast show

```
1. Click show name in top nav dropdown (or on an episode card)
2. Navigate to /shows/lennys-podcast
3. See show header: name, description, episode count
4. Below: episodes grouped by week, sorted by date (same layout as home)
5. Only episodes from this show are displayed
```

**Implied pages:** Show page
**Implied operations:** episode_read (filtered by show)

---

#### Flow: Visitor Browses a Topic

**Actor:** Visitor
**Goal:** Find episodes about a specific topic (e.g., "product-market fit")

```
1. Click topic in top nav dropdown (or on a topic tag)
2. Navigate to /topics/product-market-fit
3. See topic header: topic name, episode count
4. Below: episodes tagged with this topic, grouped by week, sorted by date
5. Same episode card layout as home page
```

**Implied pages:** Topic page
**Implied operations:** episode_read (filtered by topic)

---

### 4.3 Product Backlog

| # | Priority | Feature | Description | Dependencies |
|---|----------|---------|-------------|--------------|
| 1 | P1 | Episode Detail Page | Full summary, all insights, quotes, timestamps, related episodes | MVP complete |
| 2 | P1 | Multi-Show Bulk Processing | Inngest queue + YouTube discovery + Supadata transcripts + two-pass AI pipeline. 3-step workflow: Discover → Test Run → Full Batch | MVP complete → **Phase 7 planned** |
| 3 | P1 | Daily Processing Pipeline | Inngest cron auto-discovers new episodes on configurable interval, processes through full pipeline | Phase 7C/7D → **Phase 7E planned** |
| 4 | P1 | Cross-Episode Topic Insights | Best insights across all episodes on a topic | Vector DB |
| 5 | P2 | Semantic Search | Search across all insights using vector similarity | Vector DB |
| 6 | P2 | Email Weekly Digest | Subscribe for weekly email with top episodes | Email service |
| 7 | P2 | Thought Leader Pages | Page per guest showing all their episodes + key ideas | MVP complete |
| 8 | P3 | User Accounts | Save favorites, reading history, personalized feed | Auth system |
| 9 | P3 | Podcast Player Embed | Play episodes directly on the site | Player widget |
| 10 | P3 | API Access | Public API for programmatic access to insights | Rate limiting |

---

## 5. Page Structure & URLs

### 5.1 URL Schema

| Pattern | Page | Access Level |
|---------|------|--------------|
| `/` | Home — weekly episode digest | Public |
| `/shows` | All shows listing | Public |
| `/shows/[show-slug]` | Show page — episodes for one show | Public |
| `/topics` | All topics listing | Public |
| `/topics/[topic-slug]` | Topic page — episodes for one topic | Public |
| `/episodes/[episode-slug]` | Episode detail (Post-MVP) | Public |
| `/admin` | Admin dashboard | Admin only |
| `/admin/shows` | Show management | Admin only |
| `/admin/prompts` | Prompt configuration | Admin only |
| `/admin/processing` | Processing monitor (legacy) | Admin only |
| `/admin/batch` | Batch overview — all shows with status + stats | Admin only |
| `/admin/batch/[showId]` | Show processing detail — 3-step workflow | Admin only |
| `/admin/settings` | Processing settings (concurrency, models, scheduling) | Admin only |
| `/admin/dashboard` | Dashboard — queue status, cost estimation, job history | Admin only |

### 5.2 Page Inventory

| Page | URL | Purpose | Data Needed | Primary Actions |
|------|-----|---------|-------------|-----------------|
| Home | `/` | Weekly episode digest | episodes (all shows), insights, topics | Browse, click episode |
| Shows Index | `/shows` | List all shows | shows with episode counts | Navigate to show |
| Show Detail | `/shows/[slug]` | Episodes for one show | show, episodes, insights | Browse show episodes |
| Topics Index | `/topics` | List all topics | topics with episode counts | Navigate to topic |
| Topic Detail | `/topics/[slug]` | Episodes for one topic | topic, episodes, insights | Browse topic episodes |
| Admin Dashboard | `/admin` | Overview & stats | processing stats, counts | Navigate to admin sections |
| Admin Shows | `/admin/shows` | Manage shows | shows, processing status | Add/edit/process shows |
| Admin Prompts | `/admin/prompts` | Configure AI prompts | prompts, models | Edit/test prompts |
| Admin Processing | `/admin/processing` | Monitor processing (legacy) | job queue, progress | Start/stop/retry |
| Batch Overview | `/admin/batch` | All shows status + stats | shows, processing stats | Navigate to show detail |
| Show Batch Detail | `/admin/batch/[showId]` | 3-step workflow per show | show, episodes, jobs | Discover/Test/Batch |
| Admin Settings | `/admin/settings` | Processing config | config, prompts, models | Configure per-pass settings |
| Admin Dashboard | `/admin/dashboard` | Queue + cost + history | aggregate stats, jobs | Monitor, retry |

### 5.3 Navigation Structure

```
Header (all public pages)
├── Logo → /
├── Home → /
├── Shows (dropdown)
│   ├── All Shows → /shows
│   └── [Show Name] → /shows/[slug] (for each show)
├── Topics (dropdown)
│   ├── All Topics → /topics
│   └── [Topic Name] → /topics/[slug] (top ~20 topics)
└── (no user menu — public site)

Admin Header (admin pages only)
├── ← Back to Site → /
├── Dashboard → /admin/dashboard
├── Batch → /admin/batch (show processing workflow)
├── Shows → /admin/shows
├── Prompts → /admin/prompts
├── Processing → /admin/processing (legacy)
└── Settings → /admin/settings (concurrency, models, scheduling)
```

### 5.4 Reserved Slugs

| Slug | Reason |
|------|--------|
| `admin` | Admin routes |
| `api` | API routes |
| `shows` | Shows listing page |
| `topics` | Topics listing page |
| `episodes` | Episode detail pages |

---

## 6. Permissions & Security

### 6.1 Permission Types

| Permission Key | Description | Operations Enabled |
|----------------|-------------|-------------------|
| `public_read` | View all public content | GET all public pages and APIs |
| `admin_write` | Create/update/delete content, trigger processing | All admin operations |

### 6.2 Permission Matrix

| Role | public_read | admin_write |
|------|:-----------:|:-----------:|
| Visitor | ✓ | ✗ |
| Admin | ✓ | ✓ |

### 6.3 Page Access Control

| URL Pattern | Required Permission | Notes |
|-------------|---------------------|-------|
| `/` | None | Public |
| `/shows/*` | None | Public |
| `/topics/*` | None | Public |
| `/admin/*` | `admin_write` | Password-protected |
| `/api/public/*` | None | Public read APIs |
| `/api/admin/*` | `admin_write` | Admin APIs |

### 6.4 Authorization Strategy

| Layer | Implementation | Purpose |
|-------|----------------|---------|
| **Middleware** | Check admin cookie/session for `/admin/*` and `/api/admin/*` | Gate admin access |
| **API** | Validate admin token on write endpoints | Prevent unauthorized mutations |
| **Database** | RLS: public read on published data, service role for writes | Defense in depth |

### 6.5 RLS Policies

#### Table: `shows`

| Operation | Policy | Condition |
|-----------|--------|-----------|
| SELECT | Public read | `is_active = true` |
| INSERT/UPDATE/DELETE | None (client) | Server uses service role |

#### Table: `episodes`

| Operation | Policy | Condition |
|-----------|--------|-----------|
| SELECT | Public read | `is_published = true` |
| INSERT/UPDATE/DELETE | None (client) | Server uses service role |

#### Table: `insights`

| Operation | Policy | Condition |
|-----------|--------|-----------|
| SELECT | Public read | Episode is published (join) |
| INSERT/UPDATE/DELETE | None (client) | Server uses service role |

#### Table: `topics`

| Operation | Policy | Condition |
|-----------|--------|-----------|
| SELECT | Public read | All topics visible |
| INSERT/UPDATE/DELETE | None (client) | Server uses service role |

#### Table: `processing_jobs`

| Operation | Policy | Condition |
|-----------|--------|-----------|
| ALL | None (client) | Admin-only via service role |

### 6.6 Security Boundaries

| Scenario | Expected Result | Priority |
|----------|-----------------|----------|
| Visitor accesses /admin | BLOCKED (redirect to admin login) | High |
| Visitor calls /api/admin/* | BLOCKED (401) | High |
| Visitor attempts SQL injection via URL params | BLOCKED (parameterized queries) | Critical |
| Admin password brute force | Rate limited | Medium |

---

## 7. Data Model

### 7.1 Entity Relationship Diagram

```
shows
├── episodes (one-to-many)
│   ├── insights (one-to-many, typically 5 per episode)
│   └── episode_topics (many-to-many junction)
│
topics
├── episode_topics (many-to-many junction)
│
prompts (system-level, not per-show)
│
processing_config (key-value config store)
│
processing_jobs
│   └── references show_id and optionally episode_id
│
processing_audit_log
│   └── references episode_id (per-episode processing audit trail)
│
eval_runs (prompt A/B test runs)
│   └── eval_results (per-episode comparison results)
│
content_embeddings
    └── references episode_id or insight_id
```

### 7.2 Data Dictionary

#### Table: `shows`

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| name | TEXT | No | - | | e.g., "Lenny's Podcast" |
| slug | TEXT | No | - | UNIQUE | URL-friendly |
| description | TEXT | Yes | - | | |
| host_name | TEXT | Yes | - | | e.g., "Lenny Rachitsky" |
| cover_image_url | TEXT | Yes | - | | |
| website_url | TEXT | Yes | - | | |
| youtube_channel_id | TEXT | Yes | - | | For fetching new episodes |
| transcript_source_path | TEXT | Yes | - | | Local folder path for bulk import |
| is_active | BOOLEAN | No | true | | |
| episode_count | INTEGER | No | 0 | | Denormalized for display |
| created_at | TIMESTAMPTZ | No | NOW() | | |
| updated_at | TIMESTAMPTZ | No | NOW() | | |

**Indexes:** `idx_shows_slug`

---

#### Table: `episodes`

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| show_id | UUID | No | - | FK → shows ON DELETE CASCADE | |
| title | TEXT | No | - | | |
| slug | TEXT | No | - | | URL-friendly |
| guest_name | TEXT | Yes | - | | |
| description | TEXT | Yes | - | | From YouTube metadata |
| youtube_url | TEXT | Yes | - | | |
| youtube_video_id | TEXT | Yes | - | UNIQUE | For dedup and date lookup |
| duration_seconds | INTEGER | Yes | - | | |
| duration_display | TEXT | Yes | - | | e.g., "1:13:28" |
| view_count | INTEGER | Yes | - | | From YouTube at import time |
| like_count | INTEGER | Yes | - | | From YouTube at import time |
| published_at | TIMESTAMPTZ | Yes | - | | YouTube publish date |
| published_week | DATE | Yes | - | | Monday of publish week (for grouping) |
| transcript_text | TEXT | Yes | - | | Full transcript (for reprocessing) |
| summary | TEXT | Yes | - | | AI-generated episode summary |
| ai_model_used | TEXT | Yes | - | | Which model generated insights |
| processing_status | TEXT | No | 'pending' | CHECK: 'pending' \| 'processing' \| 'completed' \| 'failed' | |
| processing_error | TEXT | Yes | - | | Error message if failed |
| is_published | BOOLEAN | No | false | | Visible on public site |
| content_type | TEXT | Yes | 'episode' | | 'episode' or 'short'. Videos <10 min tagged as shorts, excluded from processing. |
| thumbnail_url | TEXT | Yes | - | | YouTube thumbnail URL |
| youtube_tags | TEXT[] | Yes | - | | Creator-provided tags from YouTube |
| input_tokens | INTEGER | Yes | - | | Token count for AI input (cost tracking) |
| output_tokens | INTEGER | Yes | - | | Token count for AI output (cost tracking) |
| processing_cost | NUMERIC | Yes | - | | Calculated cost in USD |
| processing_duration_ms | INTEGER | Yes | - | | Time taken for AI processing |
| created_at | TIMESTAMPTZ | No | NOW() | | |
| updated_at | TIMESTAMPTZ | No | NOW() | | |

**Unique:** `(show_id, slug)`
**Indexes:** `idx_episodes_show`, `idx_episodes_published_week`, `idx_episodes_published_at`, `idx_episodes_video_id`

---

#### Table: `insights`

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| episode_id | UUID | No | - | FK → episodes ON DELETE CASCADE | |
| position | INTEGER | No | - | | 1-5 ordering |
| content | TEXT | No | - | | The insight text |
| category | TEXT | Yes | - | | e.g., "strategy", "tactic", "quote" |
| created_at | TIMESTAMPTZ | No | NOW() | | |

**Unique:** `(episode_id, position)`
**Indexes:** `idx_insights_episode`

---

#### Table: `topics`

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| name | TEXT | No | - | | Display name, e.g., "Product-Market Fit" |
| slug | TEXT | No | - | UNIQUE | URL-friendly |
| description | TEXT | Yes | - | | |
| episode_count | INTEGER | No | 0 | | Denormalized |
| created_at | TIMESTAMPTZ | No | NOW() | | |

**Indexes:** `idx_topics_slug`

---

#### Table: `episode_topics`

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| episode_id | UUID | No | - | FK → episodes ON DELETE CASCADE | |
| topic_id | UUID | No | - | FK → topics ON DELETE CASCADE | |
| relevance_score | FLOAT | Yes | - | | AI-assigned 0-1 score |
| created_at | TIMESTAMPTZ | No | NOW() | | |

**Unique:** `(episode_id, topic_id)`
**Indexes:** `idx_episode_topics_episode`, `idx_episode_topics_topic`

---

#### Table: `prompts`

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| name | TEXT | No | - | UNIQUE | e.g., "insights_extraction" |
| description | TEXT | Yes | - | | |
| template | TEXT | No | - | | Prompt text with {variables} |
| model_provider | TEXT | No | 'anthropic' | CHECK: 'anthropic' \| 'openai' | |
| model_name | TEXT | No | 'claude-sonnet-4-5-20250929' | | |
| is_active | BOOLEAN | No | true | | |
| version | INTEGER | No | 1 | | Incremented on update |
| created_at | TIMESTAMPTZ | No | NOW() | | |
| updated_at | TIMESTAMPTZ | No | NOW() | | |

---

#### Table: `processing_jobs`

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| show_id | UUID | No | - | FK → shows | |
| episode_id | UUID | Yes | - | FK → episodes | Null for bulk jobs |
| job_type | TEXT | No | - | CHECK: 'bulk_extract' \| 'single_extract' \| 'fetch_dates' \| 'build_embeddings' | |
| status | TEXT | No | 'queued' | CHECK: 'queued' \| 'running' \| 'completed' \| 'failed' | |
| progress_current | INTEGER | No | 0 | | |
| progress_total | INTEGER | No | 0 | | |
| error_message | TEXT | Yes | - | | |
| started_at | TIMESTAMPTZ | Yes | - | | |
| completed_at | TIMESTAMPTZ | Yes | - | | |
| created_at | TIMESTAMPTZ | No | NOW() | | |

**Indexes:** `idx_processing_jobs_status`, `idx_processing_jobs_show`

---

#### Table: `content_embeddings`

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| content_type | TEXT | No | - | CHECK: 'insight' \| 'episode_summary' | |
| content_id | UUID | No | - | | FK to insight or episode |
| episode_id | UUID | No | - | FK → episodes | For filtering |
| chunk_text | TEXT | No | - | | Text that was embedded |
| embedding | vector(1536) | No | - | | OpenAI text-embedding-3-small |
| metadata | JSONB | No | '{}' | | guest_name, show_name, topic_slugs, etc. |
| created_at | TIMESTAMPTZ | No | NOW() | | |

**Indexes:** `content_embeddings_embedding_idx` (HNSW, cosine), `idx_embeddings_episode`

---

#### Table: `processing_config`

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| key | TEXT | No | - | UNIQUE | e.g., "concurrency_limit", "pass_1_model" |
| value | JSONB | No | - | | Config value |
| updated_at | TIMESTAMPTZ | No | NOW() | | |

**RLS:** No public access (admin-only via service role)

---

#### Table: `eval_runs`

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| name | TEXT | No | - | | Descriptive name for the eval run |
| prompt_a | TEXT | No | - | | First prompt variant |
| prompt_b | TEXT | No | - | | Second prompt variant |
| model | TEXT | No | - | | AI model used |
| status | TEXT | No | 'pending' | | pending, running, completed |
| created_at | TIMESTAMPTZ | No | NOW() | | |

---

#### Table: `eval_results`

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| eval_run_id | UUID | No | - | FK → eval_runs ON DELETE CASCADE | |
| episode_id | UUID | No | - | FK → episodes | |
| result_a | JSONB | Yes | - | | Output from prompt A |
| result_b | JSONB | Yes | - | | Output from prompt B |
| created_at | TIMESTAMPTZ | No | NOW() | | |

---

#### Table: `processing_audit_log`

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| episode_id | UUID | No | - | FK → episodes | |
| action | TEXT | No | - | | e.g., "ai_extraction", "transcript_fetch" |
| model | TEXT | Yes | - | | AI model used |
| input_tokens | INTEGER | Yes | - | | |
| output_tokens | INTEGER | Yes | - | | |
| cost | NUMERIC | Yes | - | | Calculated cost in USD |
| duration_ms | INTEGER | Yes | - | | Processing time |
| status | TEXT | No | - | | success, failed |
| error | TEXT | Yes | - | | Error message if failed |
| created_at | TIMESTAMPTZ | No | NOW() | | |

**RLS:** No public access (admin-only via service role)

---

### 7.3 JSON Column Shapes

```typescript
/**
 * Embedding metadata for search enrichment.
 * Used by: content_embeddings.metadata
 */
interface EmbeddingMetadata {
  show_name: string;
  show_slug: string;
  guest_name: string | null;
  episode_title: string;
  episode_slug: string;
  topic_slugs: string[];
  published_at: string | null;
}
```

### 7.4 Enums and Status Values

| Field | Valid Values | Transitions |
|-------|--------------|-------------|
| episodes.processing_status | pending, processing, completed, failed | pending → processing → completed \| failed |
| processing_jobs.status | queued, running, completed, failed | queued → running → completed \| failed |
| prompts.model_provider | anthropic, openai | Admin-controlled |

---

## 8. API Design

### 8.1 Endpoint Inventory

#### Public APIs

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/public/episodes | List episodes (paginated, filterable by show/topic/week) | None |
| GET | /api/public/episodes/[slug] | Episode detail with insights | None |
| GET | /api/public/shows | List all active shows | None |
| GET | /api/public/shows/[slug] | Show detail with episode count | None |
| GET | /api/public/topics | List all topics with counts | None |
| GET | /api/public/topics/[slug] | Topic detail with episodes | None |

#### Admin APIs

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/admin/shows | List shows with processing status | Admin |
| POST | /api/admin/shows | Create a show | Admin |
| PATCH | /api/admin/shows/[id] | Update show config | Admin |
| GET | /api/admin/prompts | List prompts | Admin |
| PATCH | /api/admin/prompts/[id] | Update prompt template | Admin |
| POST | /api/admin/prompts/[id]/test | Test prompt with sample transcript | Admin |
| POST | /api/admin/processing/bulk | Start bulk processing for a show | Admin |
| POST | /api/admin/processing/episode | Process single episode | Admin |
| GET | /api/admin/processing/status | Get processing job status | Admin |
| POST | /api/admin/processing/fetch-dates | Fetch publish dates from YouTube | Admin |
| POST | /api/admin/processing/build-embeddings | Build vector embeddings | Admin |

### 8.2 Request/Response Schemas

```typescript
// GET /api/public/episodes?show=slug&topic=slug&week=2026-03-16&page=1&limit=20
interface EpisodesResponse {
  episodes: {
    id: string;
    title: string;
    slug: string;
    guest_name: string | null;
    show: { name: string; slug: string };
    published_at: string | null;
    published_week: string | null;
    duration_display: string | null;
    youtube_url: string | null;
    insights: { position: number; content: string }[];
    topics: { name: string; slug: string }[];
  }[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

// POST /api/admin/processing/bulk
interface BulkProcessRequest {
  showId: string;
  promptId?: string;        // Use active prompt if not specified
  forceReprocess?: boolean; // Re-process already completed episodes
}

// POST /api/admin/prompts/[id]/test
interface PromptTestRequest {
  sampleTranscript: string; // Or episode_id to use stored transcript
}

interface PromptTestResponse {
  insights: string[];
  topics: string[];
  guest_name: string;
  summary: string;
  model_used: string;
  tokens_used: number;
}
```

### 8.3 Error Response Format

```typescript
interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}

// Standard responses
{ error: "Not found" }                    // 404
{ error: "Unauthorized" }                 // 401
{ error: "Invalid request", details: {} } // 400
{ error: "Internal server error" }        // 500
```

---

## 9. Engineering Standards

### 9.1 TypeScript Configuration

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "target": "ES2017",
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx"
  }
}
```

### 9.2 Linting Rules

```json
{
  "extends": ["next/core-web-vitals", "next/typescript"],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-non-null-assertion": "warn"
  }
}
```

### 9.3 CI/CD Pipeline

```yaml
name: CI
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run lint
      - run: npm run build
```

**Gate:** PRs cannot merge without passing.

### 9.4 Code Patterns

| Pattern | Implementation |
|---------|----------------|
| Server Components | Default for all public pages (SEO + performance) |
| Client Components | Only for interactive elements (dropdowns, mobile nav) |
| Data fetching | Server components fetch via Supabase server client |
| Dynamic rendering | `force-dynamic` for public pages (simpler than ISR revalidation) |
| API validation | Zod schemas for request bodies |
| Environment secrets | `process.env` server-side only, never in client bundle |

---

## 10. Testing & Deployment

### 10.1 Test Strategy

| Type | Coverage | Tools |
|------|----------|-------|
| Unit | Utility functions, data transforms | Vitest |
| Integration | API routes | Vitest + fetch |
| E2E | Critical pages render | Playwright (post-MVP) |

### 10.2 Environments

| Environment | Database | URL |
|-------------|----------|-----|
| Development | Supabase (dev project) | localhost:3000 |
| Production | Supabase (prod project) | thisweekintechpodcasts.com |

### 10.3 Environment Variables

| Variable | Required | Secret | Description |
|----------|----------|--------|-------------|
| NEXT_PUBLIC_SUPABASE_URL | Yes | No | Supabase project URL |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Yes | No | Supabase publishable key (note: not the standard anon key name) |
| SUPABASE_SECRET_KEY | Yes | Yes | Supabase secret key (note: not the standard service_role key name) |
| ANTHROPIC_API_KEY | Yes | Yes | Claude API key (Pass 2 insights) |
| OPENAI_API_KEY | Yes | Yes | Embeddings + alt model |
| GOOGLE_AI_API_KEY | Yes | Yes | Gemini Flash (Pass 1 metadata) |
| YOUTUBE_API_KEY | Yes | Yes | YouTube Data API v3 for episode discovery |
| SUPADATA_API_KEY | Yes | Yes | Supadata API for transcript fetching |
| INNGEST_EVENT_KEY | Yes | Yes | Inngest event key (production) |
| INNGEST_SIGNING_KEY | Yes | Yes | Inngest webhook signing (production) |
| ADMIN_PASSWORD | Yes | Yes | Admin UI access |
| NEXT_PUBLIC_APP_URL | Yes | No | App base URL |

### 10.4 Deployment Process

```
1. Push to main branch
2. GitHub Actions: lint + build
3. Vercel auto-deploys on push to main
4. Run Supabase migrations manually when schema changes
5. Trigger on-demand ISR revalidation after bulk processing
```

---

## 11. Open Questions

| Question | Options | Decision | Date |
|----------|---------|----------|------|
| Transcript source for new shows | YouTube auto-captions, Whisper, third-party API | **Supadata API** — reliable, native captions + AI fallback, async for long videos | Mar 2026 |
| Episode discovery for new shows | Manual, RSS, YouTube API | **YouTube Data API v3** — full metadata (title, description, date, views, captions) | Mar 2026 |
| Processing at scale (10K+ episodes) | Fire-and-forget, Inngest, Trigger.dev, Railway | **Inngest** — serverless job queue, native Vercel integration, retries, concurrency, cron | Mar 2026 |
| AI model strategy | Single model, two-pass, multi-model | **Single-pass** — premium model (Claude Sonnet) for insights from transcript. Two-pass (cheap+premium) deferred as cost optimization for 10K+ episodes. | Mar 2026 |
| Rate limiting for YouTube API | Quota is 10K units/day | Sufficient — channel with 300 videos costs ~10 units | Mar 2026 |
| Hosting transcript text in DB | Store full transcript or just insights | Store both (enables reprocessing) | Mar 2026 |

---

## 12. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | March 2026 | Initial draft |
| 1.1 | March 2026 | Added Phase 7: Scalable processing — Inngest, two-pass AI pipeline, YouTube discovery, Supadata transcripts, show onboarding workflow (Discover → Test Run → Full Batch), scheduled processing, admin dashboard. Updated tech stack, env vars, open questions, backlog, admin flows, page inventory. |
| 2.0 | March 2026 | Updated to reflect actual implementation. Key changes: single-pass pipeline (not two-pass), hybrid discovery (Supadata for video IDs + YouTube API for metadata), content type filtering (episodes vs shorts), prompt eval system, audit trail + cost tracking, Inngest cancellation via REST API, auto-cleanup of stale jobs, granular show status, force-dynamic instead of ISR. Added new tables: processing_config, eval_runs, eval_results, processing_audit_log. Added new episode columns: content_type, input/output_tokens, processing_cost, processing_duration_ms, thumbnail_url, youtube_tags, like_count. Noted unimplemented features: two-pass pipeline, scheduled processing, semantic search, email digest. |

---

## Appendix: Pre-Coding Checklist

### Product (Sections 1-4)
- [x] Problem statement clear
- [x] Success metrics defined
- [x] User roles identified
- [x] MVP features listed
- [x] User flows documented

### Design (Sections 5-6)
- [x] All pages identified with URLs
- [x] Permission types defined
- [x] Permission matrix complete
- [x] RLS policies for ALL tables
- [x] Security boundaries documented

### Technical (Sections 7-9)
- [x] Data dictionary complete
- [x] JSON shapes defined
- [x] API endpoints listed
- [x] Engineering standards configured
- [x] CI/CD pipeline defined

### Sign-offs
- [ ] Product owner approved (Sections 1-4)
- [ ] Engineering lead approved (Sections 5-9)
- [ ] Ready to implement
