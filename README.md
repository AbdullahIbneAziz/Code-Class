# CodeClass

A private homework platform for one teacher and her students. Students log in with a username and password, and the teacher manages their accounts. The site runs on Netlify; accounts, data and files live in Supabase (London). The UI is English only.

Design details: [ARCHITECTURE.md](ARCHITECTURE.md). Live site: https://codeclass-tuition.netlify.app

## What this is

It is a web app written with Next.js (a JavaScript framework; think of it as Flask or Django for the browser, with the pages and the server code in one project). You do not need to know Next.js for day-to-day use. This file covers what you need to run and look after it.

Phase 1 (current) includes: username login, forced password change at first login, and a teacher page to add, reset, rename and deactivate students.

## Settings you need

Settings live in a file called `.env.local` in the project folder. It is never committed to git. Copy `.env.example` to `.env.local` and fill in the values from supabase.com (Project Settings → API).

| Name | What it is | Secret? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Address of the Supabase project | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public (publishable) Supabase key | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin key; can do anything. Never share it or paste it in chat | Yes |
| `DATABASE_URL` | Database connection string; used only on your computer for tests and `db:push` | Yes |
| `NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN` | Fake email ending used for logins: username `student1` becomes `student1@<domain>` | No |

On Netlify the first four (not `DATABASE_URL`) are already set. `NEXT_PUBLIC_` values are baked in when the site is built, so if you change one, deploy again.

## Run it on your computer

1. Install Node.js 22 (nodejs.org, the LTS version).
2. In the project folder run `npm install`.
3. Create `.env.local` as described above.
4. Run `npm run dev` and open http://localhost:3000.

Useful commands:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the site locally |
| `npm run build` | Production build (what Netlify runs) |
| `npm run lint` | Style and mistake checker |
| `npm test` | Unit tests |
| `npm run test:db` | Database tests |
| `npm run test:api` | API tests |
| `npm run test:e2e` | Browser tests (Playwright) |
| `npm run db:push` | Apply database migrations to Supabase |
| `npm run phase0` | Check that username login works against Supabase |
| `npm run create-teacher` | Create the teacher account |

## Create the teacher account

Run this once per Supabase project, from the project folder:

```
npm run -s create-teacher -- --username miraz --name "Your Name" --password <temp>
```

Replace `<temp>` with a temporary password of at least 8 characters. The `-s` flag stops npm from printing the full command back on screen, which would show the password. You will be forced to choose a new password the first time you log in, so the temporary one is only used once.

## Add / reset / rename / deactivate a student

Log in, then open **Students** (`/teacher/students`).

- **Add:** enter a username (lowercase letters, numbers, underscore; starts with a letter; 3 to 20 characters, for example `student1`), a display name, and a temporary password of at least 8 characters. The temporary password is shown once on screen. Copy it and send it to the family on WhatsApp. If you reload the page it is gone. The student must choose a new password at first login.
- **Reset password:** type a new temporary password in the student's row and press Reset password. It is shown once and the student must change it at next login.
- **Rename:** type the new username in the row and press Rename. The student logs in with the new name from then on.
- **Deactivate:** press Deactivate, then Confirm deactivate. The student can no longer log in, but nothing is deleted. Press Reactivate to undo it.

## I forgot my own password

1. Go to supabase.com and open the CodeClass project.
2. Choose **Authentication → Users**.
3. Find your user (your username followed by the fake email ending, for example `miraz@...`), open it, and set a new password. Do not use "Send password recovery": no emails are sent in this project.
4. Log in to the site with that password. You will be asked to choose a new one straight away.

## Supabase project paused

The free Supabase plan pauses a project after a week with no activity. If the site shows errors or nobody can log in after a quiet spell:

1. Go to supabase.com and open the project.
2. Press **Restore** and wait a few minutes.
3. Try the site again. Nothing is lost.

## Deploying

The site is on Netlify as `codeclass-tuition`. GitHub is not linked for automatic deploys yet, so until then deploy manually from the project folder:

```
npx netlify-cli deploy --build --prod
```

To make Netlify deploy automatically on every push instead: Netlify → Project configuration → Build & deploy → Link repository → AbdullahIbneAziz/Code-Class.

Keep it to about 10 deploys a month: each deploy uses Netlify credits on the free plan. Check Netlify → Usage now and then. Before deploying, run `npm run lint`, `npm test` and `npm run build` so you do not spend a deploy on a broken build.

After a deploy, `BASE_URL=https://codeclass-tuition.netlify.app npm run test:e2e -- login must-change students` runs the browser tests against the live site.

## Running costs

To be filled in after the first deploy (Netlify → Usage baseline).
