# CodeClass

A private homework platform for a single teacher and her students. Next.js (App Router) on Netlify, Supabase (London) for auth, database and storage. The UI is English only.

Design: see [ARCHITECTURE.md](ARCHITECTURE.md).

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the values (never commit `.env.local`).
3. `npm run phase0` verifies username login against the Supabase project.

Login email is `${username}@${LOGIN_EMAIL_DOMAIN}` (default `email.com`).

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests (`tests/unit`) |
| `npm run test:db` | Vitest database tests (`tests/db`) |
| `npm run test:api` | Vitest API tests (`tests/api`) |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run db:push` | Push migrations to the Supabase database |
| `npm run phase0` | Phase 0 username login proof |
| `npm run create-teacher` | Create the teacher account |
