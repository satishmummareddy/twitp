# CCC (Crossing Career Chasms) - Product Requirements Document

> **Version**: 3.0
> **Date**: March 2026
> **Status**: Retrospective (created after implementation, following revised template)

---

## 1. Product Overview

### 1.1 Problem Statement

Career changers and professionals seeking skill upgrades need structured learning with personalized feedback. Traditional online courses offer only passive content consumption—videos and quizzes—without meaningful instructor interaction. Instructors want to provide individualized feedback on student work but lack the time to review every submission in detail (typically 10+ minutes per response).

### 1.2 Solution Summary

CCC is a cohort-based education platform with AI-assisted feedback. Schools create courses with modules, lessons, and assignments. Students submit responses via text, audio recording, or video recording. Instructors write evaluation prompts, AI generates draft feedback (using transcripts for media submissions), instructors review/edit, then publish to students. The platform also provides AI-powered semantic search across course content with video deep-linking. Lessons can include slide decks—instructors upload PDFs which are processed server-side into watermarked images served via an API proxy with DRM protections. This creates a scalable personalized feedback loop—reducing instructor time per feedback from 10+ minutes to under 2 minutes while maintaining quality.

### 1.3 Success Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Assignment completion rate | 80% | Submissions / enrolled students |
| Feedback turnaround | < 48 hours | Submission → published timestamp |
| Instructor time per feedback | < 2 minutes | Time tracking in review UI |
| Student satisfaction | > 4.0/5.0 | Post-course survey |
| Feedback quality rating | > 4.0/5.0 | Student rating of feedback helpfulness |

### 1.4 Scope

**In Scope (MVP):**
- Platform admin creates schools and assigns school admins
- School admins create courses and assign staff
- Course staff build syllabi (modules, lessons, assignments)
- Students enroll, view content, submit assignments
- AI generates feedback drafts from instructor prompts
- Instructors review, edit, and publish feedback
- Release date scheduling for content

**In Scope (Post-MVP, Implemented):**
- Vector Search / Q&A — AI-powered semantic search across course content with video deep-linking (Phase 13)
- Audio/Video Assignments — browser-based recording, Supabase Storage, auto-transcription via Whisper, AI feedback on transcripts (Phase 14)
- Lesson Slides — PDF upload, server-side processing (mupdf + Sharp), watermarked image serving via API proxy, responsive grid + slideshow viewer with DRM protections (Phase 16)

**Out of Scope (Future):**
- Payments / Stripe integration
- Email/SMS notifications
- Calendar with Google Calendar sync
- File upload submissions (PDF, images)
- Public marketing pages with CMS

---

## 2. Tech Stack

| Layer | Technology | Version | Rationale |
|-------|------------|---------|-----------|
| Frontend | Next.js (React) | 16.x | App Router, Server Components, great DX |
| Backend | Next.js API Routes | - | Unified codebase, no separate server |
| Database | Supabase (PostgreSQL) | - | Hosted, RLS for security, real-time capable |
| Auth | Supabase Auth | - | Google OAuth + Magic Link, session management |
| Storage | Supabase Storage | - | File uploads (future), integrated with auth |
| AI | Anthropic Claude | claude-sonnet-4-5-20250929 | Best quality for nuanced feedback |
| Hosting | Vercel | - | Native Next.js support, edge functions |
| Rich Text | Tiptap | 3.x | Extensible, good DX, ProseMirror-based |
| Styling | Tailwind CSS | 4.x | Utility-first, fast iteration |
| Embeddings | OpenAI API | text-embedding-3-small | Vector search (1536 dims), cheapest model |
| Vector DB | pgvector (Supabase) | - | HNSW index, native PostgreSQL extension |
| Background Jobs | Inngest | - | Event-driven, serverless-friendly |
| Transcription | OpenAI Whisper | whisper-1 | Audio/video → text for AI feedback pipeline |
| Media Upload | TUS Protocol | - | Resumable uploads for large media files |
| PDF Rendering | mupdf | ^1.27.0 | Server-side PDF page extraction to pixel buffers (native bindings) |
| Image Processing | Sharp | ^0.34.5 | Resize, WebP conversion, SVG watermark compositing |

### 2.1 Technical Constraints

| Constraint | Impact | Mitigation |
|------------|--------|------------|
| Next.js Turbopack env loading | `.env.local` may not load in API routes | Fallback file-based env reading |
| AI model deprecation | Models deprecated periodically | Store model name in DB, validate at runtime |
| Supabase RLS with UPDATE | Complex UPDATE conditions cause 403/500 | Use INSERT-only versioning for submissions |
| React 19 strict typing | `unknown` type can't be truthy-checked | Create type guard helpers (`getHtml()`, etc.) |
| SECURITY DEFINER recursion | Permission functions calling RLS tables loop | `SET search_path = public` on all functions |
| Tailwind CSS v4 | New config syntax (CSS-based, not JS) | Use `@tailwindcss/postcss` plugin |
| Supabase SSR hydration | `getSession()` race conditions cause pages to hang | Use `getUser()` + `onAuthStateChange` as source of truth |
| React Strict Mode timing | Pages work with dev tools open but not without | Async race conditions; use singleton Supabase client |
| PostgreSQL trigger schema | Triggers fail with "relation does not exist" | Always use `public.` schema prefix in trigger functions |
| Next.js env exposure | `next.config.ts` `env{}` block inlines into client bundle | Never put secrets in `env{}` - access via `process.env` server-only |
| XSS via dangerouslySetInnerHTML | Rendering untrusted HTML can execute scripts | Always sanitize with DOMPurify before rendering |
| RLS FOR ALL needs WITH CHECK | INSERT blocked even for authorized users | Always include `WITH CHECK` clause on `FOR ALL` policies |
| Bootstrap operations | New users need records they can't create via RLS | Use admin client (service role) in auth callbacks |
| pgvector IVFFlat on small data | IVFFlat `lists=100` on 84 rows → fresh queries return 0 results | Use HNSW index (works at any scale), or no index for <1k rows |
| RLS blocks employee table reads | User-scoped client can't read `platform_employees` in permission checks | Use admin client for permission queries, authenticate user separately |
| CSRF www/non-www mismatch | `NEXT_PUBLIC_APP_URL` set without `www` but users access via `www` | Auto-allow both www and non-www variants in CSRF origin validation |
| MediaRecorder MIME types | Different browsers support different codecs (VP9/VP8/H.264) | Probe with `MediaRecorder.isTypeSupported()`, cascade through candidates |
| Independent media streams | Single combined `getUserMedia({audio, video})` makes toggles interdependent | Separate `getUserMedia()` calls per device (audio-only, video-only) |
| Web Audio API feedback loop | Connecting mic to AnalyserNode AND destination plays mic through speakers | Connect `MediaStreamSource → AnalyserNode` only, never to `audioContext.destination` |
| Canvas TypeScript strict mode | `Uint8Array<ArrayBufferLike>` not assignable to `Uint8Array<ArrayBuffer>` | Explicit typing: `useRef<Uint8Array<ArrayBuffer> \| null>(null)` |
| TUS upload endpoint mismatch | Supabase Storage TUS endpoint requires specific path format | Use `/storage/v1/upload/resumable` with proper authorization headers |
| `supabase_storage_admin` can't query RLS tables | Storage RLS policies can't join to `lessons`/`modules`/`cohorts` (different role) | All slide storage operations via API route using service role key |
| pdfjs-dist + node-canvas incompatibility | `pdfjs-dist` requires `node-canvas` for server rendering; canvas has native build issues in serverless | Use `mupdf` native bindings instead (single package, no canvas dependency) |

### 2.2 Key Technical Decisions

| Decision | Choice | Alternatives Considered | Why This Choice |
|----------|--------|------------------------|-----------------|
| Submission updates | INSERT new version | UPDATE existing row | Avoids RLS conflicts, preserves history |
| Feedback storage | Separate table | Column on submissions | Cleaner workflow states, easier queries |
| Content format | JSONB `{html: string}` | Plain TEXT, Markdown | Flexible, supports rich text, future formats |
| Permission model | Granular permissions | Role-based only | Finer control (TF can grade but not edit syllabus) |
| Vector search index | HNSW | IVFFlat, no index | Works at any data size; Postgres ignores it when seq scan is faster |
| Embedding model | OpenAI text-embedding-3-small | text-embedding-3-large, ada-002 | Cheapest, 1536 dims sufficient for course content |
| Auto-index trigger | Fire-and-forget fetch on save | DB trigger, background queue | Simple, no infrastructure; manual re-index as fallback |
| Permission queries | Admin client (bypasses RLS) | User-scoped client | RLS on employee tables blocks user-scoped reads for permission checks |
| Media stream architecture | Independent audio/video streams | Single combined stream | Independent toggles, separate permissions, simpler state machine |
| Recording format | Audio-only file (even with camera preview) | Combined A/V container | Smaller files, faster upload; camera is display-only for preview |
| Media upload protocol | TUS resumable upload | Direct multipart POST | Handles large files, survives network interruptions |
| Transcription service | OpenAI Whisper (async via Inngest) | Real-time transcription | Simpler, cheaper; async is fine since feedback isn't real-time |
| Audio visualization | Canvas + requestAnimationFrame | React state updates | Zero React re-renders, smooth 60fps animation |
| Assignment type model | Single-select (exactly one type) | Multi-select (checkboxes) | Simpler UX — each assignment has one clear submission type |
| PDF rendering engine | mupdf (native bindings) | pdfjs-dist + node-canvas | pdfjs-dist requires node-canvas which has native build issues in serverless; mupdf is a single native package |
| Slide upload mechanism | FormData POST + service role | TUS resumable upload | `supabase_storage_admin` role can't query RLS-protected public tables; service role bypasses this |
| Slide image serving | API proxy with server-side watermark | Direct signed URLs from storage | Signed URLs expose unwatermarked originals; proxy applies per-student watermark + rate limiting |
| Slideshow preloading | Preload all images on mount | Lazy load / priority queue | Slide images are small (7-47KB each); preload-all gives instant navigation with rare initial spinner |
| Watermark density | Minimal tiling (spacingX=1000, spacingY=400) | Dense tiling (spacingX=400, spacingY=150) | Fewer watermarks look cleaner while still deterring screenshots; ~80% reduction from original density |

---

## 2.3 Authentication

### Methods

| Method | Provider | Use Case |
|--------|----------|----------|
| Google OAuth | Supabase Auth | Primary sign-in method |
| Magic Link | Supabase Auth | Email-based passwordless login |

### Access Control

Only **pre-approved emails** can create accounts:

1. School admin uploads CSV of approved emails
2. User attempts to sign in with Google or Magic Link
3. System checks if email exists in `approved_emails` table
4. If approved: account created, auto-enrolled in designated cohort
5. If not approved: sign-in blocked with error message

### Future: Payment-Based Access

When payments are implemented:
- Paying customers are auto-added to `approved_emails`
- Payment confirmation triggers account creation
- Auto-enrollment in purchased cohort

---

## 3. User Roles

*High-level definition of WHO the users are. Detailed permissions in Section 6.*

### 3.1 Role Definitions

| Role | Description | Scope |
|------|-------------|-------|
| **Super Admin** | Platform owner, creates schools | All schools, all features |
| **Support** | Platform support staff | View/assist (limited, future) |
| **School Admin** | Runs a school, manages courses | All courses in their school |
| **Instructor** | Leads a course, creates content | Assigned courses |
| **Teaching Fellow** | Assists with grading | Assigned courses (feedback only) |
| **Course Coordinator** | Handles admin tasks | Assigned courses (no feedback) |
| **Student** | Takes courses, submits work | Enrolled cohorts |

### 3.2 Role Hierarchy

```
Platform Level
└── Super Admin
    └── Support (future)

School Level
└── School Admin
    └── Course Level
        ├── Instructor
        ├── Teaching Fellow
        └── Course Coordinator

Student Level
└── Student (via enrollment)
```

