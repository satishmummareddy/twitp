# Phase {N}: {Feature Name}

**Status:** Planned
**Dependencies:** {Phase X complete (describe what it shares/requires)}
**Estimated Effort:** {N-M sessions (across N implementation steps)}
**Product Spec Reference:** {Backlog item # — "Feature title"}

---

## Table of Contents

- [Context](#context)
- [Architecture Overview](#architecture-overview)
  - [Data Flow](#data-flow)
- [Key Architecture Decisions](#key-architecture-decisions)
- [Database Schema](#database-schema)
- [Storage Layout](#storage-layout)
- [API Endpoints](#api-endpoints)
- [Instructor Flow](#instructor-flow)
- [Student Flow](#student-flow)
- [Implementation Plan](#implementation-plan)
  - [{N}A: {First sub-phase title}](#{n}a-{slug})
  - [{N}B: {Second sub-phase title}](#{n}b-{slug})
  - [{N}C: {Third sub-phase title}](#{n}c-{slug})
- [All Files Summary](#all-files-summary)
  - [New Files](#new-files)
  - [Modified Files](#modified-files)
  - [New Environment Variables](#new-environment-variables)
- [Deployment Infrastructure](#deployment-infrastructure)
- [Verification Plan](#verification-plan)
- [Appendix A: {Detail topic}](#appendix-a-{slug})

---

## Context

{1-2 sentences: What does this feature add? Who uses it and how?}

**Why now:** {What prior phase or infrastructure makes this possible/timely? What user need is being addressed?}

**Target:** {Concise description of the end state — what the user will see when this ships.}

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      INSTRUCTOR BROWSER                                 │
│                                                                         │
│  ┌─────────────────────┐                                                │
│  │ {Editor Page}        │                                               │
│  │ {UI elements}        │                                               │
│  └──────────┬──────────┘                                                │
│             │                                                           │
│    {API call: METHOD /api/...}                                          │
└─────────────┼───────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────┐  ┌──────────────────────────────────────┐
│  Supabase Storage            │  │  Supabase DB                         │
│  Bucket: {bucket-name}       │  │                                      │
│  (private/public)            │  │  {table_name}                        │
│                              │  │    {key columns}                     │
│  /{path}/{layout}/           │  │                                      │
└──────────────┬───────────────┘  └──────────────────┬───────────────────┘
               │                                     │
               │                        {Background job event if any}
               ▼                                     │
┌──────────────────────────────────────────────────────────────────────────┐
│  {Processing pipeline description, e.g. Inngest function}               │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                       STUDENT BROWSER                                    │
│                                                                          │
│  ┌─────────────────────────────────────────────────┐                    │
│  │ {Viewer Page}                                    │                   │
│  │ {UI elements + interactions}                     │                   │
│  └──────────────────────┬───────────────────────────┘                   │
│                         │                                                │
│  {How content is fetched/served to student}                              │
└──────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **{Action verb}** → {Instructor/Student does X} → {API/DB interaction} → {Result}.
2. **{Action verb}** → {Next step in the pipeline}.
3. **{Action verb}** → {How the end user sees/interacts with the result}.

---

## Key Architecture Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| **{Decision area}** | **{What was chosen}** | {Rationale — why this over alternatives} |
| **{Decision area}** | **{What was chosen}** | {Rationale} |
| **{Decision area}** | **{What was chosen}** | {Rationale} |

---

## Database Schema

<!-- Include if the feature adds or modifies database tables -->

```sql
-- {table_name}
--   id              uuid PK default gen_random_uuid()
--   {parent}_id     uuid FK references {parent_table}(id) ON DELETE CASCADE
--   {column}        {type}
--   created_at      timestamptz default now()
--   updated_at      timestamptz default now()
--
-- RLS: {permission_name} for write, {permission_name} for read
-- Indexes: {list key indexes}
```

---

## Storage Layout

<!-- Include if the feature uses Supabase Storage. Remove section if not applicable. -->

```
{bucket-name}/                          ← Supabase Storage bucket (private/public)
  {org_id}/
    {entity_id}/
      {file_or_folder}/                 # description
```

- **Format**: {File format and why}
- **Bucket**: {Bucket name} ({access level}, {size limits})
- **Estimated size**: {Per-entity storage estimate}

---

## API Endpoints

### Instructor APIs

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| POST | `/api/{resource}` | {What it does} | `{PERMISSION}` |
| GET | `/api/{resource}` | {What it does} | Authenticated (RLS) |
| PUT | `/api/{resource}/[id]` | {What it does} | `{PERMISSION}` |
| DELETE | `/api/{resource}/[id]` | {What it does} | `{PERMISSION}` |

### Student APIs

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/{resource}` | {What it does} | Enrolled + published + released (RLS) |

---

## Instructor Flow

### {Create / Upload}

**UI Location**: {Where in the app this lives — e.g., Lesson editor page, new "X" section between Y and Z.}

**Flow**:
1. {Step-by-step interaction — what the instructor does and what happens}
2. {Client-side validation rules}
3. {API call and server-side behavior}
4. {What the instructor sees after completion}

### {Processing (if async)}

<!-- Include if background processing is involved -->

- {What triggers processing}
- {What the processing pipeline does}
- {Status transitions: pending → processing → ready | failed}
- {Error handling and retries}

### {Update / Replace}

- {How the instructor modifies existing content}
- {What happens to old data}

### {Delete / Remove}

- {How deletion works}
- {Cascade behavior — what gets cleaned up}

---

## Student Flow

### {View / Display}

**UI Location**: {Where in the student experience this appears}

- {What the student sees}
- {How content is loaded (server component, client fetch, etc.)}

### {Interaction}

- {How the student interacts with the content}
- {Navigation, controls, modes}

### Visibility

- {When is this content visible to students?}
- {Permission/enrollment/publish/release date rules}

---

## Implementation Plan

### {N}A: {Sub-phase title}

*~{N} sessions. {Brief scope description.}*

#### What Ships

- {Deliverable 1}
- {Deliverable 2}
- {Deliverable 3}

---

### {N}B: {Sub-phase title}

*~{N} sessions. {Brief scope description.}*

#### What Ships

- {Deliverable 1}
- {Deliverable 2}
- {Deliverable 3}

---

### {N}C: {Sub-phase title}

*~{N} sessions. {Brief scope description.}*

#### What Ships

- {Deliverable 1}
- {Deliverable 2}
- {Deliverable 3}

---

## All Files Summary

### New Files

| File | Purpose | Ships |
|------|---------|-------|
| `supabase/migrations/{NNNNN}_{name}.sql` | {Schema + RLS + indexes} | {N}A |
| `src/app/api/{resource}/route.ts` | {API description} | {N}B |
| `src/components/{area}/{component}.tsx` | {Component description} | {N}C |

### Modified Files

| File | Change | Ships |
|------|--------|-------|
| `src/types/database.ts` | Add `{table_name}` Row/Insert/Update types | {N}A |
| `src/app/({layout})/.../{page}/page.tsx` | {What changes on this page} | {N}B |
| `package.json` | Add `{package}` dependency | {N}A |

### New Environment Variables

<!-- List any new env vars needed, or state "None" if all infrastructure already exists -->

None. {Explanation of why — e.g., "All infrastructure (Inngest, Supabase Storage) is already configured from Phase X."}

---

## Deployment Infrastructure

### What Already Exists

| Layer | Service | Status |
|-------|---------|--------|
| {Layer} | {Service name} | Active |

### What's New

| New Infrastructure | Cost | Notes |
|-------------------|------|-------|
| {New service/bucket/package} | {Cost estimate} | {Details} |

**Cost impact:** {Summary of incremental cost.}

---

## Verification Plan

### After {N}A

1. {Test: Migration / schema verification}
2. {Test: Core processing / happy path}
3. {Test: Error handling}

### After {N}B

4. {Test: Instructor create/upload flow}
5. {Test: Update/replace flow}
6. {Test: Delete flow}
7. {Test: Permission enforcement — non-authorized users get 403}

### After {N}C

8. {Test: Student view — content renders correctly}
9. {Test: Student interaction — controls/navigation work}
10. {Test: Enrollment/publish/release date visibility rules}
11. {Test: Edge case — large content, empty state, etc.}
12. **Build check:** `npm run build` passes after each implementation step.

---

# Appendices — Detailed Implementation Specs

*The sections above provide the condensed plan. The appendices below contain full code snippets, interface definitions, migration SQL, route specifications, and component specs for implementation reference.*

---

## Appendix A: {Detail Topic}

<!-- Include detailed code, SQL, interfaces, component specs as needed -->
<!-- Each appendix should be self-contained and reference-able -->

### A.1 {Sub-section}

```{language}
// Detailed implementation spec
```

---

## Appendix B: {Detail Topic}

### B.1 {Sub-section}

```{language}
// Detailed implementation spec
```
