# ThisWeekInTechPodcasts.com

AI-powered insights from the best tech podcasts. Browse weekly episodes, discover key takeaways, and find episodes worth your time.

## Tech Stack

- **Frontend:** Next.js 16 (App Router, Server Components, ISR)
- **Database:** Supabase (PostgreSQL + pgvector)
- **AI:** Anthropic Claude + OpenAI APIs
- **Styling:** Tailwind CSS 4
- **Hosting:** Vercel

## Getting Started

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.local.example .env.local
# Fill in your Supabase, API keys, etc.

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── admin/              # Admin UI (password-protected)
│   ├── shows/              # Show pages
│   ├── topics/             # Topic pages
│   └── api/                # API routes
├── components/             # React components
├── lib/                    # Server-side utilities
│   ├── supabase/           # Supabase clients (server, browser, admin)
│   ├── ai/                 # AI extraction pipeline
│   └── transcripts/        # Transcript file parser
└── types/                  # TypeScript types
```

## Documentation

See `../docs/` for product spec and implementation plans.