### 3.3 Role Assignment

| Role | Assigned By | Assignment Method |
|------|-------------|-------------------|
| Super Admin | System/Manual DB | Initial setup |
| School Admin | Super Admin | Platform admin UI |
| Instructor | School Admin | Course settings |
| Teaching Fellow | School Admin | Course settings |
| Course Coordinator | School Admin | Course settings |
| Student | Auto or Staff | CSV upload or approved_emails trigger |

---

## 4. Features & User Flows

### 4.1 Feature List (MVP)

| Feature | Description | Primary Role(s) |
|---------|-------------|-----------------|
| Platform Management | Create schools, assign school admins | Super Admin |
| School Management | School settings, employee management | School Admin |
| Course Management | Create/edit/archive courses | School Admin |
| Staff Assignment | Assign instructors, TFs, coordinators to courses | School Admin |
| Cohort Management | Create cohorts, set dates, clone existing | School Admin |
| Student Management | CSV upload, enrollment management | Instructor, Coordinator |
| Syllabus Builder | Modules, lessons, assignments | Instructor, Coordinator |
| Content Authoring | Rich text lessons, video embeds | Instructor, Coordinator |
| Assignment Creation | Questions, templates, feedback prompts | Instructor |
| Release Scheduling | Set release dates for content | Instructor, Coordinator |
| Student Dashboard | View enrolled courses, navigate syllabus | Student |
| Assignment Submission | Write and submit responses | Student |
| AI Feedback Generation | Generate draft feedback from prompts | Instructor, TF |
| Feedback Review | Edit AI drafts, publish to students | Instructor, TF |
| Feedback Viewing | See published feedback on submissions | Student |
| Video Embeds | YouTube, Vimeo, Loom support | Instructor, Coordinator |
| Submission History | Version accordion with feedback status | Student |
| Vector Search / Q&A | Semantic search across course content with AI answers | Student, Staff |
| Video Transcript Import | Upload Descript transcripts for video deep-linking | Instructor, Coordinator |
| Audio Assignments | Mic-only recording with browser MediaRecorder | Student |
| Audio+Camera Assignments | Audio recording with camera preview (preview only, audio file stored) | Student |
| Audio/Video Submission Config | Configure assignment type (text/audio/audio_camera/video) and max duration | Instructor |
| Media Transcription | Auto-transcription via OpenAI Whisper for AI feedback | System |
| Audio Frequency Visualizer | Real-time frequency bars during ready state and recording | Student |
| Lesson Slides | PDF upload, background processing (mupdf → WebP), responsive grid + full-screen slideshow | Instructor (upload), Student (view) |
| Slide DRM Protections | Server-side watermarking, canvas rendering, API proxy, rate limiting, access logging | System |
| Video Focus View & Chapters | Expandable in-place video (CSS fixed toggle), chapter navigation sidebar, postMessage play/pause, breadcrumb header | Student |

#### Video Embeds

Support for embedding from:
- **YouTube** - Standard video embeds (`enablejsapi=1` for postMessage play/pause)
- **Vimeo** - Professional video hosting (postMessage play/pause)
- **Loom** - Screen recordings and tutorials (no postMessage API)

Instructor pastes URL, system extracts and renders appropriate embed.

#### Submission History UI

Collapsible accordion showing all submission versions with:
- Version number and timestamp
- Late submission indicator
- Feedback status (pending, reviewed, published)
- Expandable content showing response and published feedback

#### Soft Deadlines

- Assignments can have optional due date
- After deadline: visual indicator on submission (`is_late = true`)
- Submissions still accepted (soft deadline, not hard)

#### Release Dates

- Lessons and assignments can have optional release date
- Before release: lock icon shown, content not accessible
- After release: normal access
- No release date = available immediately (when published)

### 4.2 User Flows

#### Flow: School Admin Creates Course and First Cohort

**Actor:** School Admin
**Goal:** Set up a new course ready for content creation

```
1. Login, navigate to school admin dashboard
2. Click "Create Course"
3. Enter course name, description, slug
4. Save course (created as unpublished)
5. Click into course settings
6. Add course employees (instructors, coordinators)
7. Click "Create Cohort"
8. Enter cohort name, start/end dates
9. Cohort created with empty syllabus
```

**Implied pages:** School admin dashboard, course list, course settings, cohort creation
**Implied operations:** course_create, course_update, employee_assign, cohort_create

---

#### Flow: Instructor Builds Syllabus

**Actor:** Instructor
**Goal:** Create course content structure

```
1. Navigate to course → cohort → syllabus editor
2. Click "Add Module", enter title
3. Within module, click "Add Lesson"
4. Enter lesson title, write content in rich text editor
5. Optionally add video URL (YouTube/Vimeo/Loom)
6. Set release date (optional)
7. Mark as published when ready
8. Click "Add Assignment" in module
9. Enter title, description, question text
10. Create response template with section headings
11. Write feedback prompt for AI
12. Select AI model
13. Set due date and release date
14. Mark as published
```

**Implied pages:** Syllabus editor, lesson editor, assignment editor
**Implied operations:** module_create/update/delete, lesson_create/update/delete, assignment_create/update/delete

---

#### Flow: Student Completes Assignment

**Actor:** Student
**Goal:** Submit work and receive feedback

```
1. Login, land on My Learning page
2. Click enrolled course
3. Navigate syllabus to assignment (if released)
4. Read assignment description and question
5. See response template in editor
6. Write response, editing template sections
7. Click Submit
8. See confirmation with version number
9. (Later) Receive notification that feedback is published
10. View published feedback
11. Optionally submit new version
```

**Implied pages:** My Learning, course home/syllabus, assignment page
**Implied operations:** submission_create, submission_read, feedback_read (own, published)

---

#### Flow: Instructor Reviews and Publishes Feedback

**Actor:** Instructor or Teaching Fellow
**Goal:** Review AI feedback and publish to student

```
1. Navigate to course admin → submissions
2. Select assignment from dropdown
3. See list of submissions with status
4. Click submission to review
5. See student response and AI-generated feedback
6. Edit feedback if needed
7. Click "Publish" (or select multiple and "Batch Publish")
8. Student can now see feedback
```

**Implied pages:** Submissions list, submission detail/review
**Implied operations:** feedback_read, feedback_update, feedback_publish

---

#### Flow: Student Uses Vector Search

**Actor:** Student
**Goal:** Find answers to questions about course content

```
1. Navigate to course syllabus page
2. See search bar at top: "Ask a question about this course..."
3. Type natural language question (e.g., "What is a career Northstar?")
4. Press Enter
5. Results panel appears inline below search bar:
   a. AI-generated answer synthesized from relevant content
   b. Video sources (accordion) with deep-links to specific timestamps
   c. Text sources with links to lessons/assignments
6. Click video source → navigates to lesson, video auto-seeks to timestamp
7. Click text source → navigates to lesson or assignment
8. X button to dismiss results
```

**Implied pages:** Course syllabus (search integrated)
**Implied operations:** search_query, embedding_read

---

#### Flow: Student Submits Audio Assignment

**Actor:** Student
**Goal:** Record and submit an audio response

```
1. Navigate to audio assignment page
2. See dark preview area (Google Meet style) with mic toggle (+ camera toggle for audio_camera type)
3. Click mic toggle → browser requests microphone permission
4. Mic turns on: green frequency bars + breathing "00:00 / max" timer shown
5. Optionally click camera toggle (audio_camera only) → camera preview appears independently
6. Click "Start Recording" → timer counts up, red frequency bars react to voice
7. Recording auto-stops at max duration, or click "Stop Recording"
8. Audio playback preview appears — can listen back
9. Click "Submit Recording" → TUS upload to Supabase Storage
10. Submission created → transcription triggered async via Inngest
11. Submission appears in history with audio player
12. Transcript appears when transcription completes
```

**Implied pages:** Assignment page (media recorder integrated)
**Implied operations:** media_upload, submission_create, transcription_trigger

---

#### Flow: Instructor Configures Audio/Video Assignment

**Actor:** Instructor
**Goal:** Set up an assignment that accepts audio or video submissions

```
1. Navigate to syllabus editor → create or edit assignment
2. In Content tab, select "Submission Type" radio:
   - Text (default), Audio, Audio+Camera Preview, Video
3. If non-text: "Max Recording Duration" input appears (default 05:00, format MM:SS)
4. Response template field is hidden for non-text types
5. Write feedback prompt as usual (AI will use transcript for media submissions)
6. Save assignment
```

**Implied pages:** Assignment editor (Content tab)
**Implied operations:** assignment_create, assignment_update

---

#### Flow: Instructor Uploads Lesson Slides

**Actor:** Instructor
**Goal:** Add a slide deck to a lesson for students to view

```
1. Navigate to syllabus editor → select lesson to edit
2. In lesson editor, see "Slides" section below video URL
3. Click "Upload Slides" button
4. Select PDF file (≤25 MB, .pdf only)
5. File uploaded via FormData POST → server uploads to Supabase Storage via service role
6. See "Processing…" spinner with status indicator
7. Inngest background job: download PDF → render pages via mupdf → convert to WebP → generate thumbnails → insert DB rows → status = ready
8. Status polls every 3 seconds until ready
9. Thumbnail grid appears showing all slide pages
10. To replace: click "Remove Slides", confirm, then upload new PDF
```

**Implied pages:** Lesson editor (SlideUpload component integrated)
**Implied operations:** slide_deck_create, slide_deck_delete, inngest_process_slides

---

#### Flow: Student Views Lesson Slides

**Actor:** Student
**Goal:** View lesson slide deck in grid or full-screen slideshow

```
1. Navigate to lesson page (must be published + released)
2. Below video and text content, see "Slides" section with responsive thumbnail grid
3. Thumbnails loaded via signed URLs from server component (CDN-delivered)
4. Click any thumbnail → full-screen slideshow opens at that page
5. Navigate with arrow keys, swipe, or prev/next buttons
6. All images preloaded on mount (7-47KB each) for instant navigation
7. Images served through API proxy: server applies per-student watermark (name + ID suffix)
8. Watermarked images cached in browser (private, max-age=300s thumbnails, 600s full-res)
9. Slide counter shows "3 / 24" at bottom
10. Press Escape or click X to close slideshow
11. Right-click and print disabled; canvas rendering prevents "Save Image As"
```

**Implied pages:** Lesson page (SlideGrid + SlideSlideshow components)
**Implied operations:** slide_image_read (rate-limited 120/min), access_log_insert

---

#### Flow: Student Views Video in Focus View

**Actor:** Student
**Goal:** Watch lesson video in an immersive full-browser Focus View with chapter navigation

```
1. Navigate to lesson page with a video
2. Video card shows inline embed with chapters sidebar (left) and "Focus View" button in header
3. Click video area or "Focus View" button → card expands in-place to full-browser (fixed inset-0 z-50 bg-page)
4. Breadcrumb header (Course / Module / Lesson) + close button (X) appear
5. Chapter sidebar on left, video fills remaining space
6. Click a chapter → video reloads at that timestamp with autoplay
7. Video auto-plays on expand (postMessage play command)
8. Press Escape or click X → video pauses (postMessage pause), card collapses to inline
9. Body scroll restored, same iframe preserved (no reload, timestamp maintained)
```

**Implied pages:** Lesson page (single expandable VideoSection component)
**Implied operations:** None (video served by third-party embed, controlled via postMessage)

---

### 4.3 Product Backlog

