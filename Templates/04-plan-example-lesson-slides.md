# Phase 16: Lesson Slides

**Status:** Implemented
**Dependencies:** Phase 14 complete (shares Inngest + storage infrastructure)
**Estimated Effort:** 4-6 sessions (across 3 implementation steps)

> **Implementation Notes:** This document was the original plan. During implementation, several deviations were necessary due to infrastructure constraints and performance requirements. Each deviation is marked inline with a `> **⚠ DEVIATION**` callout explaining what changed and why.

---

## Table of Contents

- [Context](#context)
- [Shared Architecture](#shared-architecture)
  - [Data Flow](#data-flow)
- [Key Architecture Decisions](#key-architecture-decisions)
- [Storage Layout](#storage-layout)
- [API Endpoints](#api-endpoints)
- [Instructor Flow](#instructor-flow)
  - [Upload](#upload)
  - [Processing](#processing-inngest-job)
  - [Post-Upload UI](#post-upload-ui)
  - [Replace / Delete](#replace--delete)
- [Student Flow](#student-flow)
  - [Lesson View — Slides Section](#lesson-view--slides-section)
  - [Slideshow Mode](#slideshow-mode)
  - [Visibility](#visibility)
- [Content Protection (DRM)](#content-protection-drm)
  - [API Proxy for Image Serving](#api-proxy-for-image-serving)
  - [Visible Watermark (Server-Side)](#visible-watermark-server-side)
  - [Canvas Rendering](#canvas-rendering)
  - [Access Logging](#access-logging)
  - [Rate Limiting](#rate-limiting)
  - [Right-Click + Print Blocking](#right-click--print-blocking)
  - [Protection Limitations](#protection-limitations)
- [Implementation Plan](#implementation-plan)
  - [16A: Infrastructure + PDF Processing Pipeline](#16a-infrastructure--pdf-processing-pipeline)
  - [16B: Instructor Upload UI + API Routes](#16b-instructor-upload-ui--api-routes)
  - [16C: Student Viewer + DRM Protections](#16c-student-viewer--drm-protections)
- [All Files Summary](#all-files-summary)
  - [New Files](#new-files)
  - [Modified Files](#modified-files)
  - [New Environment Variables](#new-environment-variables)
- [Deployment Infrastructure](#deployment-infrastructure)
- [Verification Plan](#verification-plan)
- [Appendix A: 16A — Infrastructure Details](#appendix-a-16a--infrastructure-details)
- [Appendix B: 16B — Upload UI + API Route Details](#appendix-b-16b--upload-ui--api-route-details)
- [Appendix C: 16C — Student Viewer + DRM Details](#appendix-c-16c--student-viewer--drm-details)

---

## Context

Phase 16 adds slide deck support to lessons. Instructors upload a PDF of their slides; it's processed server-side into individual images. Students view slides in a responsive grid or full-screen slideshow modal, with DRM protections to deter unauthorized distribution.

**Why now:** Phase 14 established the Inngest background job pipeline and Supabase Storage infrastructure. The same Inngest client powers PDF processing. The existing lesson content model (text + video) extends naturally to include slides as a third content type.

**Target:** One slide deck per lesson, displayed alongside existing video and text content. Server-side visible watermarks, canvas rendering, and API-proxied image serving for content protection.

---

## Shared Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      INSTRUCTOR BROWSER                                 │
│                                                                         │
│  ┌─────────────────────┐                                                │
│  │ Lesson Editor Page   │                                               │
│  │ [Video URL]          │                                               │
│  │ [Upload Slides]  ◄── PDF file picker (≤25 MB, .pdf only)            │
│  │ [Text Editor]        │                                               │
│  └──────────┬──────────┘                                                │
│             │                                                           │
│    FormData POST /api/lessons/[id]/slides (PDF in body)                 │
│    Server uploads to storage via service role                           │
└─────────────┼───────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────┐  ┌──────────────────────────────────────┐
│  Supabase Storage            │  │  Supabase DB                         │
│  Bucket: slide-decks         │  │                                      │
│  (private, no public access) │  │  lesson_slide_decks                  │
│                              │  │    processing_status: pending →      │
│  /{cohort}/{lesson}/{deck}/  │  │      processing → ready | failed     │
│    original.pdf              │  │                                      │
│    pages/1.webp ... N.webp   │  │  slide_pages                         │
│    thumbnails/1.webp         │  │    page_number, storage_path,        │
│                              │  │    thumbnail_storage_path, w, h      │
└──────────────┬───────────────┘  └──────────────────┬───────────────────┘
               │                                     │
               │                        Inngest event:
               ▼                        "slides/process-deck"
┌──────────────────────────────────────────────────────────────────────────┐
│  INNGEST: download PDF → render pages via mupdf →                       │
│           resize/convert to WebP via Sharp → upload to storage →        │
│           generate thumbnails → insert slide_pages rows →               │
│           update status → ready                                         │
│  On failure: status = 'failed', processing_error logged | Retries: 3   │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                       STUDENT BROWSER                                    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────┐                │
│  │ Lesson Viewer Page                                   │               │
│  │                                                      │               │
│  │  [Video Player]              ← existing              │               │
│  │  [Slide Grid]                ← thumbnails via signed │               │
│  │     click → [Slideshow Modal]   URLs (CDN direct)    │               │
│  │  [Text Content]              ← existing              │               │
│  └──────────────────────┬───────────────────────────────┘               │
│                         │                                                │
│  Thumbnails: signed URLs from server (direct CDN, no proxy)             │
│  Full-res: GET /api/slides/[deckId]/pages/[num]/image?type=full         │
│    → session validation → rate limit (skip for preview) →               │
│    → single joined DB query → fetch from storage →                      │
│    → apply watermark via Sharp → stream with private cache headers      │
└──────────────────────────────────────────────────────────────────────────┘
```

> **⚠ DEVIATION — Upload mechanism:** Changed from TUS upload to FormData POST. The `supabase_storage_admin` role used by TUS cannot query RLS-protected public tables (`lessons`, `modules`, `cohorts`) from storage RLS policies, causing a 403. The API route now receives the PDF directly and uploads via service role. See `docs/storage-rls-upload-issue.md` for full analysis.

> **⚠ DEVIATION — PDF rendering:** Changed from `pdfjs-dist + canvas` to `mupdf`. The `node-canvas` package has incompatibilities with pdfjs-dist's Canvas API usage (gradient shading patterns throw "Image or Canvas expected"). `mupdf` provides a single-package solution with no Canvas API dependency.

> **⚠ DEVIATION — Thumbnail delivery:** Thumbnails are now served via server-generated signed URLs (direct CDN fetch) instead of the API proxy. This eliminates 5 network round trips per thumbnail. Full-res images still go through the API proxy for watermarking.

> **⚠ DEVIATION — Cache headers:** Changed from `no-store, no-cache` to `private, max-age=300` (student) / `private, max-age=600` (instructor preview). Safe because watermarks are baked in per-student and `private` prevents CDN/shared caching.

### Data Flow

1. **Upload** → Instructor selects PDF → FormData POST to `/api/lessons/[id]/slides` → server uploads PDF to `slide-decks` bucket via service role → creates DB row + emits Inngest event.
2. **Process** → Inngest: download PDF → render each page via `mupdf` → Sharp resize/convert to WebP (full-res 1920px + thumbnail 400px) → upload images to storage → insert `slide_pages` rows → status `ready`.
3. **View (Grid)** → Student loads lesson (server component) → fetch deck metadata + generate signed thumbnail URLs via `createSignedUrls()` → render thumbnail grid with direct CDN URLs.
4. **View (Slideshow)** → Click thumbnail → full-screen overlay modal → all high-res images preloaded via API proxy → rendered on single persistent `<canvas>` → keyboard/swipe navigation → instant switching from in-memory cache.
5. **DRM** → Full-res image requests: validate session + rate limit (skip for preview) → single joined DB query → fetch from storage → check in-memory profile cache → composite visible watermark (student name) via Sharp → stream with `private, max-age=300` headers.

---

## Key Architecture Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| **Content layout** | **Video → Slides → Text** | Slides are the primary instructional content for slide-based lessons; video introduction comes first, text supplements below. |
| **Decks per lesson** | **One** | Simplifies data model and UI. Instructor replaces to update. |
| **Max PDF size** | **25 MB** | Covers ~200-page decks with images. Keeps processing time reasonable (<10 min). |
| **PDF processing** | **Inngest background job** | Reuses existing Inngest infrastructure from Phase 14. Async processing avoids blocking upload request. |
| **PDF rendering** | **`mupdf`** | Originally planned `pdfjs-dist` + `canvas`, but `node-canvas` has incompatibilities with pdfjs-dist's gradient shading patterns. `mupdf` provides reliable server-side PDF rendering in a single package with no Canvas API dependency. |
| **Image format** | **WebP** | 25-35% smaller than PNG at equivalent quality. 97%+ browser support. Sharp handles conversion natively. |
| **Image serving** | **API proxy for full-res; signed URLs for thumbnails** | Full-res images go through API proxy for watermarking + logging. Thumbnails use server-generated signed URLs (direct CDN) for fast grid loading. |
| **Watermark** | **Visible, server-side via Sharp** | Baked into image — cannot be bypassed by DOM inspection. Student name + short ID tiled diagonally. Strongest practical deterrent. |
| **Slide rendering** | **`<canvas>` element** | No `<img>` tag = no right-click "Save Image As". Canvas `drawImage()` renders the watermarked image. |
| **Slideshow mode** | **Full-screen overlay modal** | Student stays on lesson page. Escape/close to return. No Fullscreen API needed (avoids browser restrictions). |
| **Rate limiting** | **120 requests/min per user** | Allows fast slideshow browsing (~2 slides/sec) but blocks automated bulk scraping. Uses existing Upstash Redis infrastructure. |
| **Access logging** | **Every image request logged** | Investigation trail for leaked content. Not real-time monitoring. Lightweight INSERT per request. |
| **Search indexing** | **Skipped for now** | Can add PDF text extraction + vector embeddings later. Keeps initial scope focused. |
| **Storage bucket** | **Separate `slide-decks` bucket** | Isolates slide content from `submissions-media`. Different access patterns and RLS policies. |
| **Upload mechanism** | **FormData POST (server-side upload)** | Originally planned TUS, but Supabase Storage RLS policies can't join through RLS-protected public tables (the `supabase_storage_admin` role can't query `lessons`/`modules`/`cohorts`). Server receives PDF via FormData and uploads with service role. See `docs/storage-rls-upload-issue.md`. |

---

## Storage Layout

```
slide-decks/                              ← Supabase Storage bucket (private)
  {cohort_id}/
    {lesson_id}/
      {deck_id}/
        original.pdf                      # instructor's uploaded PDF — never served to students
        pages/
          1.webp                          # full-res rendered page (max 1920px wide, quality 90)
          2.webp
          ...
        thumbnails/
          1.webp                          # grid thumbnail (400px wide, quality 80)
          2.webp
          ...
```

- **Format**: WebP (25-35% smaller than PNG, 97%+ browser support)
- **Full-res**: Max 1920px wide, quality 90 — used in slideshow mode
- **Thumbnails**: 400px wide, quality 80 — used in grid view
- **Bucket**: `slide-decks` (private, no public access, 25 MB per-file limit)
- **Estimated size per deck**: ~37 MB for a 50-page deck (25 MB PDF + ~10 MB pages + ~2 MB thumbnails)

---

## API Endpoints

### Instructor APIs

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| POST | `/api/lessons/[lessonId]/slides` | Create deck after PDF upload, dispatch Inngest processing | `SYLLABUS_MANAGE` |
| GET | `/api/lessons/[lessonId]/slides` | Get deck metadata + processing status + page list | Authenticated (RLS) |
| DELETE | `/api/lessons/[lessonId]/slides` | Remove deck, delete all storage files, cascade-delete DB rows | `SYLLABUS_MANAGE` |

### Student APIs

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/lessons/[lessonId]/slides` | Get deck metadata (page count, dimensions) | Enrolled + published + released (RLS) |
| GET | `/api/slides/[deckId]/pages/[num]/image?type=full\|thumbnail` | Serve watermarked slide image via proxy | Session + enrollment + rate limit |

**Note**: Students never receive direct storage URLs. All images are served through the API proxy which applies watermarks, logs access, and enforces rate limits.

---

## Instructor Flow

### Upload

**UI Location**: Lesson editor page, new "Slides" section between video URL input and Tiptap text editor.

**Flow**:
1. Instructor clicks "Upload Slides" button in a dashed-border drop zone
2. File picker opens, restricted to `.pdf`
3. Client-side validation:
   - File type: `application/pdf` only
   - File size: ≤ 25 MB
   - Rejects with inline error message if invalid
4. Upload PDF as FormData POST to `/api/lessons/[lessonId]/slides`
   - Progress bar shows upload percentage
   - Server validates MIME type + file size, uploads to storage via service role
   - Server creates `lesson_slide_decks` row (status: `pending`) and dispatches Inngest event: `slides/process-deck`
   - On failure, server cleans up any uploaded storage file
5. UI switches from upload button to processing status indicator

> **⚠ DEVIATION:** Originally planned TUS upload directly to Supabase Storage, then a separate POST with metadata. Changed to FormData POST because `supabase_storage_admin` role cannot evaluate RLS policies that join through RLS-protected public tables. The API route now handles both file upload and DB creation atomically.

**Permissions**: Requires `SYLLABUS_MANAGE` (instructor, course_coordinator). Teaching fellows cannot upload slides.

### Processing (Inngest Job)

**Event**: `slides/process-deck`

**Steps**:
1. Update `processing_status` → `processing`
2. Download PDF from storage
3. Load PDF via `mupdf`
4. For each page (capped at 300 pages):
   a. Render page to pixmap via `mupdf` at 2× scale for quality
   b. Export pixmap to PNG buffer
   c. Convert to WebP via Sharp — full-res: max 1920px wide, quality 90
   d. Generate thumbnail via Sharp — 400px wide, quality 80
   e. Upload both to storage (`pages/{N}.webp`, `thumbnails/{N}.webp`)
   f. Insert `slide_pages` row with dimensions
5. Update `total_pages` and `processing_status` → `ready`
6. On error: `processing_status` → `failed`, store error in `processing_error`

**Retry**: 3 attempts with exponential backoff.

**Timeout**: 10 minutes max (handles ~200-page decks comfortably).

**Processing tech**: `mupdf` (PDF parsing/rendering) + `sharp` (resize, WebP conversion).

> **⚠ DEVIATION:** Originally planned `pdfjs-dist` + `canvas` (Node.js). Changed to `mupdf` because `node-canvas` has incompatibilities with pdfjs-dist's Canvas API usage — specifically, gradient shading patterns (`RadialAxialShadingPattern`) throw "Image or Canvas expected". `mupdf` renders pages to pixmaps directly without needing a Canvas API implementation.

### Post-Upload UI

Once processing completes, the upload zone transforms into a management panel:
- **File name** + **slide count badge** (e.g., "Lecture-3.pdf · 42 slides")
- **Thumbnail preview grid** — 4-column grid of all slide thumbnails (instructor sees without watermark)
- **"Replace" link** — opens file picker to upload a new PDF (replaces entire deck)
- **"Remove" link** — deletes deck entirely with confirmation dialog

During processing:
- Spinner with "Processing slides..." text
- Polls `/api/lessons/[lessonId]/slides` every 3 seconds for status updates
- On failure: red error text with "Try uploading again" prompt

### Replace / Delete

**Replace**:
1. Instructor clicks "Replace" → selects new PDF → same upload flow as initial
2. Before creating new deck, API deletes old deck:
   - All storage files (PDF + page images + thumbnails)
   - DB rows cascade-delete (`lesson_slide_decks` → `slide_pages` + `slide_access_logs`)
3. New deck processes independently

**Delete**:
1. Instructor clicks "Remove" → confirmation dialog: "Remove slide deck? This cannot be undone."
2. On confirm → DELETE `/api/lessons/[lessonId]/slides`
3. Server deletes all storage files under the deck's path
4. DB row cascade-deletes all associated pages and access logs
5. UI reverts to empty upload state

---

## Student Flow

### Lesson View — Slides Section

**Layout order**: Video player → **Slides section** → Text content

Slides section only renders when a deck exists with `processing_status = 'ready'`. Otherwise the section is entirely absent — no empty state, no placeholder.

**Grid View** (default):
- Header row: "Slides (42)" label on left, "View Slideshow" link on right
- Responsive thumbnail grid below:
  - Mobile (<640px): **2 columns**
  - Tablet (640-1024px): **3 columns**
  - Desktop (>1024px): **4 columns**
- Each thumbnail:
  - 4:3 aspect ratio container with `object-contain` for varying slide dimensions
  - Fetched via server-generated signed URLs (direct CDN, no API proxy)
  - Slide number overlay (bottom-right corner, appears on hover)
  - Hover: blue ring highlight
  - Click → opens slideshow starting at that slide
  - `loading="lazy"` for offscreen thumbnails
- Right-click disabled on entire grid (`oncontextmenu` prevented)
- Images are not draggable (`draggable={false}`)

> **⚠ DEVIATION — Thumbnail delivery:** Originally planned to fetch thumbnails through the API proxy with watermarks. Changed to server-generated signed URLs via `createSignedUrls()` (batch call in the server component) for direct CDN delivery. This eliminates 5 network round trips per thumbnail (auth + rate limit + DB + storage download + watermark processing). Thumbnails are not watermarked — watermarks are applied only to full-res images in the slideshow.

### Slideshow Mode

**Trigger**: Click any thumbnail or "View Slideshow" button (starts from slide 1).

**UI — Full-screen overlay modal**:
- Dark backdrop (black at 95% opacity, `z-index: 50`)
- Current slide rendered on `<canvas>` element, centered and scaled to fit viewport (maintains aspect ratio)
- Loading spinner while image loads from API proxy

**Navigation**:
- **Left/right arrow buttons**: Positioned at vertical center of left/right edges. Hidden when at first/last slide respectively.
- **Keyboard**: ← → arrow keys to navigate, ↑ ↓ also work, Escape to close
- **Touch**: Swipe left/right on mobile (50px threshold)
- **Close button**: × icon in top-right corner

**Slide counter**: "5 / 24" displayed at bottom center (white text at 70% opacity)

**Image loading strategy**:
- Current slide loaded immediately (high-res via API proxy)
- All remaining slides preloaded in background after 100ms delay (images are 7-47KB each)
- Images cached in-memory as `HTMLImageElement` instances in a `Map<number, HTMLImageElement>`
- Single persistent `<canvas>` element redrawn on navigation (no component remount)
- Spinner only shown while current slide is still loading — once cached, navigation is instant

> **⚠ DEVIATION — Preloading strategy:** Originally planned preloading ±1 adjacent slides only. Changed to preload ALL slides at once because images are very small (7-47KB WebP). A single persistent canvas is redrawn from the in-memory cache, making navigation instant. The `SlideCanvas` component from the original plan is no longer used by the slideshow (it embeds its own canvas logic with the preload-all cache).

**Body scroll**: Disabled while modal is open (`overflow: hidden` on body), restored on close.

### Visibility

- Slides section only appears if `lesson_slide_decks` exists with `processing_status = 'ready'`
- Respects existing lesson access controls:
  - `is_published = true` on the lesson
  - `release_date` has passed (or is null)
  - Student has active enrollment in the cohort
- All enforced via RLS policies — if the student can see the lesson, they can see its slides
- If processing is still `pending` or `processing`, slides section is hidden from students (no "coming soon" state)

---

## Content Protection (DRM)

### API Proxy for Image Serving

**Endpoint**: `GET /api/slides/[deckId]/pages/[pageNumber]/image?type=full|thumbnail`

All slide images are served through this server-side proxy. Students never get direct storage URLs.

**Request flow**:
1. Validate user session (must be authenticated)
2. Apply rate limiting — 120 requests/min per user (skip for instructor preview)
3. Single joined DB query: fetch page + verify deck access via RLS (`slide_pages` joined to `lesson_slide_decks!inner`)
4. Fetch image from Supabase Storage using service role (bypasses storage RLS)
5. Check in-memory profile cache (5 min TTL) for student name — avoids DB query per image
6. Apply visible watermark with student's name (see [Watermark](#visible-watermark-server-side))
7. Log access to `slide_access_logs` (fire-and-forget — see [Access Logging](#access-logging))
8. Stream watermarked image to client with private cache headers:

```
Cache-Control: private, max-age=300    (student watermarked: 5 min)
               private, max-age=600    (instructor preview: 10 min)
Content-Type: image/webp
X-Content-Type-Options: nosniff
Content-Disposition: inline
```

**Instructor preview**: When `?preview=true` is passed (only from lesson editor), watermark, access logging, and rate limiting are skipped. The API still validates access via RLS.

**No TTL/expiry issues**: Full-res images are served through the API proxy using the session cookie for auth. Thumbnails use signed URLs with 10 min expiry (generated server-side in the lesson page component).

> **⚠ DEVIATION — Query optimization:** Originally planned separate deck access check + page fetch (2 queries). Combined into a single query with join (`slide_pages` + `lesson_slide_decks!inner`) to reduce per-request latency.

> **⚠ DEVIATION — Profile cache:** Added server-side in-memory `Map` cache with 5 min TTL for student profile names. Avoids a DB query to the `profiles` table on every image request.

> **⚠ DEVIATION — Cache-Control:** Originally planned `no-store, no-cache, must-revalidate`. Changed to `private, max-age=300/600` because watermarks are baked in per-student — browser-level caching is safe and dramatically reduces repeat-view latency.

### Visible Watermark (Server-Side)

Applied by the API proxy on every image response using Sharp's `composite()` with an SVG overlay.

- **Text**: Student's full name + short user ID suffix (e.g., "Jane Smith · a3f2")
- **Style**: Semi-transparent white text with dark drop shadow for readability on both light and dark slides
- **Opacity**: ~18% — readable on close inspection, doesn't obstruct slide content
- **Rotation**: -35° diagonal tiling
- **Coverage**: Text repeated in a grid pattern across the image (spacingX=1000, spacingY=400 for full-res) — minimal density for readability, still ensures watermark survives partial screenshots or cropping
- **Thumbnail variant**: Smaller font size (12px vs 28px), tighter spacing (spacingX=250, spacingY=100)

> **⚠ DEVIATION — Watermark density:** Reduced from dense (spacingX=400, spacingY=150) to minimal (spacingX=1000, spacingY=400) — ~80% fewer watermark repetitions. Provides a subtler overlay that doesn't obstruct slide content while maintaining traceability.

**Why server-side**: The watermark is baked into the pixel data before streaming. A student inspecting the DOM, extracting the canvas image, or intercepting the network response will always get the watermarked version. Cannot be removed without image editing (and the diagonal tiling makes clean removal very difficult).

**Performance**: Sharp compositing takes ~10-50ms per image. For fast slideshow navigation, a short in-memory cache per `(userId, deckId, pageNumber)` with 5-minute TTL avoids re-compositing when navigating back and forth.

### Canvas Rendering

Slide images are rendered onto `<canvas>` elements instead of `<img>` tags:

- Browser's right-click → "Save Image As" is not available on canvas elements
- Image data is drawn via `CanvasRenderingContext2D.drawImage()`
- A transparent `<div>` overlay sits above the canvas with `pointer-events: auto` and `oncontextmenu` prevention
- Canvas CSS: `user-select: none`, `-webkit-user-select: none`

**What this prevents**: Casual right-click saving, drag-to-desktop.

**What this doesn't prevent**: A technical user can call `canvas.toDataURL()` in DevTools — but the resulting image is still watermarked (server-side baked).

### Access Logging

Every image request through the API proxy logs to `slide_access_logs`:

| Field | Source |
|-------|--------|
| `deck_id` | URL parameter |
| `page_number` | URL parameter |
| `user_id` | Session |
| `ip_address` | `x-forwarded-for` header |
| `user_agent` | Request header |
| `accessed_at` | Server timestamp |

**Purpose**: Investigation trail if slides are leaked. Not real-time monitoring or alerting.

**Implementation**: Fire-and-forget INSERT (doesn't block the image response).

**Retention**: Logs retained for the duration of the cohort + 90 days. No automatic cleanup — manual or cron-based purge.

**Index**: `(deck_id, user_id, accessed_at)` for efficient queries like "show me all access by user X for deck Y."

### Rate Limiting

**Per-user limit**: 120 slide image requests per 1-minute window.

**Why 120/min**: Allows fast slideshow browsing at ~2 slides/second (each slide = 1 full-res request). Even rapid keyboard-arrow navigation stays well within this limit. But automated scripts downloading all slides sequentially would hit the cap on a 120+ page deck.

**Implementation**: New `SLIDE_IMAGE_LIMIT` entry in existing Upstash Redis rate limiter (`src/lib/rate-limit.ts`), keyed by `userId:slides`.

**On limit exceeded**: HTTP 429 with body `{ error: "Too many requests. Please wait before viewing more slides." }`.

### Right-Click + Print Blocking

**Right-click**: `oncontextmenu` handler returns `false` on all slide containers (grid and slideshow). Prevents the browser context menu from appearing.

**Print**: CSS `@media print` rule hides all slide containers and shows a message: "Slide content is not available for printing."

**Limitations**: Both are trivially bypassed via DevTools. They exist as speed bumps for non-technical users, not as real security measures.

### Protection Limitations

No web-based DRM is unbreakable. These measures deter casual sharing:

| What's Prevented | How |
|---|---|
| Right-click "Save Image As" | Canvas rendering (no `<img>` tag) |
| Direct URL sharing | API proxy (session-required, no static URLs) |
| Bulk downloading / scraping | Rate limiting (120/min) |
| Browser print | CSS `@media print` hiding |
| Anonymous sharing of screenshots | Visible watermark traces to specific student |

| What Can't Be Fully Prevented | Why |
|---|---|
| Screen recording software | OS-level, outside browser control |
| External camera photos | Physical world, no software solution |
| Determined technical users | DevTools access to canvas data (still watermarked) |

**The visible watermark is the strongest deterrent** — students know that any shared content is personally traceable to them. This social/accountability pressure is more effective than any technical measure.

---

## Implementation Plan

### 16A: Infrastructure + PDF Processing Pipeline

*~2 sessions. Migration, storage bucket, Inngest processing function, Sharp watermark utility.*

#### What Ships

- Migration `00023`: `lesson_slide_decks`, `slide_pages`, `slide_access_logs` tables + RLS + storage bucket
- Inngest function: `processSlidesDeck` — PDF → page images → thumbnails → DB rows
- Watermark utility: Sharp-based SVG text composite
- Slide-specific constants (sizes, quality, MIME types)

---

### 16B: Instructor Upload UI + API Routes

*~1-2 sessions. Upload/delete/status API routes, lesson editor UI integration.*

#### What Ships

- API routes: POST/GET/DELETE `/api/lessons/[lessonId]/slides`
- `SlideUpload` component — file picker, TUS upload, processing status, preview grid, replace/remove
- Lesson editor page updated with Slides section between video URL and text editor

---

### 16C: Student Viewer + DRM Protections

*~2 sessions. Image proxy route, grid view, slideshow modal, canvas rendering, all DRM layers.*

#### What Ships

- API route: GET `/api/slides/[deckId]/pages/[pageNumber]/image` — session-validated proxy with watermark
- `SlideGrid` component — responsive thumbnail grid
- `SlideSlideshow` component — full-screen overlay modal with canvas rendering
- `SlideCanvas` component — canvas-based image renderer with DRM CSS
- Rate limiter: `SLIDE_IMAGE_LIMIT` (120/min per user)
- Access logging on every image request
- Print blocking, right-click prevention

---

## All Files Summary

### New Files

| File | Purpose | Ships |
|------|---------|-------|
| `supabase/migrations/00023_lesson_slides.sql` | Schema + storage bucket + RLS policies | 16A |
| `src/lib/slides/constants.ts` | PDF/image size limits, quality settings, MIME validation | 16A |
| `src/lib/slides/watermark.ts` | Sharp SVG watermark composite utility | 16A |
| `src/lib/inngest/functions/process-slides.ts` | Inngest: PDF → images → thumbnails → DB | 16A |
| `src/app/api/lessons/[lessonId]/slides/route.ts` | POST (upload), GET (metadata), DELETE (remove) | 16B |
| `src/app/api/slides/[deckId]/pages/[pageNumber]/image/route.ts` | GET: session-validated image proxy with watermark | 16C |
| `src/components/slides/slide-upload.tsx` | Instructor: file picker, TUS upload, status, preview | 16B |
| `src/components/slides/slide-processing-status.tsx` | Shared: pending/processing/ready/failed indicator | 16B |
| `src/components/slides/slide-grid.tsx` | Student: responsive thumbnail grid | 16C |
| `src/components/slides/slide-slideshow.tsx` | Student: full-screen overlay modal + navigation | 16C |
| `src/components/slides/slide-canvas.tsx` | Student: canvas-rendered slide image with DRM CSS (orphaned — slideshow embeds its own canvas logic) | 16C |
| `docs/storage-rls-upload-issue.md` | Technical problem description: Supabase Storage RLS limitation + solution options | 16B |

### Modified Files

| File | Change | Ships |
|------|--------|-------|
| `package.json` | Add `mupdf`, `sharp` (originally planned `pdfjs-dist` + `canvas`) | 16A |
| `src/lib/inngest/client.ts` | Add `slides/process-deck` event type | 16A |
| `src/app/api/inngest/route.ts` | Register `processSlidesDeck` function | 16A |
| `src/lib/rate-limit.ts` | Add `SLIDE_IMAGE_LIMIT` (120/min) | 16C |
| `src/app/(school-admin)/[schoolSlug]/admin/courses/[courseId]/cohorts/[cohortId]/lessons/[lessonId]/page.tsx` | Add SlideUpload section between video URL and text editor | 16B |
| `src/app/(student-course)/[schoolSlug]/[courseSlug]/[cohortId]/home/lessons/[lessonId]/page.tsx` | Add SlideGrid section between video player and text content | 16C |
| `src/types/database.ts` | Add `lesson_slide_decks`, `slide_pages`, `slide_access_logs` types | 16A |
| `vercel.json` | No CSP changes needed (images served via same-origin API proxy) | — |

### New Environment Variables

None. All infrastructure (Inngest, Supabase Storage, Upstash Redis) is already configured from Phase 14.

---

## Deployment Infrastructure

### What Already Exists (from Phase 14)

| Layer | Service | Status |
|-------|---------|--------|
| Supabase Storage | `submissions-media` bucket | ✅ Active |
| Inngest | Background job pipeline | ✅ Active |
| Upstash Redis | Rate limiting | ✅ Active |
| TUS uploads | Supabase resumable uploads | ✅ Active |

### What's New

| New Infrastructure | Cost | Notes |
|-------------------|------|-------|
| Supabase Storage bucket: `slide-decks` | Free tier: 1GB shared | Private, no public access |
| `sharp` npm package | Free | Native image processing, pre-built binaries for Vercel |
| `mupdf` npm package | Free | Server-side PDF rendering (replaced planned `pdfjs-dist` + `canvas`) |

**Cost impact:** Minimal. Inngest runs already on free tier (50K runs/month). Storage usage depends on slide volume — a 50-page deck at ~200KB/page WebP = ~10MB per deck (full-res) + ~2MB (thumbnails) + original PDF = ~37MB total per deck.

---

## Verification Plan

1. **After 16A (Migration):** Migration runs cleanly. `lesson_slide_decks`, `slide_pages`, `slide_access_logs` tables exist. `slide-decks` bucket created. RLS policies enforced.
2. **After 16A (Processing):** Upload test PDF to storage manually → trigger Inngest event → verify pages rendered to WebP → thumbnails generated → `slide_pages` rows inserted → status = `ready`.
3. **After 16A (Error handling):** Upload corrupt/invalid PDF → verify status = `failed`, `processing_error` populated, retries exhausted.
4. **After 16B (Upload):** Instructor uploads PDF via lesson editor → TUS upload completes → API creates deck row → Inngest processes → editor shows thumbnail preview grid.
5. **After 16B (Replace):** Upload second PDF to same lesson → verify old deck deleted (storage + DB) → new deck processed and displayed.
6. **After 16B (Delete):** Click remove → verify all storage files deleted → DB rows cascade-deleted → editor shows empty upload state.
7. **After 16B (Permissions):** Non-instructor (student, teaching_fellow) cannot POST/DELETE slides → 403.
8. **After 16C (Grid view):** Student views lesson with slides → responsive thumbnail grid renders → 2 cols mobile, 3 tablet, 4 desktop.
9. **After 16C (Slideshow):** Click thumbnail → full-screen overlay opens at correct slide → arrow keys navigate → Escape closes → slide counter updates.
10. **After 16C (Watermark):** Download image from API proxy → visible watermark with student name + ID is baked into the image → different student sees their own name.
11. **After 16C (Canvas):** Right-click on slide in slideshow → no "Save Image As" option (canvas element). Verify `<img>` tag is not used.
12. **After 16C (Rate limit):** Script 150 rapid image requests → verify 429 after 120th request within 1 minute.
13. **After 16C (Access log):** View 5 slides → verify 5 rows in `slide_access_logs` with correct `user_id`, `page_number`, `ip_address`, `user_agent`.
14. **After 16C (Print block):** Ctrl+P on lesson page → slides section hidden in print preview.
15. **After 16C (Enrollment):** Unenrolled user requests slide image → 403. Enrolled user with unpublished lesson → 403.
16. **After 16C (Release date):** Lesson with future `release_date` → student sees no slides section. After release_date passes → slides appear.
17. **Large deck:** Upload 100-page PDF → processing completes within 10 min → all 100 pages render correctly.
18. **Build check:** `npm run build` passes after each implementation step.

---

# Appendices — Detailed Implementation Specs

The sections above provide the condensed plan. The appendices below contain full code snippets, interface definitions, migration SQL, route specifications, and component specs for implementation reference.

---

## Appendix A: 16A — Infrastructure Details

### A.1 Migration: `supabase/migrations/00023_lesson_slides.sql`

```sql
-- ============================================================================
-- Phase 16: Lesson Slides
-- ============================================================================

-- Slide decks (one per lesson)
CREATE TABLE lesson_slide_decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  original_file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  total_pages INTEGER,
  processing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processing', 'ready', 'failed')),
  processing_error TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(lesson_id)  -- one deck per lesson
);

-- Individual slide page images
CREATE TABLE slide_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id UUID NOT NULL REFERENCES lesson_slide_decks(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  thumbnail_storage_path TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  UNIQUE(deck_id, page_number)
);

-- Access logging for DRM investigation
CREATE TABLE slide_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id UUID NOT NULL REFERENCES lesson_slide_decks(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  ip_address INET,
  user_agent TEXT,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_slide_access_logs_deck_user
  ON slide_access_logs(deck_id, user_id, accessed_at);

CREATE INDEX idx_slide_pages_deck
  ON slide_pages(deck_id, page_number);

-- Trigger for updated_at
CREATE TRIGGER set_lesson_slide_decks_updated_at
  BEFORE UPDATE ON lesson_slide_decks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Storage Bucket
-- ============================================================================

-- 25 MB per PDF max. Bucket holds originals + rendered pages + thumbnails.
-- A 100-page deck ≈ 37 MB total (PDF + pages + thumbnails).
-- Bucket limit set to 500 MB — plenty for initial usage.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('slide-decks', 'slide-decks', false, 26214400)  -- 25 MB per file
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- RLS Policies: lesson_slide_decks
-- ============================================================================

ALTER TABLE lesson_slide_decks ENABLE ROW LEVEL SECURITY;

-- SELECT: enrolled students (published + released lesson) + course staff + platform admin
-- Joins through lesson → module → cohort to check enrollment and lesson visibility
CREATE POLICY "Enrolled students can view slide decks for published released lessons"
ON lesson_slide_decks FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM lessons l
    JOIN modules m ON m.id = l.module_id
    WHERE l.id = lesson_slide_decks.lesson_id
      AND l.is_published = true
      AND (l.release_date IS NULL OR l.release_date <= now())
      AND is_enrolled(auth.uid(), m.cohort_id)
  )
);

CREATE POLICY "Course staff can view all slide decks"
ON lesson_slide_decks FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM lessons l
    JOIN modules m ON m.id = l.module_id
    JOIN cohorts c ON c.id = m.cohort_id
    WHERE l.id = lesson_slide_decks.lesson_id
      AND has_course_role(auth.uid(), c.course_id)
  )
);

-- INSERT/UPDATE/DELETE: SYLLABUS_MANAGE permission holders only
CREATE POLICY "Syllabus managers can insert slide decks"
ON lesson_slide_decks FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM lessons l
    JOIN modules m ON m.id = l.module_id
    JOIN cohorts c ON c.id = m.cohort_id
    WHERE l.id = lesson_slide_decks.lesson_id
      AND has_course_permission(auth.uid(), c.course_id, 'SYLLABUS_MANAGE')
  )
);

CREATE POLICY "Syllabus managers can update slide decks"
ON lesson_slide_decks FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM lessons l
    JOIN modules m ON m.id = l.module_id
    JOIN cohorts c ON c.id = m.cohort_id
    WHERE l.id = lesson_slide_decks.lesson_id
      AND has_course_permission(auth.uid(), c.course_id, 'SYLLABUS_MANAGE')
  )
);

CREATE POLICY "Syllabus managers can delete slide decks"
ON lesson_slide_decks FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM lessons l
    JOIN modules m ON m.id = l.module_id
    JOIN cohorts c ON c.id = m.cohort_id
    WHERE l.id = lesson_slide_decks.lesson_id
      AND has_course_permission(auth.uid(), c.course_id, 'SYLLABUS_MANAGE')
  )
);

-- ============================================================================
-- RLS Policies: slide_pages (read-only for clients, server manages writes)
-- ============================================================================

ALTER TABLE slide_pages ENABLE ROW LEVEL SECURITY;

-- SELECT: same as lesson_slide_decks (inherits through deck → lesson chain)
CREATE POLICY "Users who can view decks can view pages"
ON slide_pages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM lesson_slide_decks d
    WHERE d.id = slide_pages.deck_id
    -- RLS on lesson_slide_decks already enforces access
  )
);

-- No INSERT/UPDATE/DELETE policies for clients.
-- Server uses service role for page management during processing.

-- ============================================================================
-- RLS Policies: slide_access_logs (insert-only for API proxy, read for staff)
-- ============================================================================

ALTER TABLE slide_access_logs ENABLE ROW LEVEL SECURITY;

-- No client-facing policies. Server uses service role to INSERT logs
-- and staff can query via admin API if needed.

-- ============================================================================
-- Storage RLS: slide-decks bucket
-- ============================================================================

-- ⚠ DEVIATION: INSERT and DELETE policies were REMOVED.
-- The supabase_storage_admin role (used by TUS and storage APIs) cannot
-- evaluate RLS policies that join through RLS-protected public tables
-- (lessons, modules, cohorts). All uploads and deletes now go through
-- the API route using the service role. See docs/storage-rls-upload-issue.md.

-- Staff can read for debugging/admin purposes (kept for admin access)
CREATE POLICY "Course staff can read slide storage"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'slide-decks'
  AND EXISTS (
    SELECT 1 FROM lessons l
    JOIN modules m ON m.id = l.module_id
    JOIN cohorts c ON c.id = m.cohort_id
    WHERE m.cohort_id::text = (storage.foldername(name))[1]
      AND l.id::text = (storage.foldername(name))[2]
      AND has_course_role(auth.uid(), c.course_id)
  )
);
```

### A.2 Constants: `src/lib/slides/constants.ts`

```typescript
// src/lib/slides/constants.ts

// PDF constraints
export const MAX_PDF_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
export const ALLOWED_PDF_MIME = "application/pdf";
export const MAX_PAGES = 300; // safety cap to prevent abuse

// Image output settings
export const FULL_RES_MAX_WIDTH = 1920;
export const FULL_RES_QUALITY = 90;
export const THUMBNAIL_WIDTH = 400;
export const THUMBNAIL_QUALITY = 80;
export const OUTPUT_FORMAT = "webp" as const;

// Watermark settings
// Note: WATERMARK_OPACITY and WATERMARK_COLOR removed — opacity is hardcoded
// in the SVG template in watermark.ts for simplicity.
export const WATERMARK_FONT_SIZE_FULL = 28; // px, for full-res images
export const WATERMARK_FONT_SIZE_THUMBNAIL = 12; // px, lighter for thumbnails
export const WATERMARK_ROTATION_DEG = -35; // diagonal tilt
// ⚠ DEVIATION: Watermark spacing set to minimal density in watermark.ts:
// Full-res: spacingX=1000, spacingY=400 (originally 400/150)
// Thumbnail: spacingX=250, spacingY=100 (originally 200/80)

// Rate limiting
export const SLIDE_IMAGE_RATE_LIMIT = 120; // requests per window
export const SLIDE_IMAGE_RATE_WINDOW = "1 m"; // 1 minute window

// Storage path helpers
export function slideDeckStoragePath(
  cohortId: string,
  lessonId: string,
  deckId: string
): string {
  return `${cohortId}/${lessonId}/${deckId}`;
}

export function slidePageStoragePath(
  basePath: string,
  pageNumber: number
): string {
  return `${basePath}/pages/${pageNumber}.webp`;
}

export function slideThumbnailStoragePath(
  basePath: string,
  pageNumber: number
): string {
  return `${basePath}/thumbnails/${pageNumber}.webp`;
}

export function slideOriginalStoragePath(basePath: string): string {
  return `${basePath}/original.pdf`;
}
```

### A.3 Watermark Utility: `src/lib/slides/watermark.ts`

```typescript
// src/lib/slides/watermark.ts
import sharp from "sharp";
import {
  WATERMARK_FONT_SIZE_FULL,
  WATERMARK_FONT_SIZE_THUMBNAIL,
  WATERMARK_ROTATION_DEG,
} from "./constants";

interface WatermarkOptions {
  imageBuffer: Buffer;
  studentName: string;
  studentIdSuffix: string; // first 4 chars of user ID
  isThumbnail: boolean;
}

/**
 * Applies a visible diagonal tiled watermark to an image buffer.
 * Uses Sharp's composite() with an SVG text overlay.
 *
 * The watermark text is "{studentName} · {studentIdSuffix}" repeated
 * in a diagonal pattern across the entire image.
 */
export async function applyWatermark({
  imageBuffer,
  studentName,
  studentIdSuffix,
  isThumbnail,
}: WatermarkOptions): Promise<Buffer> {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();
  const width = metadata.width!;
  const height = metadata.height!;

  const fontSize = isThumbnail
    ? WATERMARK_FONT_SIZE_THUMBNAIL
    : WATERMARK_FONT_SIZE_FULL;
  const text = `${studentName} \u00B7 ${studentIdSuffix}`;

  // Generate tiled watermark SVG
  // ⚠ DEVIATION: Reduced to minimal density (~80% fewer repetitions)
  const spacingX = isThumbnail ? 250 : 1000;
  const spacingY = isThumbnail ? 100 : 400;

  let textElements = "";
  // Extend beyond bounds to cover after rotation
  for (let y = -height; y < height * 2; y += spacingY) {
    for (let x = -width; x < width * 2; x += spacingX) {
      textElements += `<text x="${x}" y="${y}" font-size="${fontSize}" fill="white" opacity="0.18" font-family="sans-serif" filter="url(#shadow)">${escapeXml(text)}</text>`;
    }
  }

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="1" dy="1" stdDeviation="1" flood-color="rgba(0,0,0,0.5)" />
        </filter>
      </defs>
      <g transform="rotate(${WATERMARK_ROTATION_DEG}, ${width / 2}, ${height / 2})">
        ${textElements}
      </g>
    </svg>
  `;

  return image
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .webp()
    .toBuffer();
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
```

### A.4 Inngest Function: `src/lib/inngest/functions/process-slides.ts`

```typescript
// src/lib/inngest/functions/process-slides.ts
import { inngest } from "../client";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import {
  FULL_RES_MAX_WIDTH,
  FULL_RES_QUALITY,
  THUMBNAIL_WIDTH,
  THUMBNAIL_QUALITY,
  OUTPUT_FORMAT,
  MAX_PAGES,
  slidePageStoragePath,
  slideThumbnailStoragePath,
} from "../../slides/constants";

export const processSlidesDeck = inngest.createFunction(
  {
    id: "process-slides-deck",
    retries: 3,
    timeouts: { finish: "10m" },
  },
  { event: "slides/process-deck" },
  async ({ event, step }) => {
    const { deckId, lessonId, cohortId, storagePath } = event.data;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Step 1: Update status to processing
    await step.run("set-processing", async () => {
      const { error } = await supabase
        .from("lesson_slide_decks")
        .update({ processing_status: "processing" })
        .eq("id", deckId);
      if (error) throw new Error(`Failed to update status: ${error.message}`);
    });

    // Step 2: Download PDF from storage
    const pdfBuffer = await step.run("download-pdf", async () => {
      const { data, error } = await supabase.storage
        .from("slide-decks")
        .download(`${storagePath}/original.pdf`);
      if (error || !data) throw new Error(`Failed to download PDF: ${error?.message}`);
      const arrayBuffer = await data.arrayBuffer();
      return Buffer.from(arrayBuffer);
    });

    // Step 3: Render pages and upload
    // ⚠ DEVIATION: Uses mupdf instead of pdfjs-dist + canvas
    const totalPages = await step.run("render-pages", async () => {
      const mupdf = await import("mupdf");

      const doc = mupdf.Document.openDocument(pdfBuffer, "application/pdf");
      const numPages = Math.min(doc.countPages(), MAX_PAGES);

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = doc.loadPage(pageNum - 1); // mupdf is 0-indexed
        const scale = 2.0; // 2x for quality
        const pixmap = page.toPixmap(
          [scale, 0, 0, scale, 0, 0],
          mupdf.ColorSpace.DeviceRGB,
          false,
          true
        );
        const pngBuffer = Buffer.from(pixmap.asPNG());

        // Full-res WebP
        const fullRes = await sharp(pngBuffer)
          .resize({ width: FULL_RES_MAX_WIDTH, withoutEnlargement: true })
          .webp({ quality: FULL_RES_QUALITY })
          .toBuffer();

        const fullResMetadata = await sharp(fullRes).metadata();

        // Thumbnail WebP
        const thumbnail = await sharp(pngBuffer)
          .resize({ width: THUMBNAIL_WIDTH })
          .webp({ quality: THUMBNAIL_QUALITY })
          .toBuffer();

        // Upload full-res
        const fullPath = slidePageStoragePath(storagePath, pageNum);
        const { error: fullErr } = await supabase.storage
          .from("slide-decks")
          .upload(fullPath, fullRes, { contentType: "image/webp", upsert: true });
        if (fullErr) throw new Error(`Failed to upload page ${pageNum}: ${fullErr.message}`);

        // Upload thumbnail
        const thumbPath = slideThumbnailStoragePath(storagePath, pageNum);
        const { error: thumbErr } = await supabase.storage
          .from("slide-decks")
          .upload(thumbPath, thumbnail, { contentType: "image/webp", upsert: true });
        if (thumbErr) throw new Error(`Failed to upload thumbnail ${pageNum}: ${thumbErr.message}`);

        // Insert slide_pages row
        const { error: insertErr } = await supabase
          .from("slide_pages")
          .insert({
            deck_id: deckId,
            page_number: pageNum,
            storage_path: fullPath,
            thumbnail_storage_path: thumbPath,
            width: fullResMetadata.width!,
            height: fullResMetadata.height!,
          });
        if (insertErr) throw new Error(`Failed to insert page ${pageNum}: ${insertErr.message}`);
      }

      return numPages;
    });

    // Step 4: Mark as ready
    await step.run("set-ready", async () => {
      const { error } = await supabase
        .from("lesson_slide_decks")
        .update({
          processing_status: "ready",
          total_pages: totalPages,
        })
        .eq("id", deckId);
      if (error) throw new Error(`Failed to set ready: ${error.message}`);
    });

    return { deckId, totalPages, status: "ready" };
  }
);
```

### A.5 Inngest Client Update

Add to `src/lib/inngest/client.ts`:

```typescript
// Add to Events type:
"slides/process-deck": {
  data: {
    deckId: string;
    lessonId: string;
    cohortId: string;
    storagePath: string;
  };
};
```

### A.6 Register in Inngest Serve Route

Add to `src/app/api/inngest/route.ts`:

```typescript
import { processSlidesDeck } from "@/lib/inngest/functions/process-slides";

// Add to serve() functions array:
serve({
  client: inngest,
  functions: [
    transcribeSubmission,
    processSlidesDeck, // ← add
  ],
});
```

---

## Appendix B: 16B — Upload UI + API Route Details

### B.1 API Route: `src/app/api/lessons/[lessonId]/slides/route.ts`

```typescript
// src/app/api/lessons/[lessonId]/slides/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { inngest } from "@/lib/inngest/client";
import { checkCoursePermission } from "@/lib/permissions/check-permission";
import {
  MAX_PDF_FILE_SIZE,
  ALLOWED_PDF_MIME,
  slideDeckStoragePath,
} from "@/lib/slides/constants";

interface RouteParams {
  params: Promise<{ lessonId: string }>;
}

// POST: Upload PDF and create slide deck
// ⚠ DEVIATION: Accepts FormData with PDF file instead of JSON with storagePath.
// Server uploads to storage via service role (bypasses storage RLS).
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { lessonId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Get lesson → module → cohort → course chain for permission check
    const { data: lesson } = await supabase
      .from("lessons")
      .select("id, module_id, modules!inner(cohort_id, cohorts!inner(course_id))")
      .eq("id", lessonId)
      .single();

    if (!lesson) return NextResponse.json({ error: "Lesson not found" }, { status: 404 });

    const cohortId = (lesson.modules as any).cohort_id;
    const courseId = (lesson.modules as any).cohorts.course_id;

    // Permission check: SYLLABUS_MANAGE
    const hasPermission = await checkCoursePermission(user.id, courseId, "SYLLABUS_MANAGE");
    if (!hasPermission) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Parse FormData and validate PDF
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (file.type !== ALLOWED_PDF_MIME)
      return NextResponse.json({ error: "Only PDF files allowed" }, { status: 400 });
    if (file.size > MAX_PDF_FILE_SIZE)
      return NextResponse.json({ error: "File too large (max 25 MB)" }, { status: 400 });

    // Check for existing deck (one per lesson)
    const { data: existingDeck } = await supabase
      .from("lesson_slide_decks")
      .select("id")
      .eq("lesson_id", lessonId)
      .single();

    if (existingDeck) {
      return NextResponse.json(
        { error: "Slide deck already exists. Delete it first or use replace." },
        { status: 409 }
      );
    }

    // Upload PDF to storage via service role
    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const deckId = crypto.randomUUID();
    const fullStoragePath = slideDeckStoragePath(cohortId, lessonId, deckId);
    const pdfBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await adminClient.storage
      .from("slide-decks")
      .upload(`${fullStoragePath}/original.pdf`, pdfBuffer, {
        contentType: ALLOWED_PDF_MIME,
        upsert: false,
      });
    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

    // Create deck row
    const { error: insertError } = await supabase.from("lesson_slide_decks").insert({
      id: deckId,
      lesson_id: lessonId,
      original_file_name: file.name,
      storage_path: fullStoragePath,
      processing_status: "pending",
      created_by: user.id,
    });

    if (insertError) {
      // Clean up uploaded file on DB failure
      await adminClient.storage.from("slide-decks").remove([`${fullStoragePath}/original.pdf`]);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Dispatch Inngest event
    await inngest.send({
      name: "slides/process-deck",
      data: { deckId, lessonId, cohortId, storagePath: fullStoragePath },
    });

    return NextResponse.json({ deckId, storagePath: fullStoragePath, status: "pending" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// GET: Fetch deck metadata + pages
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { lessonId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: deck } = await supabase
    .from("lesson_slide_decks")
    .select(`
      id, lesson_id, original_file_name, total_pages,
      processing_status, processing_error, created_at, updated_at,
      slide_pages (id, page_number, width, height)
    `)
    .eq("lesson_id", lessonId)
    .single();

  if (!deck) return NextResponse.json({ deck: null });

  return NextResponse.json({ deck });
}

// DELETE: Remove slide deck + all storage files
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { lessonId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Permission check
  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, modules!inner(cohort_id, cohorts!inner(course_id))")
    .eq("id", lessonId)
    .single();

  if (!lesson) return NextResponse.json({ error: "Lesson not found" }, { status: 404 });

  const courseId = (lesson.modules as any).cohorts.course_id;
  const hasPermission = await checkCoursePermission(user.id, courseId, "SYLLABUS_MANAGE");
  if (!hasPermission) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Get deck to find storage path
  const { data: deck } = await supabase
    .from("lesson_slide_decks")
    .select("id, storage_path")
    .eq("lesson_id", lessonId)
    .single();

  if (!deck) return NextResponse.json({ error: "No slide deck found" }, { status: 404 });

  // Delete storage files (using admin client for service role access)
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // List and delete all files under the deck's storage path
  const { data: files } = await adminClient.storage
    .from("slide-decks")
    .list(deck.storage_path, { limit: 1000 });

  if (files && files.length > 0) {
    // Recursively list subdirectories (pages/, thumbnails/)
    for (const folder of ["", "pages", "thumbnails"]) {
      const folderPath = folder
        ? `${deck.storage_path}/${folder}`
        : deck.storage_path;
      const { data: folderFiles } = await adminClient.storage
        .from("slide-decks")
        .list(folderPath);

      if (folderFiles && folderFiles.length > 0) {
        const paths = folderFiles.map((f) => `${folderPath}/${f.name}`);
        await adminClient.storage.from("slide-decks").remove(paths);
      }
    }
  }

  // Delete DB row (cascade deletes slide_pages and slide_access_logs)
  const { error: deleteError } = await supabase
    .from("lesson_slide_decks")
    .delete()
    .eq("id", deck.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

### B.2 Lesson Editor Integration

Add to `src/app/(school-admin)/[schoolSlug]/admin/courses/[courseId]/cohorts/[cohortId]/lessons/[lessonId]/page.tsx`:

New section between video URL input and TiptapEditor:

```tsx
{/* Slides Section */}
<div className="space-y-3">
  <label className="block text-sm font-medium text-slate-700">
    Slides
  </label>
  <SlideUpload
    lessonId={lessonId}
    cohortId={cohortId}
    existingDeck={slideDeck}
    onDeckChange={(deck) => setSlideDeck(deck)}
  />
</div>
```

The lesson editor page fetches slide deck metadata on load:

```typescript
// In useEffect or data fetching:
const { data } = await fetch(`/api/lessons/${lessonId}/slides`).then(r => r.json());
setSlideDeck(data.deck);
```

### B.3 SlideUpload Component: `src/components/slides/slide-upload.tsx`

```tsx
// src/components/slides/slide-upload.tsx
// ⚠ DEVIATION: Removed TUS upload, uses FormData POST instead.
// The supabase_storage_admin role can't evaluate storage RLS policies
// that join through RLS-protected public tables. The API route now
// receives the PDF directly and uploads via service role.
"use client";

import { useState, useCallback } from "react";
import {
  MAX_PDF_FILE_SIZE,
  ALLOWED_PDF_MIME,
} from "@/lib/slides/constants";
import { SlideProcessingStatus } from "./slide-processing-status";

interface SlideDeck {
  id: string;
  original_file_name: string;
  total_pages: number | null;
  processing_status: "pending" | "processing" | "ready" | "failed";
  processing_error: string | null;
  slide_pages?: Array<{ page_number: number; width: number; height: number }>;
}

interface SlideUploadProps {
  lessonId: string;
  existingDeck: SlideDeck | null;
  onDeckChange: (deck: SlideDeck | null) => void;
}

export function SlideUpload({
  lessonId,
  existingDeck,
  onDeckChange,
}: SlideUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Client-side validation
      if (file.type !== ALLOWED_PDF_MIME) {
        setError("Only PDF files are allowed.");
        return;
      }
      if (file.size > MAX_PDF_FILE_SIZE) {
        setError("File size must be 25 MB or less.");
        return;
      }

      setError(null);
      setUploading(true);
      setUploadProgress(0);

      try {
        // FormData upload — server handles storage upload via service role
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(`/api/lessons/${lessonId}/slides`, {
          method: "POST",
          body: formData,
        });

        // Robust response handling (parse text first, then JSON)
        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(text || "Upload failed");
        }

        if (!response.ok) {
          throw new Error(data.error || "Failed to create slide deck");
        }

        const { deckId } = data;

        onDeckChange({
          id: deckId,
          original_file_name: file.name,
          total_pages: null,
          processing_status: "pending",
          processing_error: null,
        });

        // Start polling for processing status
        pollProcessingStatus(lessonId, onDeckChange);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
        // Reset file input
        e.target.value = "";
      }
    },
    [lessonId, onDeckChange]
  );

  const handleDelete = useCallback(async () => {
    if (!confirm("Remove slide deck? This cannot be undone.")) return;

    try {
      const response = await fetch(`/api/lessons/${lessonId}/slides`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete");
      onDeckChange(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }, [lessonId, onDeckChange]);

  // No deck — show upload button
  if (!existingDeck) {
    return (
      <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
        {error && (
          <p className="text-sm text-red-600 mb-2">{error}</p>
        )}
        <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-md text-sm font-medium text-slate-700 transition-colors">
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            disabled={uploading}
            className="hidden"
          />
          {uploading ? `Uploading... ${uploadProgress}%` : "Upload Slides (PDF)"}
        </label>
        <p className="text-xs text-slate-500 mt-2">PDF, max 25 MB</p>
      </div>
    );
  }

  // Deck exists — show status + preview
  return (
    <div className="border border-slate-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-700">
            {existingDeck.original_file_name}
          </p>
          {existingDeck.total_pages && (
            <p className="text-xs text-slate-500">
              {existingDeck.total_pages} slides
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="cursor-pointer text-xs text-blue-600 hover:text-blue-700">
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileSelect}
              disabled={uploading}
              className="hidden"
            />
            Replace
          </label>
          <button
            onClick={handleDelete}
            className="text-xs text-red-600 hover:text-red-700"
          >
            Remove
          </button>
        </div>
      </div>

      <SlideProcessingStatus status={existingDeck.processing_status} error={existingDeck.processing_error} />

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Thumbnail preview grid (instructor view, no watermark) */}
      {existingDeck.processing_status === "ready" && existingDeck.slide_pages && (
        <div className="grid grid-cols-4 gap-2">
          {existingDeck.slide_pages
            .sort((a, b) => a.page_number - b.page_number)
            .map((page) => (
              <div key={page.page_number} className="relative aspect-[4/3] bg-slate-100 rounded overflow-hidden">
                {/* Instructor preview uses direct storage access (no watermark) */}
                <img
                  src={`/api/slides/${existingDeck.id}/pages/${page.page_number}/image?type=thumbnail&preview=true`}
                  alt={`Slide ${page.page_number}`}
                  className="w-full h-full object-contain"
                />
                <span className="absolute bottom-1 right-1 text-[10px] bg-black/50 text-white px-1 rounded">
                  {page.page_number}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// Poll processing status every 3 seconds until ready/failed
function pollProcessingStatus(
  lessonId: string,
  onDeckChange: (deck: SlideDeck | null) => void
) {
  const interval = setInterval(async () => {
    try {
      const response = await fetch(`/api/lessons/${lessonId}/slides`);
      const { deck } = await response.json();
      if (!deck) {
        clearInterval(interval);
        return;
      }
      onDeckChange(deck);
      if (deck.processing_status === "ready" || deck.processing_status === "failed") {
        clearInterval(interval);
      }
    } catch {
      clearInterval(interval);
    }
  }, 3000);
}
```

### B.4 SlideProcessingStatus Component: `src/components/slides/slide-processing-status.tsx`

```tsx
// src/components/slides/slide-processing-status.tsx

interface Props {
  status: "pending" | "processing" | "ready" | "failed";
  error: string | null;
}

export function SlideProcessingStatus({ status, error }: Props) {
  switch (status) {
    case "pending":
      return (
        <div className="flex items-center gap-2 text-sm text-amber-600">
          <span className="animate-pulse">Queued for processing...</span>
        </div>
      );
    case "processing":
      return (
        <div className="flex items-center gap-2 text-sm text-blue-600">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Processing slides...</span>
        </div>
      );
    case "ready":
      return null; // No indicator needed when ready
    case "failed":
      return (
        <div className="text-sm text-red-600">
          Processing failed{error ? `: ${error}` : ""}. Try uploading again.
        </div>
      );
  }
}
```

---

## Appendix C: 16C — Student Viewer + DRM Details

### C.1 Image Proxy Route: `src/app/api/slides/[deckId]/pages/[pageNumber]/image/route.ts`

```typescript
// src/app/api/slides/[deckId]/pages/[pageNumber]/image/route.ts
// ⚠ DEVIATIONS from original plan:
// 1. Single joined query (page + deck) instead of 2 separate queries
// 2. In-memory profile cache (5 min TTL) to avoid DB lookup per image
// 3. Rate limiting skipped for instructor preview
// 4. Cache-Control: private instead of no-store
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { checkRateLimit, getSlideImageLimit } from "@/lib/rate-limit";
import { applyWatermark } from "@/lib/slides/watermark";

interface RouteParams {
  params: Promise<{ deckId: string; pageNumber: string }>;
}

// In-memory profile cache (per server instance, cleared on restart)
const profileCache = new Map<string, { name: string; expires: number }>();
const PROFILE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedProfile(userId: string): string | null {
  const cached = profileCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.name;
  if (cached) profileCache.delete(userId);
  return null;
}

function setCachedProfile(userId: string, name: string) {
  profileCache.set(userId, { name, expires: Date.now() + PROFILE_CACHE_TTL });
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { deckId, pageNumber: pageNumStr } = await params;
  const pageNumber = parseInt(pageNumStr, 10);
  if (isNaN(pageNumber) || pageNumber < 1) {
    return NextResponse.json({ error: "Invalid page number" }, { status: 400 });
  }

  const type = request.nextUrl.searchParams.get("type") || "full";
  const isPreview = request.nextUrl.searchParams.get("preview") === "true";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limiting (skip for instructor preview)
  if (!isPreview) {
    const rateLimitResult = await checkRateLimit(getSlideImageLimit(), user.id);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please wait before viewing more slides." },
        { status: 429 }
      );
    }
  }

  // Single query: fetch page + deck access in one RLS-verified call
  const { data: page } = await supabase
    .from("slide_pages")
    .select(
      "storage_path, thumbnail_storage_path, lesson_slide_decks!inner(id, processing_status)"
    )
    .eq("deck_id", deckId)
    .eq("page_number", pageNumber)
    .eq("lesson_slide_decks.processing_status", "ready")
    .single();

  if (!page) {
    return NextResponse.json(
      { error: "Slide not found or not accessible" },
      { status: 404 }
    );
  }

  // Determine which storage path to use
  const storagePath =
    type === "thumbnail" ? page.thumbnail_storage_path : page.storage_path;

  // Download image from storage (service role — bypasses storage RLS)
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: fileData, error: downloadError } = await adminClient.storage
    .from("slide-decks")
    .download(storagePath);

  if (downloadError || !fileData) {
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 500 });
  }

  let imageBuffer: Buffer = Buffer.from(await fileData.arrayBuffer()) as Buffer;

  // Apply watermark (skip for instructor preview)
  if (!isPreview) {
    // Check in-memory profile cache first (avoids DB round trip)
    let studentName: string | null = getCachedProfile(user.id);
    if (!studentName) {
      const { data: profile } = await adminClient
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      studentName = profile?.full_name || user.email || "Student";
      setCachedProfile(user.id, studentName as string);
    }

    const studentIdSuffix = user.id.slice(0, 4);

    imageBuffer = await applyWatermark({
      imageBuffer,
      studentName: studentName as string,
      studentIdSuffix,
      isThumbnail: type === "thumbnail",
    });

    // Log access (fire-and-forget, don't block response)
    adminClient
      .from("slide_access_logs")
      .insert({
        deck_id: deckId,
        page_number: pageNumber,
        user_id: user.id,
        ip_address:
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
        user_agent: request.headers.get("user-agent") || null,
      })
      .then(() => {}); // fire-and-forget
  }

  // Allow private browser caching — watermark with student name is baked in
  const cacheControl = isPreview
    ? "private, max-age=600" // instructor preview: 10 min
    : "private, max-age=300"; // student watermarked: 5 min

  return new NextResponse(new Uint8Array(imageBuffer), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
```

### C.2 Rate Limiter Addition

Add to `src/lib/rate-limit.ts`:

```typescript
// Add to rate limit constants:
SLIDE_IMAGE_LIMIT: {
  tokens: 120,
  window: "1 m",
},
```

### C.3 SlideGrid Component: `src/components/slides/slide-grid.tsx`

```tsx
// src/components/slides/slide-grid.tsx
// ⚠ DEVIATION: Uses signed URLs for thumbnails (direct CDN) instead of API proxy
"use client";

import { useState } from "react";
import { SlideSlideshow } from "./slide-slideshow";

interface SlidePageInfo {
  page_number: number;
  width: number;
  height: number;
  thumbnailUrl: string; // Server-generated signed URL
}

interface SlideGridProps {
  deckId: string;
  totalPages: number;
  pages: SlidePageInfo[];
}

export function SlideGrid({ deckId, totalPages, pages }: SlideGridProps) {
  const [slideshowStartPage, setSlideshowStartPage] = useState<number | null>(null);

  const sortedPages = [...pages].sort((a, b) => a.page_number - b.page_number);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Slides ({totalPages})
        </h3>
        <button
          onClick={() => setSlideshowStartPage(1)}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          View Slideshow
        </button>
      </div>

      {/* Responsive thumbnail grid — uses signed URLs (direct CDN, no proxy) */}
      <div
        className="slide-grid-container grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
        onContextMenu={(e) => e.preventDefault()}
      >
        {sortedPages.map((page) => (
          <button
            key={page.page_number}
            onClick={() => setSlideshowStartPage(page.page_number)}
            className="relative aspect-[4/3] bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden hover:ring-2 hover:ring-blue-400 transition-all cursor-pointer group"
          >
            <img
              src={page.thumbnailUrl}
              alt={`Slide ${page.page_number}`}
              className="w-full h-full object-contain pointer-events-none"
              draggable={false}
              loading="lazy"
            />
            <span className="absolute bottom-1 right-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
              {page.page_number}
            </span>
          </button>
        ))}
      </div>

      {/* Slideshow modal */}
      {slideshowStartPage !== null && (
        <SlideSlideshow
          deckId={deckId}
          totalPages={totalPages}
          startPage={slideshowStartPage}
          onClose={() => setSlideshowStartPage(null)}
        />
      )}
    </div>
  );
}
```

### C.4 SlideSlideshow Component: `src/components/slides/slide-slideshow.tsx`

> **⚠ DEVIATION:** Completely rewritten. No longer uses `SlideCanvas` component.
> Uses a single persistent `<canvas>` with in-memory image cache (`Map<number, HTMLImageElement>`).
> Preloads ALL images on mount (they're 7-47KB each). Navigation redraws from cache — instant, no spinner.
> See the actual implementation in `src/components/slides/slide-slideshow.tsx` for full code.

Key architectural changes from original plan:
- **No `SlideCanvas` dependency** — the slideshow manages its own canvas and image loading
- **Preload ALL pages** instead of ±1 adjacent (images are tiny WebP files)
- **Single persistent canvas** — redrawn on navigation via `drawImage()`, no component remount
- **In-memory `Map<number, HTMLImageElement>`** cache for instant switching
- **Spinner only for initial load** — once an image is cached, it displays instantly

### C.5 SlideCanvas Component: `src/components/slides/slide-canvas.tsx`

> **⚠ NOTE:** This component exists in the codebase but is no longer imported by the slideshow.
> The slideshow rewrite embeds its own canvas + image cache logic directly.
> `SlideCanvas` could be removed or kept as a utility for other contexts.

```tsx
// src/components/slides/slide-canvas.tsx
"use client";

import { useRef, useEffect, useState } from "react";

interface SlideCanvasProps {
  deckId: string;
  pageNumber: number;
  hidden?: boolean;
}

/**
 * Renders a slide image on a <canvas> element for DRM protection.
 * Canvas elements don't support right-click "Save Image As".
 * A transparent overlay div prevents direct interaction with the canvas.
 */
export function SlideCanvas({ deckId, pageNumber, hidden }: SlideCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      // Scale to fit container while maintaining aspect ratio
      const container = containerRef.current;
      if (!container) return;

      const maxWidth = container.clientWidth;
      const maxHeight = container.clientHeight;

      const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      setLoading(false);
    };

    img.onerror = () => {
      setLoading(false);
    };

    img.src = `/api/slides/${deckId}/pages/${pageNumber}/image?type=full`;
  }, [deckId, pageNumber]);

  if (hidden) {
    // Preload only — render offscreen
    return (
      <div className="hidden">
        <canvas ref={canvasRef} />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center select-none"
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <svg className="animate-spin h-8 w-8 text-white/50" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      )}

      <canvas
        ref={canvasRef}
        className="max-w-full max-h-full"
        style={{ userSelect: "none", WebkitUserSelect: "none" }}
      />

      {/* Transparent overlay to prevent canvas interaction */}
      <div
        className="absolute inset-0"
        style={{ pointerEvents: "auto" }}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}
```

### C.6 Lesson Viewer Integration

Add to `src/app/(student-course)/[schoolSlug]/[courseSlug]/[cohortId]/home/lessons/[lessonId]/page.tsx`:

Between the VideoPlayer section and TiptapViewer section:

```tsx
{/* Slides Section — only shown if deck exists and is ready */}
{slideDeck && slideDeck.processing_status === "ready" && slideDeck.slide_pages && (
  <div className="mt-6">
    <SlideGrid
      deckId={slideDeck.id}
      totalPages={slideDeck.total_pages}
      pages={slideDeck.slide_pages}
    />
  </div>
)}
```

Fetch slide deck data in the server component:

```typescript
// Fetch slide deck for this lesson
const { data: slideDeck } = await supabase
  .from("lesson_slide_decks")
  .select(`
    id, total_pages, processing_status,
    slide_pages (page_number, width, height)
  `)
  .eq("lesson_id", lessonId)
  .eq("processing_status", "ready")
  .single();
```

### C.7 Print Blocking CSS

Add to global styles or a slide-specific stylesheet:

```css
/* Slide DRM: Print blocking */
@media print {
  .slide-grid-container,
  .slide-slideshow-modal {
    display: none !important;
  }

  .slide-print-notice {
    display: block !important;
  }
}

.slide-print-notice {
  display: none;
}
```

### C.8 DRM Protection Summary

| Layer | Mechanism | Bypassed By | Deterrent Level |
|-------|-----------|-------------|-----------------|
| **API Proxy** | Session-validated image serving, no direct URLs | N/A (server-enforced) | Absolute |
| **Visible Watermark** | Student name + ID baked into image (server-side Sharp) | Cannot remove without image editing | Strong |
| **Canvas Rendering** | `<canvas>` instead of `<img>`, no "Save Image As" | DevTools → canvas → `toDataURL()` (still watermarked) | Moderate |
| **Right-Click Block** | `oncontextmenu` prevented on slide containers | DevTools, keyboard shortcuts | Light |
| **Print Block** | `@media print { display: none }` | DevTools → remove CSS rule | Light |
| **Rate Limiting** | 120 requests/min per user | Multiple accounts | Moderate |
| **Access Logging** | Every image request logged with user + IP + timestamp | N/A (server-enforced) | Investigative |

**Key insight:** The visible watermark is the strongest practical deterrent. Even if a student captures slides via screenshot or screen recording, the watermark traces the leak back to them. All other layers add friction but are bypassable by determined technical users.
