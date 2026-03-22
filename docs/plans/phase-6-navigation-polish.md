# Phase 6: Navigation & Polish

**Status:** Planned
**Dependencies:** Phases 4-5 complete (show pages + topic pages exist)
**Estimated Effort:** 2-3 sessions (across 3 implementation steps)
**Product Spec Reference:** Section 5.3 — Navigation Structure, Section 9

---

## Table of Contents

- [Context](#context)
- [Architecture Overview](#architecture-overview)
- [Key Architecture Decisions](#key-architecture-decisions)
- [Visitor Flow](#visitor-flow)
- [Implementation Plan](#implementation-plan)
  - [6A: Top Navigation](#6a-top-navigation)
  - [6B: SEO & Meta Tags](#6b-seo--meta-tags)
  - [6C: Responsive Polish & Footer](#6c-responsive-polish--footer)
- [All Files Summary](#all-files-summary)
- [Verification Plan](#verification-plan)

---

## Context

This phase ties all public pages together with navigation and polishes the user experience. Navigation dropdowns for shows and topics are the primary way visitors discover content beyond the home page.

**Why now:** All content pages exist (home, shows, topics). Navigation needs them to link to.

**Target:** Professional top navigation with show/topic dropdowns. Mobile hamburger menu. SEO metadata. Responsive design polished. Footer. Lighthouse score > 90.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│  All Public Pages                                                 │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐      │
│  │ TopNav (sticky)                                        │      │
│  │ [Logo] [Home] [Shows ▼] [Topics ▼]                    │      │
│  │                                                        │      │
│  │ Shows Dropdown:          Topics Dropdown:              │      │
│  │ ┌──────────────┐        ┌───────────────────┐         │      │
│  │ │ All Shows     │        │ All Topics         │        │      │
│  │ │ ───────────── │        │ ─────────────────  │        │      │
│  │ │ Lenny's Pod   │        │ Leadership (73)    │        │      │
│  │ │ Show 2        │        │ Entrepreneurship   │        │      │
│  │ │ Show 3        │        │ Growth Strategy    │        │      │
│  │ └──────────────┘        │ ...top 20          │        │      │
│  │                          │ ─────────────────  │        │      │
│  │                          │ View All Topics →  │        │      │
│  │                          └───────────────────┘        │      │
│  └────────────────────────────────────────────────────────┘      │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐      │
│  │ Page Content (varies by route)                         │      │
│  └────────────────────────────────────────────────────────┘      │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐      │
│  │ Footer                                                 │      │
│  │ About • Links • "Powered by AI" disclaimer             │      │
│  └────────────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────────┘
```

---

## Key Architecture Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| **Nav component** | Client component (dropdowns need interactivity) | Dropdowns require state for open/close |
| **Nav data loading** | Fetch shows/topics in layout, pass to nav | Single query shared across all pages |
| **Topics in dropdown** | Top 20 by episode count + "View All" link | Too many topics for a single dropdown |
| **Mobile nav** | Hamburger → slide-out menu | Standard mobile pattern |
| **SEO approach** | Next.js metadata API + JSON-LD structured data | Best practice for Next.js 15 |
| **Structured data** | Article schema for episodes, BreadcrumbList | Helps Google understand content structure |

---

## Visitor Flow

### Desktop Navigation

1. See sticky top nav on every page
2. "Home" links to `/`
3. "Shows" dropdown: lists all shows, click any → show page
4. "Topics" dropdown: top 20 topics by episode count, "View All" at bottom
5. Active page highlighted in nav

### Mobile Navigation

1. See hamburger icon (3 lines) on mobile
2. Tap → slide-out menu from left
3. "Home" link
4. "Shows" → expandable accordion showing all shows
5. "Topics" → expandable accordion showing top topics + "View All"
6. Tap outside or X to close

---

## Implementation Plan

### 6A: Top Navigation

*~1-2 sessions. Desktop + mobile navigation with dropdowns.*

#### What Ships

- `TopNav` component (client component):
  - Logo/site name → links to `/`
  - "Home" nav link
  - "Shows" dropdown: fetches shows, lists them with episode counts
  - "Topics" dropdown: fetches top 20 topics by episode count
  - Active state highlighting for current page
  - Sticky positioning
- `MobileNav` component:
  - Hamburger button
  - Slide-out drawer
  - Accordion sections for Shows and Topics
  - Close on outside click or X button
- `NavDropdown` component (reusable):
  - Trigger button with chevron
  - Dropdown panel with links
  - Click-outside to close
  - Keyboard accessible (Escape to close)
- Update root layout to include TopNav
- Fetch shows + topics in layout (server component), pass to TopNav as props

---

### 6B: SEO & Meta Tags

*~0.5-1 session. Search engine optimization.*

#### What Ships

- Next.js metadata API implementation per route:
  - Home: title, description, OG image
  - Show pages: dynamic title/description from show data
  - Topic pages: dynamic title/description from topic data
- `robots.txt` and `sitemap.xml`:
  - Sitemap generated from all show + topic pages
  - `generateSitemaps()` for dynamic routes
- JSON-LD structured data:
  - `WebSite` schema on home page
  - `Article` / `PodcastEpisode` schema on show pages
  - `BreadcrumbList` on all pages
- Open Graph and Twitter Card meta tags
- Canonical URLs

---

### 6C: Responsive Polish & Footer

*~0.5-1 session. Final visual polish.*

#### What Ships

- `Footer` component:
  - About section (brief description of TWITP)
  - Quick links (Home, Shows, Topics)
  - "AI-generated summaries" disclaimer
  - Copyright
- Responsive audit and fixes:
  - Episode cards stack properly on mobile
  - Topic badges wrap correctly
  - Tables scroll horizontally if needed
  - Touch targets minimum 44px
- Loading states:
  - Skeleton cards while loading more episodes
  - Spinner for pagination
- Error pages:
  - Custom 404 page
  - Custom error page
- Performance:
  - Font loading optimization (next/font)
  - Minimal JavaScript bundle (Server Components default)
  - Image optimization for show cover images (next/image)

---

## All Files Summary

### New Files

| File | Purpose | Ships |
|------|---------|-------|
| `src/components/nav/top-nav.tsx` | Main navigation (client) | 6A |
| `src/components/nav/mobile-nav.tsx` | Mobile slide-out menu | 6A |
| `src/components/nav/nav-dropdown.tsx` | Reusable dropdown | 6A |
| `src/components/layout/footer.tsx` | Site footer | 6C |
| `src/app/sitemap.ts` | Dynamic sitemap generation | 6B |
| `src/app/robots.ts` | robots.txt | 6B |
| `src/app/not-found.tsx` | Custom 404 page | 6C |
| `src/app/error.tsx` | Custom error page | 6C |

### Modified Files

| File | Change | Ships |
|------|--------|-------|
| `src/app/layout.tsx` | Add TopNav + Footer, font config | 6A |
| `src/app/page.tsx` | Add metadata export | 6B |
| `src/app/shows/[slug]/page.tsx` | Add dynamic metadata + JSON-LD | 6B |
| `src/app/shows/page.tsx` | Add metadata | 6B |
| `src/app/topics/[slug]/page.tsx` | Add dynamic metadata + JSON-LD | 6B |
| `src/app/topics/page.tsx` | Add metadata | 6B |

---

## Verification Plan

### After 6A

1. Top nav renders on all public pages
2. Shows dropdown lists all shows, links work
3. Topics dropdown shows top 20 topics, "View All" link works
4. Active page highlighted in nav
5. Mobile: hamburger opens slide-out menu
6. Mobile: show/topic accordions expand and link correctly
7. Keyboard: Escape closes dropdowns, Tab navigates

### After 6B

8. `view-source:` shows correct `<title>` and `<meta>` on each page type
9. `/sitemap.xml` lists all show and topic URLs
10. `/robots.txt` allows crawling
11. OG tags render correct previews (test with ogimage.dev or similar)
12. JSON-LD validates (test with Google Rich Results Test)

### After 6C

13. Footer renders on all pages
14. Responsive: all pages look good on 375px, 768px, 1280px widths
15. 404 page renders for invalid URLs
16. Loading states appear during pagination
17. Lighthouse score > 90 (Performance, Accessibility, Best Practices, SEO)
18. **Build check:** `npm run build` passes