| # | Priority | Feature | Description | Dependencies |
|---|----------|---------|-------------|--------------|
| 1 | P1 | Email Support | Welcome emails, event reminders, feedback notifications | Email service (Resend/SendGrid) |
| 2 | P1 | SMS Support | SMS notifications for events, deadlines, feedback | SMS service (Twilio) |
| 3 | P1 | Evals Tab | Prompt testing interface - test feedback prompts with sample submissions | None |
| 4 | P1 | Video Slides Navigation | Navigate videos by slide/chapter markers, jump to sections | Video processing |
| 5 | ~~P1~~ ✅ | Vector Search / Q&A | AI-powered semantic search across course content, video deep-linking | ~~Embeddings, vector DB~~ Implemented (Phase 13) |
| 6 | ~~P1~~ ✅ | Audio/Video Assignments | Students record audio/video in browser, auto-transcribed via Whisper | ~~Media upload/storage~~ Implemented (Phase 14) |
| 7 | ~~P1~~ ✅ | Lesson Slides | PDF upload, server-side processing, watermarked viewer with DRM | ~~Inngest, storage~~ Implemented (Phase 16) |
| 8 | P2 | Calendar | Event management (live sessions, office hours, deadlines), Google Calendar integration | Calendar API |
| 9 | P2 | Learn/Practice/Test Modes | Different learning modes - passive consumption vs active practice vs assessment | Mode design |
| 10 | P2 | Student-Created Assignments | Students create their own practice problems, peer learning | None |
| 11 | P2 | Public Pages | Platform home, school page, course marketing page; later: full CMS editing | CMS design |
| 12 | P2 | Payments / Checkout | Stripe integration, auto-approve paying students | Stripe account |
| 13 | P2 | Student Support Flows | Student-facing support features (help requests, FAQs, contact) | None |
| 14 | P3 | Lightning Lessons | Free live workshops with gated replay | Live streaming |
| 15 | P3 | School Support Flows | School admin support features (admin help, onboarding, documentation) | None |
| 16 | P3 | Image Paste/Drop in Editor | Paste or drag-drop images into Tiptap, auto-upload to Supabase Storage | Storage config |
| 17 | P3 | File Upload Submissions | PDF, images, etc. for assignment submissions | Storage config |

**Priority Key:** P1 = Next after MVP | P2 = Near-term | P3 = Future

---

## 5. Page Structure & URLs

### 5.1 URL Schema

| Pattern | Page | Access Level |
|---------|------|--------------|
| `/` | Platform home | Public |
| `/login` | Login | Public |
| `/[school]` | School page | Public |
| `/[school]/[course]` | Course marketing | Public |
| `/me/profile` | User profile | Authenticated |
| `/me/mylearning` | Enrolled courses | Authenticated |
| `/me/mymanagedcourses` | Teaching dashboard | Course staff |
| `/[school]/[course]/[cohort]/home` | Course syllabus | Enrolled student |
| `/[school]/[course]/[cohort]/home/[module]/[lesson]` | Lesson view | Enrolled student |
| `/[school]/[course]/[cohort]/home/[module]/[assignment]` | Assignment view | Enrolled student |
| `/[school]/admin` | School admin dashboard | School admin |
| `/[school]/admin/courses` | Course list | School admin |
| `/[school]/admin/courses/[courseId]` | Course settings | School admin |
| `/[school]/[course]/admin/syllabus/[cohort]` | Syllabus editor | Syllabus managers |
| `/[school]/[course]/admin/students/[cohort]` | Student management | Student managers |
| `/[school]/[course]/admin/submissions/[cohort]/[assignment]` | Submissions list | Feedback managers |
| `/admin` | Platform admin | Super admin |

### 5.2 Page Inventory

| Page | URL | Purpose | Data Needed | Primary Actions |
|------|-----|---------|-------------|-----------------|
| My Learning | `/me/mylearning` | View enrolled courses | enrollments, courses, schools | Navigate to course |
| Course Syllabus | `/[school]/[course]/[cohort]/home` | Browse content | modules, lessons, assignments | Navigate to content |
| Assignment | `.../[assignment]` | View & submit | assignment, submissions, feedback | Submit response |
| Syllabus Editor | `.../admin/syllabus/[cohort]` | Build content | modules, lessons, assignments | CRUD content |
| Submissions | `.../admin/submissions/...` | Review work | submissions, feedback, users | Generate/publish feedback |
| School Admin | `/[school]/admin` | Manage school | school, employees, courses | Manage settings |
| Platform Admin | `/admin` | Manage platform | schools, platform_employees | Create schools |

### 5.3 Navigation Structure

```
Header (all pages)
├── Logo → /
├── (empty for public)
└── User Menu (authenticated)
    ├── Profile → /me/profile
    ├── Learn → /me/mylearning
    ├── ─────────────────
    ├── Teach → /me/mymanagedcourses (if course staff)
    ├── ─────────────────
    ├── [School A] → /school-a/admin (if school admin)
    ├── [School B] → /school-b/admin (if school admin)
    ├── ─────────────────
    ├── Admin → /admin (if super admin)
    ├── ─────────────────
    └── Sign out
```

### 5.4 Reserved Slugs

| Slug | Reason |
|------|--------|
| `admin` | Conflicts with `/[school]/admin` route |
| `api` | Reserved for API routes |
| `auth` | Reserved for auth callback |
| `login` | Login page |
| `me` | User dashboard routes |
| `home` | Potential future use |

**Enforcement:** Client-side validation at school/course creation. Consider adding database-level trigger for defense in depth.

### 5.5 Responsive Design

The platform supports all screen sizes from 320px (mobile) to desktop.

#### Sidebar Behavior

| Breakpoint | Sidebar State |
|------------|---------------|
| Mobile (< 1024px) | Auto-collapsed to 64px (icons only) |
| Desktop (≥ 1024px) | Expanded to 256px (icons + labels) |

- **Toggle button:** Menu icon (collapsed) → ChevronLeft icon (expanded)
- **Collapsed state:** Shows icons only, tooltip on hover reveals label
- **Touch targets:** Minimum 44px height on all interactive elements

#### Responsive Typography

| Element | Mobile | Desktop |
|---------|--------|---------|
| Page headings | `text-xl` (20px) | `text-2xl` (24px) |
| Hero headings | `text-2xl` (24px) | `text-3xl` (30px) |
| Table headers | `text-sm` (14px) | `text-sm` (14px) |
| Primary content | `text-sm` (14px) | `text-sm` (14px) |
| Secondary content | `text-xs` (12px) | `text-xs` (12px) |

#### Responsive Tables

- Wrapper with `overflow-x-auto` for horizontal scrolling on mobile
- Minimum table width: 600px (prevents column squishing)
- Cell padding: `px-3` (mobile) → `px-6` (desktop)

#### Responsive Padding

| Area | Mobile | Desktop |
|------|--------|---------|
| Main content | `p-4` | `p-6` |
| Table cells | `px-3` | `px-6` |

#### Admin Syllabus Cards (Mobile Layout)

**Modules** use 3-row layout on mobile:
- Row 1: Expand chevron + drag handle + "Module X" badge
- Row 2: Module title (aligned with badge via `pl-12`)
- Row 3: Action buttons (icons only) - publish, edit, delete

**Lessons/Assignments** use 2-row layout on mobile:
- Row 1: Drag handle + type icon + title (`line-clamp-2`)
- Row 2: Action buttons (aligned with title via `pl-10`)
- Assignment button order: publish, edit, delete, submissions

**Action Button Styling:**
- Icons only (no text labels on mobile)
- Large tap targets: `h-8 w-10` (40×32px)
- Color-coded: green=publish, gray=edit, red=delete, blue=submissions
- Desktop: Single row with inline icon buttons (unchanged)

### 5.6 Shared Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `CourseCard` | `src/components/shared/course-card.tsx` | Unified course card for Teach page and School Admin |
| `ResponsiveTable` | `src/components/ui/responsive-table.tsx` | Table wrapper with horizontal scroll |

**CourseCard Features:**
- Icon + Name + Badge (role or status)
- Optional description
- Stats (cohort count, optional student count)
- Hover state with "View Course" indicator
- Archive indicator (orange badge when archived)

---

## 6. Permissions & Security

*Now we can define detailed permissions: Roles (§3) × Features (§4) × Pages (§5)*

### 6.1 Permission Types

#### Platform-Level Permissions

| Permission Key | Description | Operations Enabled |
|----------------|-------------|-------------------|
| `schools_create` | Create new schools | POST /api/schools |
| `schools_update` | Edit school details | PATCH /api/schools/:id |
| `schools_delete` | Archive/delete schools | DELETE /api/schools/:id |
| `school_staff_manage` | Add/remove school admins | School employees CRUD |

#### School-Level Permissions

| Permission Key | Description | Operations Enabled |
|----------------|-------------|-------------------|
| `courses_manage` | Create/edit/archive courses | Course CRUD within school |
| `cohorts_manage` | Create/edit/delete cohorts | Cohort CRUD, cloning |

#### Course-Level Permissions

| Permission Key | Description | Operations Enabled |
|----------------|-------------|-------------------|
| `syllabus_manage` | Manage modules, lessons, assignments | Content CRUD |
| `feedback_manage` | Generate/review/publish feedback | Feedback workflow |
| `calendar_manage` | Manage calendar events | Event CRUD |
| `students_manage` | Enroll/unenroll students | Enrollment CRUD, CSV |
| `submissions_view` | View student submissions | Read submissions |

### 6.2 Permission Matrix

#### Platform-Level Matrix

| Role | schools_create | schools_update | schools_delete | school_staff_manage |
|------|:--------------:|:--------------:|:--------------:|:-------------------:|
| Super Admin | ✓ | ✓ | ✓ | ✓ |
| Support | ✗ | ✗ | ✗ | ✗ |
| School Admin | ✗ | own | ✗ | own |
| Others | ✗ | ✗ | ✗ | ✗ |

#### Course-Level Matrix

| Role | courses | cohorts | syllabus | feedback | calendar | students | submissions |
|------|:-------:|:-------:|:--------:|:--------:|:--------:|:--------:|:-----------:|
| Super Admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| School Admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Instructor | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Teaching Fellow | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ |
| Course Coordinator | ✗ | ✗ | ✓ | ✗ | ✓ | ✓ | ✓ |
| Student | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | own |

### 6.3 Page Access Control

| URL Pattern | Required Permission | Additional Conditions |
|-------------|---------------------|----------------------|
| `/admin` | Super admin role | - |
| `/[school]/admin/*` | School admin of that school | - |
| `/[school]/[course]/admin/syllabus/*` | `syllabus_manage` | For that course |
| `/[school]/[course]/admin/students/*` | `students_manage` | For that course |
| `/[school]/[course]/admin/submissions/*` | `submissions_view` | For that course |
| `/[school]/[course]/[cohort]/home/*` | Enrolled in cohort | Content must be published & released |

### 6.4 Authorization Strategy

| Layer | Implementation | Purpose |
|-------|----------------|---------|
| **UI** | `usePermissions()` hook | Hide buttons/links user can't use (UX, not security) |
| **API** | `checkCoursePermission()` | Return 403 with clear error message |
| **Database** | RLS with `has_course_permission()` | Final defense, can't be bypassed |

### 6.5 RLS Policies

#### Table: `profiles`

| Operation | Policy | Condition |
|-----------|--------|-----------|
| SELECT | Own profile | `auth.uid() = id` |
| SELECT | Platform employees | `is_platform_employee(auth.uid())` |
| UPDATE | Own profile | `auth.uid() = id` |
| INSERT | Own profile | `auth.uid() = id` |

#### Table: `approved_emails`

| Operation | Policy | Condition |
|-----------|--------|-----------|
| ALL | Platform employees | `is_platform_employee(auth.uid())` WITH CHECK same |
| ALL | School admins | `is_school_admin(auth.uid(), school_id)` WITH CHECK same |
| SELECT | Own email check | `email = auth.jwt()->>'email'` |
| UPDATE | Own record | `email = auth.jwt()->>'email'` WITH CHECK same |

**Note:** UPDATE policy allows users to clear `cohort_id` after auto-enrollment. Also used for pending employee metadata.

