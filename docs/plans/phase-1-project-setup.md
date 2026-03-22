# Phase 1: Project Setup & Data Model

**Status:** Planned
**Dependencies:** None
**Estimated Effort:** 2-3 sessions (across 2 implementation steps)
**Product Spec Reference:** Sections 2, 7, 9, 10

---

## Table of Contents

- [Context](#context)
- [Architecture Overview](#architecture-overview)
- [Key Architecture Decisions](#key-architecture-decisions)
- [Database Schema](#database-schema)
- [Implementation Plan](#implementation-plan)
  - [1A: Project Initialization](#1a-project-initialization)
  - [1B: Database Schema & Supabase Setup](#1b-database-schema--supabase-setup)
- [All Files Summary](#all-files-summary)
- [Deployment Infrastructure](#deployment-infrastructure)
- [Verification Plan](#verification-plan)

---

## Context

This phase creates the foundation for the entire TWITP platform. Every subsequent phase depends on the project structure, database schema, and deployment pipeline established here.

**Why now:** This is the first phase — nothing else can begin without a working Next.js project, Supabase database, and Vercel deployment.

**Target:** A deployed (empty) Next.js app on Vercel, connected to Supabase with all tables created and RLS policies in place. `npm run build` and `npm run lint` pass. GitHub repo created with CI.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                      DEVELOPER MACHINE                            │
│                                                                   │
│  Next.js 15 Project                                               │
│  ├── src/app/          (App Router)                               │
│  ├── src/lib/supabase/ (Client helpers)                           │
│  ├── src/types/        (TypeScript types)                         │
│  └── supabase/migrations/ (SQL migrations)                        │
│                                                                   │
│  git push → GitHub → Vercel auto-deploy                           │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────┐  ┌──────────────────────────────┐
│  Vercel                       │  │  Supabase                     │
│  Next.js hosting              │  │  PostgreSQL + pgvector         │
│  Edge/Serverless functions    │  │  RLS policies                  │
│  Automatic deployments        │  │  Service role for admin ops    │
└──────────────────────────────┘  └──────────────────────────────┘
```

---

## Key Architecture Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| **App Router vs Pages Router** | App Router | Server Components, layouts, ISR support |
| **src/ directory** | Yes | Clean separation from config files |
| **Supabase client pattern** | Server + browser clients | Server client for RSC, browser for client components |
| **Migration approach** | SQL files in supabase/migrations/ | Version controlled, reproducible |
| **pgvector extension** | Enable in first migration | Required for Phase 2 embeddings |

---

## Database Schema

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- shows
--   id              uuid PK default gen_random_uuid()
--   name            text NOT NULL
--   slug            text NOT NULL UNIQUE
--   description     text
--   host_name       text
--   cover_image_url text
--   website_url     text
--   youtube_channel_id text
--   transcript_source_path text
--   is_active       boolean default true
--   episode_count   integer default 0
--   created_at      timestamptz default now()
--   updated_at      timestamptz default now()
--
-- RLS: public read (is_active), service role for writes

-- episodes
--   id                  uuid PK
--   show_id             uuid FK → shows ON DELETE CASCADE
--   title               text NOT NULL
--   slug                text NOT NULL
--   guest_name          text
--   description         text
--   youtube_url         text
--   youtube_video_id    text UNIQUE
--   duration_seconds    integer
--   duration_display    text
--   view_count          integer
--   published_at        timestamptz
--   published_week      date
--   transcript_text     text
--   summary             text
--   ai_model_used       text
--   processing_status   text default 'pending' CHECK(...)
--   processing_error    text
--   is_published        boolean default false
--   created_at          timestamptz default now()
--   updated_at          timestamptz default now()
--
-- UNIQUE: (show_id, slug)
-- RLS: public read (is_published), service role for writes

-- insights
--   id          uuid PK
--   episode_id  uuid FK → episodes ON DELETE CASCADE
--   position    integer NOT NULL
--   content     text NOT NULL
--   category    text
--   created_at  timestamptz default now()
--
-- UNIQUE: (episode_id, position)
-- RLS: public read (episode is_published), service role for writes

-- topics
--   id             uuid PK
--   name           text NOT NULL
--   slug           text NOT NULL UNIQUE
--   description    text
--   episode_count  integer default 0
--   created_at     timestamptz default now()
--
-- RLS: public read all

-- episode_topics
--   id              uuid PK
--   episode_id      uuid FK → episodes ON DELETE CASCADE
--   topic_id        uuid FK → topics ON DELETE CASCADE
--   relevance_score float
--   created_at      timestamptz default now()
--
-- UNIQUE: (episode_id, topic_id)

-- prompts
--   id              uuid PK
--   name            text NOT NULL UNIQUE
--   description     text
--   template        text NOT NULL
--   model_provider  text default 'anthropic' CHECK(...)
--   model_name      text default 'claude-sonnet-4-5-20250929'
--   is_active       boolean default true
--   version         integer default 1
--   created_at      timestamptz default now()
--   updated_at      timestamptz default now()

-- processing_jobs
--   id                uuid PK
--   show_id           uuid FK → shows
--   episode_id        uuid FK → episodes (nullable)
--   job_type          text CHECK(...)
--   status            text default 'queued' CHECK(...)
--   progress_current  integer default 0
--   progress_total    integer default 0
--   error_message     text
--   started_at        timestamptz
--   completed_at      timestamptz
--   created_at        timestamptz default now()

-- content_embeddings
--   id            uuid PK
--   content_type  text CHECK(...)
--   content_id    uuid
--   episode_id    uuid FK → episodes
--   chunk_text    text NOT NULL
--   embedding     vector(1536)
--   metadata      jsonb default '{}'
--   created_at    timestamptz default now()
--
-- INDEX: HNSW on embedding (cosine)
```

---

## Implementation Plan

### 1A: Project Initialization

*~1-2 sessions. Next.js project, GitHub repo, Vercel deployment.*

#### What Ships

- Next.js 15 project with App Router, TypeScript strict, Tailwind CSS 4
- ESLint config (`no-explicit-any: error`)
- GitHub repo created via `gh repo create`
- Vercel connected and auto-deploying
- Placeholder home page ("Coming Soon")
- Supabase client helpers (server + browser)
- Environment variable setup (`.env.local` template)
- `.gitignore`, `README.md`

---

### 1B: Database Schema & Supabase Setup

*~1 session. All tables, indexes, RLS policies, pgvector.*

#### What Ships

- Supabase project created (dev)
- All 8 tables created with constraints and indexes
- RLS enabled on all tables with appropriate policies
- pgvector extension enabled
- `updated_at` trigger function
- Seed data: default insights extraction prompt
- Type generation script (`npm run db:types`)
- Generated `src/types/database.ts`

---

## All Files Summary

### New Files

| File | Purpose | Ships |
|------|---------|-------|
| `package.json` | Project config, dependencies, scripts | 1A |
| `next.config.ts` | Next.js configuration | 1A |
| `tsconfig.json` | TypeScript strict config | 1A |
| `tailwind.config.ts` | Tailwind CSS 4 config | 1A |
| `eslint.config.mjs` | ESLint with no-explicit-any error | 1A |
| `.env.local.example` | Template for environment variables | 1A |
| `.gitignore` | Git ignore patterns | 1A |
| `README.md` | Project readme | 1A |
| `src/app/layout.tsx` | Root layout | 1A |
| `src/app/page.tsx` | Placeholder home page | 1A |
| `src/lib/supabase/server.ts` | Supabase server client | 1A |
| `src/lib/supabase/browser.ts` | Supabase browser client | 1A |
| `src/lib/supabase/admin.ts` | Supabase service role client | 1A |
| `src/types/database.ts` | Auto-generated Supabase types | 1B |
| `supabase/migrations/00001_initial_schema.sql` | All tables + RLS + indexes | 1B |
| `supabase/seed.sql` | Default prompt seed data | 1B |

### New Environment Variables

| Variable | Required | Secret |
|----------|----------|--------|
| NEXT_PUBLIC_SUPABASE_URL | Yes | No |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Yes | No |
| SUPABASE_SERVICE_ROLE_KEY | Yes | Yes |
| ANTHROPIC_API_KEY | Yes | Yes |
| OPENAI_API_KEY | Yes | Yes |
| YOUTUBE_API_KEY | Yes | Yes |
| ADMIN_PASSWORD | Yes | Yes |
| NEXT_PUBLIC_APP_URL | Yes | No |

---

## Deployment Infrastructure

### What's New

| Infrastructure | Service | Cost |
|---------------|---------|------|
| Hosting | Vercel (Hobby/Pro) | Free-$20/mo |
| Database | Supabase (Free/Pro) | Free-$25/mo |
| Source Control | GitHub | Free |
| CI/CD | GitHub Actions | Free |

---

## Verification Plan

### After 1A

1. `npm run build` passes
2. `npm run lint` passes
3. Vercel deployment succeeds (placeholder page visible)
4. GitHub repo accessible
5. Supabase client can connect (test in a temp API route)

### After 1B

6. All 8 tables visible in Supabase dashboard
7. RLS policies enabled on all tables
8. pgvector extension active (`SELECT * FROM pg_extension WHERE extname = 'vector'`)
9. Default prompt exists in `prompts` table
10. `npm run db:types` generates types file
11. **Build check:** `npm run build` passes