#### Table: `platform_employees`

| Operation | Policy | Condition |
|-----------|--------|-----------|
| SELECT | Own record | `user_id = auth.uid()` |
| ALL | Super admins | `auth_is_super_admin()` |

#### Table: `schools`

| Operation | Policy | Condition |
|-----------|--------|-----------|
| SELECT | Active schools | `is_active = true` |
| INSERT | Super admins only | `is_super_admin(auth.uid())` |
| UPDATE | Super admin OR school admin of that school | `is_super_admin()` OR `is_school_admin(auth.uid(), id)` |
| DELETE | Super admins only | `is_super_admin(auth.uid())` (not implemented) |

#### Table: `school_employees`

| Operation | Policy | Condition |
|-----------|--------|-----------|
| SELECT | Own record | `user_id = auth.uid()` |
| SELECT | School admin of that school | `is_school_admin(auth.uid(), school_id)` |
| ALL | Platform employees | `is_platform_employee(auth.uid())` |
| INSERT | School admin of that school | `is_school_admin(auth.uid(), school_id)` |
| DELETE | School admin of that school | `is_school_admin(auth.uid(), school_id)` |
| INSERT | Bootstrap via admin client | Server-side auth callback (bypasses RLS) |

**Note:** New users being added as school employees need records created via admin client since they don't yet have RLS permissions.

#### Table: `courses`

| Operation | Policy | Condition |
|-----------|--------|-----------|
| SELECT | Published | `is_published = true` |
| SELECT | School admin | `is_school_admin(auth.uid(), school_id)` |
| SELECT | Course employee | `has_course_role(auth.uid(), id)` |
| SELECT | Enrolled student | User enrolled in course's cohort |
| INSERT | School admin | `is_school_admin(auth.uid(), school_id)` |
| UPDATE | School admin OR course staff | Has role |
| DELETE | School admin | `is_school_admin(auth.uid(), school_id)` |

#### Table: `cohorts`

| Operation | Policy | Condition |
|-----------|--------|-----------|
| SELECT | Course staff | `has_course_role(auth.uid(), course_id)` |
| SELECT | Enrolled | `is_enrolled(auth.uid(), id)` |
| INSERT/UPDATE/DELETE | Cohort managers | `has_course_permission(..., 'cohorts_manage')` |

#### Table: `modules`

| Operation | Policy | Condition |
|-----------|--------|-----------|
| SELECT | Student (published) | `is_published = true` AND enrolled |
| SELECT | Course staff | `has_course_role(...)` |
| INSERT/UPDATE/DELETE | Syllabus managers | `has_course_permission(..., 'syllabus_manage')` |

#### Table: `lessons` ⚠️ Release Date Enforced

| Operation | Policy | Condition |
|-----------|--------|-----------|
| SELECT | Student (released) | `is_published = true` AND `(release_date IS NULL OR release_date <= NOW())` AND enrolled |
| SELECT | Course staff | `has_course_role(...)` |
| INSERT/UPDATE/DELETE | Syllabus managers | `has_course_permission(..., 'syllabus_manage')` |

#### Table: `assignments` ⚠️ Release Date Enforced

| Operation | Policy | Condition |
|-----------|--------|-----------|
| SELECT | Student (released) | `is_published = true` AND `(release_date IS NULL OR release_date <= NOW())` AND enrolled |
| SELECT | Course staff | `has_course_role(...)` |
| INSERT/UPDATE/DELETE | Syllabus managers | `has_course_permission(..., 'syllabus_manage')` |

#### Table: `submissions`

| Operation | Policy | Condition |
|-----------|--------|-----------|
| SELECT | Own | `user_id = auth.uid()` |
| SELECT | Course staff | `has_course_permission(..., 'submissions_view')` |
| INSERT | Own + enrolled + released | `user_id = auth.uid()` AND enrolled AND assignment released |
| UPDATE | None | Use INSERT (versioning pattern) |

#### Table: `feedback`

| Operation | Policy | Condition |
|-----------|--------|-----------|
| SELECT | Own (published) | `status = 'published'` AND owns submission |
| SELECT | Course staff | `has_course_permission(..., 'feedback_manage')` |
| INSERT | Course staff | `has_course_permission(..., 'feedback_manage')` |
| UPDATE | Course staff | `has_course_permission(..., 'feedback_manage')` |

#### Table: `lesson_slide_decks`

| Operation | Policy | Condition |
|-----------|--------|-----------|
| SELECT | Enrolled students | Published + released lesson via `lessons → modules → cohorts` join + `is_enrolled()` |
| SELECT | Course staff | `has_course_role(auth.uid(), course_id)` via lesson → module → cohort → course join |
| INSERT | Syllabus managers | `has_course_permission(..., 'syllabus_manage')` via lesson chain |
| UPDATE | Syllabus managers | `has_course_permission(..., 'syllabus_manage')` via lesson chain |
| DELETE | Syllabus managers | `has_course_permission(..., 'syllabus_manage')` via lesson chain |

**Note:** One deck per lesson (UNIQUE constraint on `lesson_id`). All storage operations bypass storage RLS via service role.

#### Table: `slide_pages`

| Operation | Policy | Condition |
|-----------|--------|-----------|
| SELECT | Users who can view decks | `EXISTS (SELECT 1 FROM lesson_slide_decks d WHERE d.id = deck_id)` — inherits deck RLS |
| INSERT/UPDATE/DELETE | None (client) | Server uses service role during Inngest processing |

#### Table: `slide_access_logs`

| Operation | Policy | Condition |
|-----------|--------|-----------|
| INSERT/SELECT | None (client) | Server uses service role for all access log operations |

**Note:** Logs are written fire-and-forget by the image proxy API route. Staff can query via admin API if needed.

#### Supabase Storage: `slide-decks` Bucket

| Setting | Value |
|---------|-------|
| Bucket ID | `slide-decks` |
| Public | `false` (no direct access) |
| File size limit | 25 MB |
| Path pattern | `{cohort_id}/{lesson_id}/{deck_id}/{original.pdf \| pages/N.webp \| thumbnails/N.webp}` |

**Storage RLS Policies:**

| Policy | Operation | Condition |
|--------|-----------|-----------|
| Course staff can read | SELECT | `bucket_id = 'slide-decks'` AND `has_course_role()` via folder path join |
| No client INSERT/DELETE | - | All uploads/deletions via API route using service role |

**Design Decision:** No student-facing storage RLS. Students access images ONLY through the API proxy route (`/api/slides/[deckId]/pages/[pageNumber]/image`), which applies watermarks, rate limiting, and access logging. This avoids the `supabase_storage_admin` limitation where storage RLS can't query RLS-protected public tables.

### 6.6 Security Boundaries (Negative Test Cases)

| Scenario | Expected Result | Priority |
|----------|-----------------|----------|
| Student A views Student B's submission | BLOCKED | Critical |
| Student views assignment before release_date | BLOCKED | Critical |
| Student views lesson before release_date | BLOCKED | Critical |
| Student views feedback with status != 'published' | BLOCKED | Critical |
| Student accesses another student's media file | BLOCKED (storage RLS) | Critical |
| Unenrolled user uploads media to assignment | BLOCKED (enrollment check) | Critical |
| Teaching Fellow edits syllabus | BLOCKED | High |
| Teaching Fellow manages students | BLOCKED | High |
| Course Coordinator generates feedback | BLOCKED | High |
| School Admin A accesses School B's data | BLOCKED | High |
| Instructor accesses unassigned course | BLOCKED | High |
| User self-promotes to platform_employee | BLOCKED | Critical |
| Batch operation spans multiple courses | BLOCKED | High |
| Direct API call bypasses release_date | BLOCKED | Critical |
| Unauthenticated user accesses slide image API | BLOCKED (401) | Critical |
| Student accesses slide images without watermark | BLOCKED (always watermarked via API proxy) | Critical |
| User exceeds slide image rate limit (120/min) | BLOCKED (429) | High |

### 6.7 Route Protection Strategy

**Approach:** Blocklist with explicit exclusions

The middleware uses a **blocklist pattern** to protect routes:

1. **Protected prefixes** (`/admin`, `/me`, `/api/`) always require authentication
2. **Public content routes** (`/[school]`, `/[school]/[course]`) are allowed if they don't end with `/admin`
3. **Reserved slugs** (`admin`, `api`, `auth`, `login`, `me`, `home`) are blocked at creation time

**Trade-offs:**
- ✅ Simple to understand and implement
- ✅ Works well for current app structure
- ⚠️ New protected two-segment routes need explicit exclusions
- ⚠️ Alternative: Allowlist approach would be more future-proof but requires listing all public paths

**Key Files:**
- `src/lib/supabase/middleware.ts` - Route protection logic
- `src/app/(admin)/admin/page.tsx` - Reserved slug validation (schools)
- `src/app/(school-admin)/.../courses/page.tsx` - Reserved slug validation (courses)

### 6.8 Security Audit Summary

Security audit was performed covering these categories:

| Category | Items Checked |
|----------|---------------|
| Authentication & Authorization | Middleware auth bypass, RLS policies, permission checks, disabled guards |
| API Security | Missing auth, SQL injection, input validation, rate limiting |
| Client-Side Security | XSS (dangerouslySetInnerHTML), CSRF, sensitive data in bundles |
| Data Exposure | Console.log PII, error message leaks, overly permissive queries |
| Supabase Configuration | RLS gaps, service role usage, SECURITY DEFINER functions |
| Injection Vulnerabilities | SQL, command, template injection |

#### Security Fixes Implemented

| Severity | Fix | Description |
|----------|-----|-------------|
| **Critical** | Admin auth re-enabled | Uncommented super admin check in admin dashboard |
| **High** | Granular RLS policies | RLS uses `has_course_permission()` with specific permissions |
| **High** | API permission checks | `checkCoursePermission()` helper; all feedback routes require `FEEDBACK_MANAGE` |
| **High** | GET feedback authorization | Added missing authorization check |
| **High** | Batch permission bypass | Verify all IDs from same course |
| **Medium** | XSS protection | DOMPurify sanitization in TiptapViewer |
| **Medium** | URL validation | Validate link/image URLs (http/https only) in TiptapEditor |
| **Medium** | PII removal | Removed user emails, IDs, API key length from console.log |
| **Medium** | Middleware hardening | Tightened public route patterns with explicit protected prefixes |

#### Frontend Security

| Risk | Mitigation |
|------|------------|
| XSS via HTML rendering | DOMPurify sanitization on all `dangerouslySetInnerHTML` |
| Allowed HTML elements | Whitelist: `p, br, strong, em, u, s, ul, ol, li, h1-h6, blockquote, code, pre, a, span, div` |
| Allowed attributes | Whitelist: `href, target, rel, class` |

### 6.9 RLS Policy Interaction Warnings

⚠️ **Critical patterns to avoid:**

1. **Submissions + Feedback:** Don't create UPDATE policies on submissions that check feedback status - use versioning instead
2. **Cross-table EXISTS checks:** `EXISTS` subqueries in RLS can be slow and complex - prefer simpler patterns
3. **SECURITY DEFINER recursion:** Permission functions cannot query RLS-protected tables directly
4. **FOR ALL policies require WITH CHECK:** `FOR ALL` policies must include `WITH CHECK` clause for INSERT operations, not just `USING`
5. **Bootstrap operations:** New users may need records in tables they don't have RLS permission to insert - use admin client in auth callback

---

## 7. Data Model

### 7.1 Entity Relationship Diagram

```
Platform
├── platform_employees (super_admin, support)
│
└── schools
    ├── school_employees (school_admin)
    │
    └── courses
        ├── course_employees (instructor, teaching_fellow, course_coordinator)
        │
        └── cohorts
            ├── enrollments → profiles (students)
            ├── calendar_events
            │
            └── modules
                ├── lessons
                │   ├── content (JSONB)
                │   └── lesson_slide_decks (one per lesson)
                │       ├── slide_pages (page images + thumbnails)
                │       └── slide_access_logs (DRM audit)
                │
                └── assignments
                    ├── description (JSONB)
                    ├── response_template (JSONB)
                    ├── feedback_prompt
                    │
                    └── submissions (versioned, INSERT-only)
                        └── feedback
                            ├── ai_content (JSONB)
                            ├── reviewed_content (JSONB)
                            └── published_content (JSONB)

approved_emails → triggers auto-enrollment
```

### 7.2 Data Dictionary

#### Table: `profiles`

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | - | PK, FK → auth.users | |
| email | TEXT | No | - | UNIQUE | |
| full_name | TEXT | Yes | - | | |
| avatar_url | TEXT | Yes | - | | |
| phone | TEXT | Yes | - | | |
| created_at | TIMESTAMPTZ | No | NOW() | | |
| updated_at | TIMESTAMPTZ | No | NOW() | | |

**Indexes:** `idx_profiles_email`

---

#### Table: `approved_emails`

Whitelist for user registration - controls who can sign up. **Also used for pending employee invites.**

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| email | TEXT | No | - | UNIQUE | |
| school_id | UUID | Yes | - | FK → schools | |
| cohort_id | UUID | Yes | - | FK → cohorts | Auto-enroll target |
| approved_by | UUID | Yes | - | FK → profiles | |
| approved_at | TIMESTAMPTZ | No | NOW() | | |
| source | TEXT | No | - | CHECK: 'csv_upload' \| 'manual' \| 'payment' | |
| metadata | JSONB | No | '{}' | | **Pending employee:** `{pending_school_employee: true, pending_role: string}` |

**Indexes:** `idx_approved_emails_email`

**Special Uses:**
- **Student auto-enrollment:** `cohort_id` is set, cleared after enrollment in auth callback
- **Employee pre-approval:** `metadata.pending_school_employee` indicates pending invite, processed in auth callback

---

#### Table: `platform_employees`

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| user_id | UUID | No | - | UNIQUE, FK → profiles | |
| role | TEXT | No | - | CHECK: 'super_admin' \| 'support' | |
| created_at | TIMESTAMPTZ | No | NOW() | | |
| created_by | UUID | Yes | - | FK → profiles | |

---

#### Table: `schools`

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| name | TEXT | No | - | | |
| slug | TEXT | No | - | UNIQUE | URL-friendly |
| description | TEXT | Yes | - | | |
| logo_url | TEXT | Yes | - | | |
| website_url | TEXT | Yes | - | | |
| settings | JSONB | No | '{}' | | |
| is_active | BOOLEAN | No | true | | |
| created_at | TIMESTAMPTZ | No | NOW() | | |
| updated_at | TIMESTAMPTZ | No | NOW() | | |

---

#### Table: `school_employees`

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| school_id | UUID | No | - | FK → schools | |
| user_id | UUID | No | - | FK → profiles | |
| role | TEXT | No | - | CHECK: 'school_admin' | |
| created_at | TIMESTAMPTZ | No | NOW() | | |
| created_by | UUID | Yes | - | FK → profiles | |

**Unique:** `(school_id, user_id)`
**Indexes:** `idx_school_employees_user`, `idx_school_employees_school`

---

#### Table: `courses`

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| school_id | UUID | No | - | FK → schools | |
| name | TEXT | No | - | | |
| slug | TEXT | No | - | | |
| description | TEXT | Yes | - | | |
| short_description | TEXT | Yes | - | | |
| cover_image_url | TEXT | Yes | - | | |
| marketing_content | JSONB | No | '{}' | | |
| is_published | BOOLEAN | No | false | | |
| is_archived | BOOLEAN | No | false | | |
| created_at | TIMESTAMPTZ | No | NOW() | | |
| updated_at | TIMESTAMPTZ | No | NOW() | | |

**Unique:** `(school_id, slug)`
**Indexes:** `idx_courses_archived_created`

---

#### Table: `course_employees`

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| course_id | UUID | No | - | FK → courses | |
| user_id | UUID | No | - | FK → profiles | |
| role | TEXT | No | - | CHECK: 'instructor' \| 'teaching_fellow' \| 'course_coordinator' | |
| created_at | TIMESTAMPTZ | No | NOW() | | |
| created_by | UUID | Yes | - | FK → profiles | |

**Unique:** `(course_id, user_id, role)`
**Indexes:** `idx_course_employees_user`, `idx_course_employees_course`

---

#### Table: `cohorts`

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| course_id | UUID | No | - | FK → courses | |
| name | TEXT | No | - | | |
| start_date | DATE | Yes | - | | |
| end_date | DATE | Yes | - | | |
| enrollment_open | BOOLEAN | No | false | | |
| is_active | BOOLEAN | No | true | | |
| status | TEXT | No | 'upcoming' | CHECK: 'upcoming' \| 'active' \| 'completed' | |
| cloned_from_id | UUID | Yes | - | FK → cohorts | |
| created_at | TIMESTAMPTZ | No | NOW() | | |
| updated_at | TIMESTAMPTZ | No | NOW() | | |

---

#### Table: `enrollments`

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| cohort_id | UUID | No | - | FK → cohorts | |
| user_id | UUID | No | - | FK → profiles | |
| status | TEXT | No | 'active' | CHECK: 'active' \| 'completed' \| 'dropped' \| 'paused' | |
| enrolled_at | TIMESTAMPTZ | No | NOW() | | |
| completed_at | TIMESTAMPTZ | Yes | - | | |
| metadata | JSONB | No | '{}' | | |

**Unique:** `(cohort_id, user_id)`
**Indexes:** `idx_enrollments_user`, `idx_enrollments_cohort`

---

#### Table: `modules`

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| cohort_id | UUID | No | - | FK → cohorts | |
| title | TEXT | No | - | | |
| description | TEXT | Yes | - | | |
| position | INTEGER | No | 0 | | |
| is_published | BOOLEAN | No | false | | |
| created_at | TIMESTAMPTZ | No | NOW() | | |
| updated_at | TIMESTAMPTZ | No | NOW() | | |

**Indexes:** `idx_modules_cohort`

---

#### Table: `lessons`

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| module_id | UUID | No | - | FK → modules | |
| title | TEXT | No | - | | |
| content | JSONB | No | '{}' | | Shape: HtmlContent |
| video_url | TEXT | Yes | - | | |
| video_provider | TEXT | Yes | - | CHECK: 'youtube' \| 'vimeo' \| 'loom' | |
| position | INTEGER | No | 0 | | |
| is_published | BOOLEAN | No | false | | |
| estimated_duration_minutes | INTEGER | Yes | - | | |
| release_date | TIMESTAMPTZ | Yes | - | | **RLS enforced** |
| created_at | TIMESTAMPTZ | No | NOW() | | |
| updated_at | TIMESTAMPTZ | No | NOW() | | |

| transcript | TEXT | Yes | - | | Descript .md transcript |
| transcript_file_name | TEXT | Yes | - | | Original upload filename |

**Indexes:** `idx_lessons_module`, `idx_lessons_release_date`

---

#### Table: `content_embeddings`

Vector embeddings for semantic search. Stores chunked content with 1536-dim OpenAI embeddings.

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| content_type | TEXT | No | - | CHECK: 'lesson' \| 'assignment' \| 'module' \| 'video_transcript' | |
| content_id | UUID | No | - | | Source content FK |
| cohort_id | UUID | No | - | FK → cohorts | Scoping for search |
| chunk_index | INTEGER | No | 0 | | Position within content |
| chunk_text | TEXT | No | - | | Raw text for display |
| embedding | vector(1536) | No | - | | OpenAI text-embedding-3-small |
| metadata | JSONB | No | '{}' | | title, module_name, timestamp_seconds, etc. |
| created_at | TIMESTAMPTZ | No | NOW() | | |
| updated_at | TIMESTAMPTZ | No | NOW() | | |

**Unique:** `(content_type, content_id, chunk_index)`
**Indexes:** `content_embeddings_embedding_idx` (HNSW, cosine), `content_embeddings_cohort_idx`, `content_embeddings_content_idx`
**RLS:** Students read within enrolled cohorts; staff with `syllabus_manage` can write; platform employees full access
**Index Note:** HNSW (not IVFFlat). IVFFlat fails on small datasets (<100 rows). Postgres query planner auto-ignores HNSW when seq scan is faster.

---

#### Table: `assignments`

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| module_id | UUID | No | - | FK → modules | |
| title | TEXT | No | - | | |
| description | JSONB | No | '{}' | | Shape: HtmlContent |
| question | TEXT | Yes | - | | |
| response_template | JSONB | No | '{}' | | Shape: HtmlContent |
| due_date | TIMESTAMPTZ | Yes | - | | Soft deadline |
| position | INTEGER | No | 0 | | |
| is_published | BOOLEAN | No | false | | |
| feedback_prompt | TEXT | Yes | - | | |
| feedback_model | TEXT | No | 'claude-sonnet-4-5-20250929' | | |
| feedback_config | JSONB | No | '{}' | | |
| release_date | TIMESTAMPTZ | Yes | - | | **RLS enforced** |
| allowed_submission_types | TEXT[] | No | `'{text}'` | CHECK: elements in ('text','audio','audio_camera','video'), array_length = 1 | Single-select submission type |
| max_recording_duration | INTEGER | No | 300 | CHECK: >= 10 AND <= 3600 | Seconds (300 = 5 min, 3600 = 60 min) |
| created_at | TIMESTAMPTZ | No | NOW() | | |
| updated_at | TIMESTAMPTZ | No | NOW() | | |

**Indexes:** `idx_assignments_module`, `idx_assignments_release_date`

---

#### Table: `submissions`

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| assignment_id | UUID | No | - | FK → assignments | |
| user_id | UUID | No | - | FK → profiles | |
| content | JSONB | No | - | | Shape: HtmlContent |
| version | INTEGER | No | 1 | | |
| is_late | BOOLEAN | No | false | | Trigger-calculated |
| submitted_at | TIMESTAMPTZ | No | NOW() | | |
| updated_at | TIMESTAMPTZ | No | NOW() | | |
| previous_version_id | UUID | Yes | - | FK → submissions | |

**Indexes:** `idx_submissions_assignment`, `idx_submissions_user`
**Note:** INSERT-only pattern (new version = new row). Content JSONB shape varies by type — see §7.3 for TextContent, AudioContent, VideoContent shapes.

---

#### Table: `feedback`

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| submission_id | UUID | No | - | FK → submissions | |
| ai_content | JSONB | Yes | - | | Shape: HtmlContent |
| ai_generated_at | TIMESTAMPTZ | Yes | - | | |
| ai_model_used | TEXT | Yes | - | | |
| ai_tokens_used | INTEGER | Yes | - | | |
| reviewed_content | JSONB | Yes | - | | Shape: HtmlContent |
| reviewed_by | UUID | Yes | - | FK → profiles | |
| reviewed_at | TIMESTAMPTZ | Yes | - | | |
| published_content | JSONB | Yes | - | | Shape: HtmlContent |
| published_by | UUID | Yes | - | FK → profiles | |
| published_at | TIMESTAMPTZ | Yes | - | | |
| status | TEXT | No | 'pending' | CHECK: 'pending' \| 'ai_generated' \| 'reviewed' \| 'published' | |
| created_at | TIMESTAMPTZ | No | NOW() | | |
| updated_at | TIMESTAMPTZ | No | NOW() | | |

**Indexes:** `idx_feedback_submission`

---

#### Table: `calendar_events`

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| cohort_id | UUID | No | - | FK → cohorts | |
| title | TEXT | No | - | | |
| description | TEXT | Yes | - | | |
| event_type | TEXT | No | - | CHECK: 'live_session' \| 'office_hours' \| 'deadline' \| 'other' | |
| start_time | TIMESTAMPTZ | No | - | | |
| end_time | TIMESTAMPTZ | Yes | - | | |
| meeting_url | TEXT | Yes | - | | |
| location | TEXT | Yes | - | | |
| is_recurring | BOOLEAN | No | false | | |
| recurrence_rule | TEXT | Yes | - | | iCalendar RRULE |
| assignment_id | UUID | Yes | - | FK → assignments | |
| created_by | UUID | Yes | - | FK → profiles | |
| created_at | TIMESTAMPTZ | No | NOW() | | |
| updated_at | TIMESTAMPTZ | No | NOW() | | |

**Indexes:** `idx_calendar_events_cohort`, `idx_calendar_events_start`

---

#### Table: `lesson_slide_decks`

One slide deck per lesson. Tracks PDF processing pipeline status.

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| lesson_id | UUID | No | - | FK → lessons, UNIQUE | One deck per lesson |
| original_file_name | TEXT | No | - | | Original PDF filename |
| storage_path | TEXT | No | - | | Base path: `{cohort}/{lesson}/{deck}` |
| total_pages | INTEGER | Yes | - | | Set after processing |
| processing_status | TEXT | No | 'pending' | CHECK: 'pending' \| 'processing' \| 'ready' \| 'failed' | |
| processing_error | TEXT | Yes | - | | Error message if failed |
| created_by | UUID | No | - | FK → auth.users | |
| created_at | TIMESTAMPTZ | No | NOW() | | |
| updated_at | TIMESTAMPTZ | No | NOW() | | Trigger: `update_updated_at_column()` |

**Indexes:** Unique on `lesson_id`

---

#### Table: `slide_pages`

Individual slide page images with metadata. Server-managed (no client write policies).

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| deck_id | UUID | No | - | FK → lesson_slide_decks ON DELETE CASCADE | |
| page_number | INTEGER | No | - | | 1-indexed |
| storage_path | TEXT | No | - | | Full-res WebP path |
| thumbnail_storage_path | TEXT | No | - | | Thumbnail WebP path |
| width | INTEGER | No | - | | Full-res pixel width |
| height | INTEGER | No | - | | Full-res pixel height |

**Unique:** `(deck_id, page_number)`
**Indexes:** `idx_slide_pages_deck` on `(deck_id, page_number)`

---

#### Table: `slide_access_logs`

DRM access audit trail. Server-managed via service role (fire-and-forget inserts).

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | UUID | No | gen_random_uuid() | PK | |
| deck_id | UUID | No | - | FK → lesson_slide_decks ON DELETE CASCADE | |
| page_number | INTEGER | No | - | | |
| user_id | UUID | No | - | FK → auth.users | |
| ip_address | INET | Yes | - | | Client IP |
| user_agent | TEXT | Yes | - | | Browser user-agent |
| accessed_at | TIMESTAMPTZ | No | NOW() | | |

**Indexes:** `idx_slide_access_logs_deck_user` on `(deck_id, user_id, accessed_at)`

---

#### Supabase Storage: `slide-decks` Bucket

Slide deck files (original PDFs + processed WebP images). All operations via service role.

| Setting | Value |
|---------|-------|
| Bucket ID | `slide-decks` |
| Public | `false` (no direct access — API proxy only) |
| File size limit | 25 MB |
| Path pattern | `{cohort_id}/{lesson_id}/{deck_id}/{original.pdf \| pages/N.webp \| thumbnails/N.webp}` |

**Storage RLS Policies:**

| Policy | Operation | Condition |
|--------|-----------|-----------|
| Course staff can read | SELECT | `bucket_id = 'slide-decks'` AND `has_course_role()` via folder path |
| No client INSERT/DELETE | - | All uploads/deletions via API route using service role |

**Design Decision:** No student-facing storage policies. Students access images exclusively through the API proxy (`/api/slides/[deckId]/pages/[pageNumber]/image`) which applies per-student watermarks, rate limiting, and access logging. This architecture was chosen because `supabase_storage_admin` cannot query RLS-protected public tables like `lessons`/`modules`/`cohorts`.

---

#### Supabase Storage: `submissions-media` Bucket

Media files (audio/video recordings) for assignment submissions.

| Setting | Value |
|---------|-------|
| Bucket ID | `submissions-media` |
| Public | `false` (signed URLs required) |
| File size limit | 600 MB |
| Path pattern | `{cohort_id}/{assignment_id}/{user_id}/{filename}.{ext}` |

**Storage RLS Policies:**

| Policy | Operation | Condition |
|--------|-----------|-----------|
| Students upload own media | INSERT | `bucket_id = 'submissions-media'` AND folder[3] = user AND enrolled |
| Students read own media | SELECT | `bucket_id = 'submissions-media'` AND folder[3] = user |
| Staff read cohort media | SELECT | Course employee of cohort's course OR platform employee |
| Owner deletes own segments | DELETE | `bucket_id = 'submissions-media'` AND folder[3] = user |

**Design Decision:** Read access is less restrictive than write — students retain access to their portfolio after completion/drop/pause (no enrollment status check on SELECT).

---

### 7.3 JSON Column Shapes

```typescript
/**
 * Rich text content from Tiptap editor.
 * Used by: lessons.content, assignments.description, assignments.response_template,
 *          submissions.content, feedback.ai_content, feedback.reviewed_content,
 *          feedback.published_content
 */
interface HtmlContent {
  html: string;
}

/**
 * Generic metadata container.
 * Used by: approved_emails.metadata, enrollments.metadata
 */
interface Metadata {
  [key: string]: unknown;
}

/**
 * School configuration.
 * Used by: schools.settings
 */
interface SchoolSettings {
  [key: string]: unknown;  // Reserved for future
}

/**
 * Course marketing content.
 * Used by: courses.marketing_content
 */
interface MarketingContent {
  [key: string]: unknown;  // Reserved for future
}

/**
 * AI feedback generation config.
 * Used by: assignments.feedback_config
 */
interface FeedbackConfig {
  temperature?: number;
  max_tokens?: number;
  [key: string]: unknown;
}

/**
 * Text submission content (backward compatible).
 * Used by: submissions.content (when type is text)
 * Note: missing `type` field treated as 'text' for backward compatibility.
 */
interface TextContent {
  type?: "text";
  html: string;
}

/**
 * Audio submission content.
 * Used by: submissions.content (when type is audio)
 */
interface AudioContent {
  type: "audio";
  recording_mode: "audio_only" | "audio_with_preview";
  storage_path: string;       // e.g., "cohort-id/assignment-id/user-id/submission-id.webm"
  duration_seconds: number;
  mime_type: string;           // e.g., "audio/webm;codecs=opus"
  transcript?: string;         // Full transcript text (populated async)
  transcript_status: "pending" | "completed" | "failed";
}

/**
 * Video submission content (Feature 3+).
 * Used by: submissions.content (when type is video)
 */
interface VideoContent {
  type: "video";
  recording_mode: "full_video";
  storage_path: string;
  duration_seconds: number;
  mime_type: string;
  thumbnail_path?: string;
  transcript?: string;
  transcript_status: "pending" | "completed" | "failed";
}
```

### 7.4 Enums and Status Values

| Field | Valid Values | Transitions |
|-------|--------------|-------------|
| platform_employees.role | super_admin, support | Admin-controlled |
| school_employees.role | school_admin | Admin-controlled |
| course_employees.role | instructor, teaching_fellow, course_coordinator | Admin-controlled |
| enrollments.status | active, completed, dropped, paused | active → any; paused → active |
| cohorts.status | upcoming, active, completed | Forward only (auto-updated) |
| feedback.status | pending, ai_generated, reviewed, published | Forward only |
| approved_emails.source | csv_upload, manual, payment | Set at creation |
| assignments.allowed_submission_types[] | text, audio, audio_camera, video | Exactly one value (single-select) |
| submissions.content.recording_mode | audio_only, audio_with_preview, full_video | Set at recording time |
| submissions.content.transcript_status | pending, completed, failed | pending → completed \| failed |
| lesson_slide_decks.processing_status | pending, processing, ready, failed | pending → processing → ready \| failed |

---

## 8. API Design

### 8.1 Endpoint Inventory

| Method | Path | Description | Permission Required |
|--------|------|-------------|---------------------|
| POST | /api/feedback/generate | Generate AI feedback | feedback_manage |
| POST | /api/feedback/batch-generate | Generate for multiple | feedback_manage |
| GET | /api/feedback/[id] | Get feedback details | feedback_manage OR own+published |
| PATCH | /api/feedback/[id] | Update reviewed content | feedback_manage |
| POST | /api/feedback/[id]/publish | Publish single | feedback_manage |
| POST | /api/feedback/batch-publish | Publish multiple | feedback_manage |
| POST | /api/search | Semantic search + AI answer | Enrolled in cohort OR course staff |
| POST | /api/embeddings/index | Re-index content embeddings | syllabus_manage |
| POST | /api/lessons/[id]/transcript | Upload transcript file | syllabus_manage |
| POST | /api/submissions/upload/initiate | Initiate TUS resumable upload for media | Enrolled student |
| POST | /api/submissions/confirm | Confirm upload complete, create submission record | Enrolled student |
| GET | /api/submissions/playback-url | Get signed URL for media playback | Own submission OR course staff |
| POST | /api/inngest | Inngest webhook endpoint (transcription + slide processing events) | System (Inngest signing key) |
| POST | /api/lessons/[id]/slides | Upload PDF, create deck, dispatch Inngest processing | syllabus_manage |
| GET | /api/lessons/[id]/slides | Get deck metadata + slide pages (RLS-protected) | Enrolled OR course staff (via RLS) |
| DELETE | /api/lessons/[id]/slides | Remove deck + all storage files | syllabus_manage |
| GET | /api/slides/[deckId]/pages/[pageNumber]/image | Serve watermarked slide image (full or thumbnail) | Authenticated + enrolled/staff (rate-limited: 120/min) |

### 8.2 Request/Response Schemas

```typescript
// POST /api/feedback/generate
const GenerateFeedbackSchema = z.object({
  submissionId: z.string().uuid("Invalid submission ID"),
});

// POST /api/feedback/batch-generate
const BatchGenerateSchema = z.object({
  assignmentId: z.string().uuid("Invalid assignment ID"),
  submissionIds: z.array(z.string().uuid()).optional(),
});

// PATCH /api/feedback/[id]
const UpdateFeedbackSchema = z.object({
  reviewedContent: z.object({
    html: z.string(),
  }),
});

// POST /api/feedback/batch-publish
const BatchPublishSchema = z.object({
  feedbackIds: z.array(z.string().uuid()).min(1, "At least one required"),
});

// Route params
const FeedbackParamsSchema = z.object({
  id: z.string().uuid("Invalid feedback ID"),
});

// POST /api/submissions/upload/initiate
const InitiateUploadSchema = z.object({
  assignmentId: z.string().uuid(),
  fileName: z.string(),
  fileType: z.enum(["audio", "video"]),
  fileSize: z.number().positive(),
  mimeType: z.string(),
  durationSeconds: z.number().min(1),
  usedCamera: z.boolean(),
});

// POST /api/submissions/confirm
const ConfirmUploadSchema = z.object({
  assignmentId: z.string().uuid(),
  storagePath: z.string(),
  durationSeconds: z.number().min(1),
  mimeType: z.string(),
  recordingMode: z.enum(["audio_only", "audio_with_preview", "full_video"]),
});

// GET /api/submissions/playback-url
// Query: submissionId (UUID)

// POST /api/lessons/[id]/slides
// Body: FormData with "file" field (PDF, ≤25 MB)
// Response: { deckId: string, storagePath: string, status: "pending" }

// GET /api/lessons/[id]/slides
// Response: { deck: { id, lesson_id, original_file_name, total_pages,
//   processing_status, processing_error, created_at, updated_at,
//   slide_pages: [{ id, page_number, width, height }] } | null }

// DELETE /api/lessons/[id]/slides
// Response: { success: true }

// GET /api/slides/[deckId]/pages/[pageNumber]/image
// Query: type=full|thumbnail (default: full), preview=true (skip watermark for staff)
// Response: WebP image buffer with Cache-Control headers
// Rate limit: 120 requests/min per user (Upstash Redis sliding window)
```

### 8.3 Error Response Format

```typescript
interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}

// Standard responses
{ error: "Invalid submission ID" }              // 400
{ error: "Unauthorized" }                       // 401
{ error: "Permission denied", code: "FORBIDDEN" } // 403
{ error: "Feedback not found" }                 // 404
{ error: "Internal server error" }              // 500
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

**Required:** `no-explicit-any` must be `error`, not `warn`.

### 9.3 Type Generation

```json
{
  "scripts": {
    "db:types": "supabase gen types typescript --linked > src/types/database.ts",
    "db:types:check": "npm run db:types && git diff --exit-code src/types/database.ts"
  }
}
```

**Rule:** Run `npm run db:types` after EVERY migration. Commit the result.

### 9.4 CI/CD Pipeline

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
      - run: npm test
```

**Gate:** PRs cannot merge without passing.

### 9.5 Code Patterns

| Pattern | Implementation |
|---------|----------------|
| Query result typing | `castQueryResult<T>(data)` |
| JSON content access | `getHtml(content)`, `hasHtmlContent(content)` |
| API validation | Zod schemas for body, params, query |
| HTML sanitization | DOMPurify before `dangerouslySetInnerHTML` |
| Environment secrets | Never in `next.config.ts env{}`, use `process.env` server-side |

### 9.6 Type Safety Standards

#### Core Rules

| Rule | Rationale |
|------|-----------|
| **No `: any` annotations** | Loses type safety; use specific types or `unknown` with guards |
| **No `as any` casts** | Bypasses type checking; use proper type guards or `castQueryResult<T>()` |
| **No `as unknown as T`** | Bypasses type checking; use `castQueryResult<T>()` or proper guards |
| **No `@ts-ignore`** | Hides real issues; fix the type error instead |
| **Avoid non-null assertions (`!`)** | Can cause runtime errors; handle null cases explicitly |
| **No raw `dangerouslySetInnerHTML`** | Must sanitize with DOMPurify first to prevent XSS |
| **Use Zod for external data** | API request bodies, CSV imports need runtime validation |

#### Type Infrastructure

| File | Purpose |
|------|---------|
| `src/types/database.ts` | Auto-generated Supabase types (regenerate with CLI) |
| `src/types/supabase-query-types.ts` | Query result types for nested selects/joins |
| `src/lib/supabase/typed-client.ts` | Helpers: `castQueryResult<T>()`, `isDefined()`, `extractData()` |
| `src/lib/utils/content-helpers.ts` | JSON content helpers: `getHtml()`, `hasHtmlContent()`, `isHtmlContent()` |
| `src/lib/media/constants.ts` | Media recording constants: bitrates, MIME types |
| `src/hooks/use-media-recorder.ts` | Core recording hook: independent streams, device enumeration, MediaRecorder lifecycle |
| `src/hooks/use-audio-analyser.ts` | Web Audio API AnalyserNode lifecycle for frequency visualization |
| `src/lib/slides/constants.ts` | PDF constraints (25MB, 300 pages), image output settings (WebP, 1920px/400px), watermark config, rate limits, storage path helpers |
| `src/lib/slides/watermark.ts` | SVG watermark generation (tiled diagonal text), Sharp compositing to WebP |

#### Pattern: Typing Supabase Query Results

```typescript
import { castQueryResult } from "@/lib/supabase/typed-client";
import type { EnrollmentWithFullCoursePath } from "@/types/supabase-query-types";

// 1. Execute query
const { data, error } = await supabase.from("enrollments").select(`...`);

// 2. Handle null/error BEFORE casting
if (error || !data) return [];

// 3. Cast to typed result
const enrollments = castQueryResult<EnrollmentWithFullCoursePath[]>(data);

// 4. Now fully typed - IDE autocomplete works
enrollments.map((e) => e.cohorts.courses.schools.name);
```

#### Pattern: Handling JSON Content

Database JSON columns (`description`, `content`, `response_template`, etc.) are typed as `unknown`:

```typescript
import { getHtml, hasHtmlContent } from "@/lib/utils/content-helpers";

// Safe extraction - returns empty string if invalid
const html = getHtml(lesson.content);

// Conditional rendering
{hasHtmlContent(assignment.description) && (
  <TiptapViewer content={getHtml(assignment.description)} />
)}
```

#### When to Add New Query Types

Add to `supabase-query-types.ts` when:
1. Query includes nested joins
2. Query is used in multiple places
3. Map/filter callbacks would otherwise use `: any`

**Naming convention:** `EntityWithRelation` or `EntityForPageName`

#### Future TypeScript Improvements

| Flag | Status | Notes |
|------|--------|-------|
| `noUncheckedIndexedAccess` | Not enabled | Enable in CI as warning first, then promote to error |

### 9.7 Database Conventions

> **CRITICAL:** All database triggers and functions MUST follow these patterns.

#### 1. Explicit Schema References

```sql
-- WRONG - will fail with "relation does not exist"
INSERT INTO profiles (id, email) VALUES (NEW.id, NEW.email);

-- CORRECT - always use public. prefix
INSERT INTO public.profiles (id, email) VALUES (NEW.id, NEW.email);
```

#### 2. Permission Functions with SECURITY DEFINER

```sql
-- All permission-checking functions must use this pattern:
-- 1. SET search_path = public (prevents object hijacking)
-- 2. public. prefix on all table names (defense in depth)
CREATE OR REPLACE FUNCTION is_super_admin(check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.platform_employees
        WHERE public.platform_employees.user_id = check_user_id
        AND role = 'super_admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

#### 3. PostgreSQL Exception Handling

```sql
-- Multiple EXCEPTION blocks require nested BEGIN blocks
BEGIN
    -- main logic
EXCEPTION WHEN OTHERS THEN
    BEGIN
        -- fallback logic
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Error: %', SQLERRM;
    END;
END;
```

---

## 10. Testing & Deployment

### 10.1 Test Strategy

**Status:** ✅ Implemented (Session 22)

| Type | Coverage | Tools | Status |
|------|----------|-------|--------|
| Unit | Utilities, permissions | Vitest + RTL | ✅ 98 tests |
| Integration | API routes | Supertest | Planned |
| E2E | Critical flows | Playwright | Planned |
| Security | RLS policies | Custom SQL tests | Planned |

**Testing Infrastructure:**

| File | Purpose |
|------|---------|
| `vitest.config.ts` | Test configuration (jsdom, path aliases) |
| `src/test/setup.ts` | Global setup (jest-dom matchers, mocks) |

**Test Coverage:**

| Module | Tests | Coverage |
|--------|-------|----------|
| `csv-parser.ts` | 15 | Parsing, validation, email normalization |
| `content-helpers.ts` | 28 | HTML extraction, type guards |
| `cn.ts` | 20 | Class merging, Tailwind deduplication |
| `permission-matrix.ts` | 35 | Role permissions, course access |
| **Total** | **98** | Core utilities |

**Test Scripts:**

```bash
npm run test           # Watch mode
npm run test:run       # Single run (CI mode)
npm run test:coverage  # With coverage report
npm run test:ui        # Vitest UI
```

**Bug Found by Tests:** Spread operator bug in csv-parser where email normalization was overwritten.

### 10.2 Critical Test Cases

| Test | Type | Priority |
|------|------|----------|
| Student cannot view other's submission | Security | P0 |
| Student cannot view unreleased content | Security | P0 |
| Teaching fellow cannot edit syllabus | Security | P0 |
| Cross-course batch operations blocked | Security | P0 |
| Feedback workflow: pending → published | Integration | P1 |
| Submission versioning works | Integration | P1 |

### 10.3 Environments

| Environment | Database | URL |
|-------------|----------|-----|
| Development | Supabase (dev) | localhost:3000 |
| Production | Supabase (prod) | crossingcareerchasms.com |

### 10.4 Environment Variables

| Variable | Required | Secret | Description |
|----------|----------|--------|-------------|
| NEXT_PUBLIC_SUPABASE_URL | Yes | No | Supabase project URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Yes | No | Public auth key |
| SUPABASE_SERVICE_ROLE_KEY | Yes | Yes | Admin key (server only) |
| ANTHROPIC_API_KEY | Yes | Yes | Claude API key |
| NEXT_PUBLIC_APP_URL | Yes | No | App base URL |
| OPENAI_API_KEY | Yes | Yes | Embedding generation (text-embedding-3-small) |
| UPSTASH_REDIS_REST_URL | Yes | No | Rate limiting backend |
| UPSTASH_REDIS_REST_TOKEN | Yes | Yes | Rate limiting auth |
| INNGEST_EVENT_KEY | Yes | Yes | Inngest event publishing key |
| INNGEST_SIGNING_KEY | Yes | Yes | Inngest webhook signature verification |

### 10.5 Deployment Process

```
1. Push to main branch
2. Vercel auto-deploys
3. Verify on production
4. Run migrations manually if needed
```

### 10.6 External API Dependencies

#### Anthropic Claude API

| Setting | Value | Notes |
|---------|-------|-------|
| Default Model | `claude-sonnet-4-5-20250929` | Check availability before each phase |
| Fallback Models | `claude-3-5-haiku-20241022` | For faster/cheaper responses |
| Max Tokens | 2048 | Sufficient for feedback |
| Timeout | 30 seconds | Account for cold starts |

**Pre-Implementation Checklist:**
- [ ] Verify model name is current (check docs.anthropic.com)
- [ ] Test API key loading in target environment
- [ ] Confirm rate limits are sufficient

#### AI Feedback Integration Flow

```
1. Instructor selects model (Claude 3.5 Sonnet, Claude 3 Haiku)
2. Instructor writes evaluation prompt
3. Student submits response
4. System sends: prompt + student response → LLM
5. Response stored as draft feedback
6. Instructor reviews/edits before publishing
```

### 10.7 Production Readiness Checklist

- [x] Remove PII from console.log statements
- [x] Re-enable admin UI access checks
- [x] Granular RLS policies implemented
- [x] XSS protection with DOMPurify
- [x] FOR ALL RLS policies have WITH CHECK clauses
- [x] Bootstrap operations use admin client in auth callback
- [x] Rate limiting on AI feedback endpoints (Upstash Redis)
- [x] Error monitoring (Sentry integration)
- [x] Supabase cookie SameSite settings (verified Lax default)
- [x] CSRF/origin validation (Origin + Content-Type checks in middleware)
- [x] Supabase Storage RLS for media files (students own files, staff read cohort)
- [x] Signed URLs for media playback (no direct public URLs)
- [x] Server-side file type and size validation on upload
- [x] Inngest webhook signature verification
- [x] Rate limiting on slide image endpoint (120/min per user via Upstash Redis)
- [x] Server-side watermark on all student-facing slide images (name + ID suffix)
- [x] Access logging for slide views (fire-and-forget, IP + user-agent)
- [x] Private browser caching for watermarked images (Cache-Control: private, max-age=300/600)

### 10.8 Code Quality Standards (Session 22)

#### Component Architecture

Large components should be broken into modular, focused files:

**Pattern:** Parent page holds state and mutation handlers; child components receive props and call handlers.

**Example - Cohort Management Page (67% reduction):**

| File | Lines | Purpose |
|------|-------|---------|
| `page.tsx` | 746 | Main orchestrator |
| `_components/types.ts` | 173 | Shared TypeScript interfaces |
| `_components/syllabus-tab.tsx` | 287 | Syllabus tab content |
| `_components/students-tab.tsx` | 495 | Students tab with modals |
| `_components/settings-tab.tsx` | 101 | Settings form |
| `_components/sortable-module.tsx` | 476 | Draggable module card |

#### React Server Components (RSC)

Student-facing read-only pages should use RSC for better performance:

**Benefits:**
- Reduced JavaScript bundle size
- No client-side fetch waterfall
- Better SEO
- Server-side enrollment verification

**RSC Pattern:**
```typescript
// No "use client" directive
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function LessonPage({ params }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: lesson } = await supabase
    .from("lessons")
    .select("*")
    .eq("id", lessonId)
    .single();

  return <LessonContent lesson={lesson} />;
}
```

#### Content Security Policy

CSP headers configured in `vercel.json`:

| Source | Purpose |
|--------|---------|
| `*.supabase.co` | API, storage, WebSocket |
| `accounts.google.com`, `*.googleusercontent.com` | OAuth, profile images |
| `www.youtube.com`, `www.youtube-nocookie.com` | Video embeds |
| `va.vercel-scripts.com`, `vitals.vercel-insights.com` | Analytics |
| `*.sentry.io`, `*.ingest.sentry.io` | Error tracking |
| `blob:` | MediaRecorder playback, audio/video preview |

### 10.9 Lessons Learned (22 Sessions)

Key insights that would have saved time if known upfront:

#### RLS & Permissions

| Lesson | What Happened | Do This Instead |
|--------|---------------|-----------------|
| **Start granular** | Built coarse role checks, then rewrote as `has_course_permission()` | Define permission matrix before first migration |
| **FOR ALL + WITH CHECK** | `FOR ALL` policies failed on INSERT | Always add `WITH CHECK` clause |
| **Bootstrap operations** | New users couldn't create needed records | Use admin client in auth callback |
| **Release dates in RLS** | UI-only checks were bypassed | Enforce in RLS policies |

#### Supabase SSR

| Lesson | What Happened | Do This Instead |
|--------|---------------|-----------------|
| **getSession() race conditions** | Pages hung waiting for session | Use `getUser()` as source of truth |
| **Singleton client** | Multiple instances caused auth conflicts | Single client per request context |

#### Next.js 15+

| Lesson | What Happened | Do This Instead |
|--------|---------------|-----------------|
| **Turbopack env loading** | `.env.local` didn't load reliably | File-based fallback for critical env vars |
| **Client vs Server Components** | Overused `"use client"` | Default to RSC; add `"use client"` only for interactivity |
| **Route params are Promises** | `params.id` failed in Next.js 15 | Await params: `const { id } = await params` |

#### TypeScript

| Lesson | What Happened | Do This Instead |
|--------|---------------|-----------------|
| **`: any` accumulation** | 17 instances crept in | Set `no-explicit-any: error` from day 1 |
| **Supabase query types** | Complex joins returned `unknown` | Create query result types |
| **JSON content columns** | `content: unknown` required unsafe casts | Use `getHtml()` helper |

#### Testing

| Lesson | What Happened | Do This Instead |
|--------|---------------|-----------------|
| **Tests found bugs** | Spread operator bug caught by tests | Write tests for utilities before features |
| **No tests = no confidence** | Refactoring was scary | Set up Vitest + RTL in Phase 0 |

#### Vector Search / RAG

| Lesson | What Happened | Do This Instead |
|--------|---------------|-----------------|
| **Index choice must match data size** | IVFFlat `lists=100` on 84 rows → fresh embeddings returned 0 results (empty Voronoi cells) | Use HNSW for any dataset, or no index for <1k rows. Document data volume assumptions in migration comments |
| **Test with fresh vectors** | Stored embeddings worked; fresh ones didn't. Took multiple sessions to diagnose | Always test with *fresh* query vectors during development, not stored ones |
| **Compare index vs seq scan early** | Tried body size, JSON type, PostgREST bugs before discovering index issue | When search returns 0 rows, first force seq scan to isolate index vs data issue |
| **Permission checks need admin client** | User-scoped Supabase client couldn't read `platform_employees` due to RLS → 403 for super admins | Use admin client for permission queries; authenticate user identity separately |
| **CSRF must handle www variants** | `NEXT_PUBLIC_APP_URL` without `www` rejected requests from `www.` domain | Auto-allow both www and non-www in CSRF origin validation |
| **Auto-index on save** | Instructors had to manually re-index after editing content | Fire-and-forget fetch to re-index API after every save; manual button as fallback |
| **Rotate keys after debugging** | Test scripts had hardcoded API keys during debugging | Always use env vars, even in test scripts. Rotate keys if exposed |

#### Audio/Video Assignments

| Lesson | What Happened | Do This Instead |
|--------|---------------|-----------------|
| **Independent streams from the start** | Built single combined `getUserMedia({audio, video})` — toggles were interdependent, "looked clownish" | Always use separate `getUserMedia()` calls: one for audio, one for video. Each toggle is its own stream |
| **Single-select over multi-select** | Started with 3 checkboxes for submission type (text/audio/video) — confusing UX, complex validation | Use single-select radio (4 types: text, audio, audio_camera, video). Simpler for students and instructors |
| **API type mapping** | `audio_camera` assignment stored in DB but upload sent `fileType: "audio"` — type check failed | Map between assignment types and file types: `audio_camera` assignments accept `audio` file uploads |
| **Camera init state** | Camera toggle initialized from `showCamera` prop as "on" — confusing when no camera feed visible | Both toggles always start "off" (red). User explicitly enables each device |
| **Canvas over React for visualization** | Considered React state for frequency bars — would cause 60+ re-renders/sec | Use `<canvas>` with `requestAnimationFrame` loop. Zero React re-renders, smooth 60fps |
| **Web Audio feedback prevention** | Connecting AnalyserNode to `audioContext.destination` played mic through speakers | Connect `MediaStreamSource → AnalyserNode` only, never to destination |
| **TUS for media uploads** | Direct multipart POST fragile for large files | TUS resumable upload protocol handles network interruptions gracefully |

#### Lesson Slides

| Lesson | What Happened | Do This Instead |
|--------|---------------|-----------------|
| **FormData over TUS for slides** | Planned TUS upload but `supabase_storage_admin` role can't query RLS-protected public tables (`lessons`, `modules`, `cohorts`), making storage RLS impossible | Use FormData POST to API route; server uploads via service role key. TUS only needed for large files (media); PDFs are ≤25 MB |
| **mupdf over pdfjs-dist** | Planned `pdfjs-dist + node-canvas` for PDF rendering; `node-canvas` has native build issues in serverless/Next.js environments | Use `mupdf` native bindings — single package, renders PDF pages to pixel buffers directly without canvas dependency |
| **Signed URLs for thumbnails** | Initially proxied all images (thumbnails + full-res) through the API watermark route — slow for grids | Use `createSignedUrls()` batch call in server component for thumbnail grids; only full-res images go through watermark proxy |
| **Preload-all slideshow** | Considered lazy loading or priority queue (MAX_CONCURRENT=3) — caused spinners during navigation | Preload ALL slide images on mount (7-47KB each). Accept rare initial spinner in exchange for instant navigation on every cached slide |
| **In-memory profile cache** | Each watermarked image request queried DB for student name + ID — 120 requests/min per user | Server-side `Map<string, {name, idSuffix, expiry}>` with 5-min TTL. Eliminates DB lookup per image request |
| **Single joined query for image proxy** | Initially separate queries for slide_pages and lesson_slide_decks | Single `slide_pages` query with `lesson_slide_decks!inner(lesson_id)` join — one round trip instead of two |

---

## 11. Open Questions

| Question | Options | Decision | Date |
|----------|---------|----------|------|
| Payment provider | Stripe, Paddle | Pending | - |
| Email service | Resend, SendGrid, Postmark | Pending | - |
| SMS service | Twilio, Telnyx | Pending | - |
| Analytics | Vercel Analytics, PostHog | Vercel Analytics | Feb 2025 |

---

## 12. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Feb 2025 | Initial retrospective PRD |
| 2.0 | Feb 2025 | Restructured following revised template with correct section ordering |
| 2.1 | Feb 2025 | Added gaps from Product_Spec_V3: Authentication section, complete technical constraints, responsive design specs, security audit findings, type safety patterns, database conventions, video embeds, full product backlog (16 items), route protection strategy, external API dependencies, production checklist |
| 2.2 | Feb 2025 | Session 16 bug fixes: FOR ALL + WITH CHECK requirement, bootstrap operations pattern, approved_emails UPDATE policy, pending employee metadata documentation, admin client pattern for privileged server-side operations |
| 2.3 | Feb 2025 | Session 17: Submission form UX fix - show next version number, reset to template after submit, Phase 1 deployment checklist updates |
| 2.4 | Feb 2025 | Sessions 18-19: Sentry integration, Phase 1 mobile responsive fixes (15 bugs), Admin syllabus mobile redesign (3-row module layout, 2-row lesson/assignment layout, icon-only action buttons with large tap targets) |
| 2.5 | Feb 2025 | Session 20: Rate limiting with Upstash Redis - AI feedback endpoints (20/hour generate, 5/hour batch), env-configurable limits, lazy-loaded Redis client |
| 2.6 | Feb 2025 | Session 20: CSRF protection - Origin + Content-Type validation in middleware, verified Supabase SameSite=Lax default, Production Readiness Checklist complete |
| 2.7 | Feb 2025 | Session 22: Code Quality Phase - (1) Testing infrastructure with Vitest + RTL (98 tests, found csv-parser bug), (2) CSP headers in vercel.json, (3) Component refactoring (cohort page: 2,277→746 lines, 67% reduction), (4) RSC migration (lesson viewer), (5) Added Lessons Learned section |
| 2.8 | Feb 2026 | Phase 13: Vector Search / Q&A - Added content_embeddings table + HNSW index, search/embeddings/transcript API endpoints, OpenAI + Upstash env vars, IVFFlat/RLS/CSRF lessons learned, auto-index on save pattern, admin client for permission queries pattern |
| 2.9 | Feb 2026 | Phase 14: Audio/Video Assignments - Added assignment type config (single-select: text/audio/audio_camera/video), max recording duration, browser MediaRecorder with independent mic/camera streams, TUS resumable upload to Supabase Storage, Inngest background transcription via OpenAI Whisper, AI feedback on transcripts, AudioVisualizer (canvas frequency bars), submissions-media storage bucket with RLS, 3 new API endpoints (upload/initiate, confirm, playback-url), Inngest webhook route, AudioContent/VideoContent JSONB shapes, media-specific lessons learned |
| 3.0 | Mar 2026 | Phase 16: Lesson Slides - Added lesson_slide_decks, slide_pages, slide_access_logs tables with RLS; slide-decks storage bucket (private, service-role only); mupdf + Sharp for PDF→WebP processing via Inngest; FormData upload (not TUS — storage admin can't query RLS tables); API proxy with per-student watermarks, rate limiting (120/min), access logging; preload-all slideshow with canvas rendering; signed URLs for thumbnail grids; in-memory profile cache; 4 new API endpoints (slides POST/GET/DELETE, image proxy GET); slide-specific lessons learned (6 items); updated tech stack, constraints, decisions, ERD, backlog, security boundaries, production checklist |
| 3.1 | Mar 2026 | Full-Screen Video Viewer — initial VideoViewer overlay; VideoSection client wrapper; extracted getVideoEmbedUrl; batched createSignedUrls (chunks of 50) for thumbnail loading |
| 3.2 | Mar 2026 | Video Focus View & Chapters — Replaced VideoViewer portal with single expandable VideoSection (CSS `fixed inset-0` toggle); added ChapterList with stub data (5 chapters); postMessage play/pause for YouTube (`enablejsapi=1`) and Vimeo; `forwardRef` on VideoPlayer; `fillContainer` prop with unified DOM structure; `backdrop-filter` containing-block fix; deleted `video-viewer.tsx` |
