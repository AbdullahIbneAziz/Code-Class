# CodeClass: Total Project Introduction

> One document that explains the whole project: what it is, why it exists, what's built, what's next, how it works, and where everything lives.
> **Last updated:** 25 October 2026 (Phase 3 built; deploy pending)
> **Current stage:** Phases 0–2 built, reviewed and live. Phase 3 (marking and progress) built and reviewed; deploy pending. Phase 4 (class tests) is next.

---

## 1. What is CodeClass?

CodeClass is a **private online homework platform** for a small tutoring class.

- The **teacher** lives in **Bangladesh** and teaches **Python and competitive programming**.
- The **students** are in **Class 7** (about 11–12 years old) and live in **England**.
- Classes happen live on **Google Meet**, twice a week.
- Before CodeClass, homework went out as **Jupyter notebooks over WhatsApp**, and came back 2–3 days later, usually done the night before class.

CodeClass replaces the WhatsApp back-and-forth with **one website** where:

- the teacher uploads **lectures**, sets **daily homework** and **timed class tests**, marks work by hand and writes feedback;
- students (and their parents, who share the same login) see **what's pending**, download questions, **upload their notebooks**, and follow their own **progress**.

## 2. Why it exists (the problem)

| Problem before | How CodeClass fixes it |
|---|---|
| Students practised only just before class | **Daily or nearly daily homework**, with a clear "You have N pending homeworks" banner |
| The teacher couldn't see who was keeping up | A teacher dashboard: submitted / late / missed, averages, last login |
| Google Classroom would fill up with daily posts | A clean task list instead of an announcement feed |
| Different time zones (Bangladesh vs UK) | **Everything runs on UK time**. The teacher also sees Bangladesh time in grey. |
| Parents had to ask how their child was doing | Parents use the child's login and see the same progress page |

**Success looks like:** students submit homework on the day it's set, the teacher can see at a glance who's keeping up, and parents can check progress without asking.

## 3. Who uses it

| Role | Who | How they log in |
|---|---|---|
| **Teacher** | One teacher (username `miraz`) | Username + password |
| **Student / parent** | Two students now, possibly a few more later. Each family shares one login. | Username + password, created by the teacher |

- **There is no public sign-up.** Only the teacher creates accounts.
- **No email is ever used.** Logins and updates are shared with families on **WhatsApp**.
- Behind the scenes, every account has a hidden placeholder address `{username}@email.com`. It's needed by the login system (Supabase) but is **never a real inbox** and is never sent anything.

### The password process
1. The teacher creates an account with a **temporary password** and sends it to the family on WhatsApp.
2. At **first login**, the student **must choose their own password** before they can see anything else.
3. Later they can change it any time under **My account**.
4. **Forgotten password:** the family asks the teacher, who resets it to a new temporary password, and the student must choose a new one again at the next login.
5. Passwords must be **at least 8 characters**. This is enforced by the app *and* by Supabase.
6. **If the teacher forgets their own password:** on the teacher's computer (which holds `.env.local`), run `npm run -s reset-teacher-password -- --username miraz --password <temporary>`, then log in and choose a new password. No email is involved, and nothing in the Supabase dashboard should be used for this.

## 4. Features

### ✅ Built (Phases 0–3)
| Feature | Details |
|---|---|
| **Login** | Username + password, with the same error message whatever went wrong ("Username or password is incorrect") |
| **Forced password change** | First login and after a teacher reset |
| **My account** | Change password (current password + new password twice) |
| **Page routing** | Logged-out visitors go to the login page, students to their home, the teacher to the dashboard. Deactivated accounts are signed out. |
| **Teacher → Students page** | Add a student (the temporary password is shown **once**, with a Copy button and "Send this to the family on WhatsApp"), reset a password, rename, deactivate (with a confirmation step) or reactivate, and see each student's last login in UK time |
| **Lectures** | Upload lecture files; students download them with their original names |
| **Homework** | Create and **schedule** homework for chosen students; question files; students upload `.ipynb`/`.py`; on time / **late** / **missed**; the "You have N pending homeworks" banner first on the home page; editing rules after publishing |
| **Marking and progress (Phase 3)** | Marking queue and dashboard "Needs marking"; mark and comment with a "new version" check; Update mark; solutions with the unlock rules; student marks, feedback and Marked tab; progress tiles, `/progress` page and teacher "Students at a glance" |
| **Database and security** | All tables, safety checks, access rules, homework and solution rules, progress calculations, and private file storage. These are already built and tested, ready for the homework screens. |

### ⏳ Planned
| Feature | Phase |
|---|---|
| **Timed class tests** that open at a set time and **close completely** at the end time | **4** |
| Per-student **exceptions** (extra time, moved test, excuse); deleting data **12 months** after a student leaves; dark mode; phone layout | **5** |
| **Backups and a restore test**; the real teacher and student accounts; final checks | **6** |

## 5. Key rules (summary)

The full rules are in [ARCHITECTURE.md](ARCHITECTURE.md) §4.

- **Time:** all times are **UK time** (Europe/London, which handles GMT/BST automatically). Deadline checks use the **database clock**, never the user's computer.
- **Homework:** uploads before the deadline are **on time**. Uploads after it are accepted but marked **late**. No upload after the deadline counts as **missed**. Homework submissions **never close**.
- **Class tests:** questions are hidden until the start time. **At the end time, submission closes completely.** An upload must *finish* before the end time to count.
- **Solutions:** a student sees a solution only after their own deadline **and** after they've submitted (or the teacher unlocks it for everyone, or the item is excused for them).
- **Re-uploads:** allowed until the teacher marks the work. An on-time upload can't be replaced after the deadline.
- **Averages:** marked work plus missed work counted as 0%. Excused and not-yet-marked work isn't counted. There's no automatic penalty for late work.
- **New students** only get work created after they join.

## 6. Project phases and status

| Phase | Name | Status |
|---|---|---|
| 0 | Login proof (username login works on Supabase) | ✅ Done |
| 1 | Foundation | ✅ Done and live |
| 2 | Lectures + homework | ✅ Done and live (25 Oct 2026) |
| 3 | Marking + progress | ✅ Built and reviewed; deploy pending |
| 4 | Class tests | ⏳ |
| 5 | Exceptions + polish | ⏳ |
| 6 | Go-live checks (backups, real accounts) | ⏳ |

**Real student accounts are only created in Phase 6.** Until then, only test accounts (usernames starting with `t_`) are used.

## 7. Technology

Everything runs on **free plans** (target: £0/month).

| Part | Choice |
|---|---|
| Website | **Next.js 16** (React, TypeScript), **Tailwind CSS** |
| Logins, database, file storage | **Supabase** (Postgres), London region |
| Hosting | **Netlify** (free plan). Chosen over Vercel because Vercel's free plan is non-commercial only. |
| Code | **GitHub**: [AbdullahIbneAziz/Code-Class](https://github.com/AbdullahIbneAziz/Code-Class) (public; contains no secrets and no student names) |
| Tests | Vitest (unit, database, API) and Playwright (browser) |

### Live addresses
| What | Where |
|---|---|
| Website (Netlify) | https://codeclass-tuition.netlify.app |
| Supabase project | `codeclass-dev`, London (eu-west-2) |
| Netlify project | `codeclass-tuition` |

## 8. How it works (architecture in brief)

```
 Students / parents (England)        Teacher (Bangladesh)
             └────────── web browser ──────────┘
                │ pages / actions         │ files (direct)
                ▼                          │
     ┌───────────────────────┐             │
     │ NETLIFY: Next.js app   │             │
     │ pages + server actions│             │
     └──────────┬────────────┘             │
                ▼                          ▼
     ┌────────────────────────────────────────┐
     │ SUPABASE (London)                       │
     │ Auth · Postgres (+ access rules) · Storage │
     └────────────────────────────────────────┘
```

- **The browser is never trusted.** Every rule (deadlines, test windows, solution unlocks, "is this yours?") is enforced **inside the database**, not just in the page.
- **Two layers of protection:** normal requests use the logged-in person's own session, so the database's access rules always apply. The powerful admin key is used **only** for account management, and only on the server.
- **Files never pass through Netlify.** Browsers upload to and download from Supabase Storage directly, using download links that expire after **60 seconds**.
- **Students can only ever see their own work**, and deactivated accounts get nothing.

## 9. Privacy and safety

- Only the minimum is stored about each student: username, first name, a scrambled (non-reversible) password, last login time, and their uploads, marks and feedback. No email, age, photo or address.
- Nothing is public. Every page except the login page needs a login.
- Data is held in Supabase's **London** region.
- Security headers stop the site from being embedded inside other websites.
- **Legal paperwork** (lawful basis, DPIA, ICO registration) is the teacher's own responsibility and is outside this project, as the teacher decided.

## 10. Running costs and free-plan limits

| Service | Free limit (approx.) | Expected use |
|---|---|---|
| Supabase database | 500 MB | Under 10 MB a year |
| Supabase storage | 1 GB | About 600 MB per school year |
| Netlify | 300 credits/month | Small. Deploys are the main cost, so keep to about 10 a month. |

- Supabase **may pause** a free project after about 7 days of low activity. Fix: supabase.com → project → **Restore**. No data is lost.
- Your Supabase organisation is at its **2-active-project** free limit. The live (production) project in Phase 6 will need a free slot.

## 11. Where everything is

| Item | Location |
|---|---|
| This introduction | [Total Project Introduction.md](Total%20Project%20Introduction.md) |
| Full design (the binding spec) | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Setup and how-to guide for the teacher | [README.md](README.md) |
| Phase 0–1 build plan | [docs/superpowers/plans/2026-10-24-phase-0-1-foundation.md](docs/superpowers/plans/2026-10-24-phase-0-1-foundation.md) |
| Requirements carried into later phases | [docs/superpowers/carried-requirements.md](docs/superpowers/carried-requirements.md) |
| Supabase dashboard settings (for restores) | [supabase/project-settings.md](supabase/project-settings.md) |
| Database changes (migrations) | [supabase/migrations/](supabase/migrations/) |
| App code | [src/](src/) (pages in `src/app`, logic in `src/lib`, server actions in `src/actions`, routing in `src/proxy.ts`) |
| Scripts (create teacher, database update) | [scripts/](scripts/) |
| Automated tests | [tests/](tests/) (`unit`, `db`, `api`, `e2e`) |
| Approved screen mockups | `.superpowers/brainstorm/…/student-and-teacher.html` (local only, not in Git) |

## 12. Running it on your computer

You need Node.js 22 and the `.env.local` settings file. That file holds the secret keys and is **never** put in Git.

```
npm install          # once
npm run dev          # start the site at http://localhost:3000
npm test             # unit tests
npm run test:db      # database rule tests
npm run test:api     # login / storage / account tests
npm run test:e2e     # browser tests
npm run db:push      # apply new database changes to Supabase
```

To create the teacher account (once): `npm run -s create-teacher -- --username miraz --name "Miraz" --password <temporary>`. The `-s` stops npm repeating the password on screen.

## 13. How the work is done and checked

- Every task is written as a plan first, then built **test-first**, then checked by an **independent reviewer** (security-heavy tasks on the most capable model). Any findings are fixed and re-checked.
- A **final whole-project review** runs before each release.
- About **100 automated tests** cover login, account management, access rules (students can't see each other's data), homework rules, file storage and the browser flows. The tests run against the dev database and clean up after themselves.

## 14. Decisions on record

| Decision | Choice |
|---|---|
| Name / language | CodeClass, English only |
| Logins | Username + password; hidden `{username}@email.com`; no email ever |
| Passwords | Temporary from the teacher → changed at first login; teacher resets; at least 8 characters |
| Features | Per-student exceptions, choosing students per item, scheduling homework in advance, excused students can see solutions: **all yes** |
| New students | Only get work created after they join |
| Data retention | Deleted 12 months after a student leaves |
| Backups | Weekly script on the teacher's computer (PostgreSQL tools, no Docker) |
| Legal paperwork | Outside the project; the teacher's responsibility |
| Hosting | Netlify (free), Supabase London (free) |
| Repository | Public on GitHub; no secrets, no real student names |

## 15. What's next

1. Deploy Phase 3 (marking and progress).
2. Build **Phase 4: class tests.**
3. Continue with Phases 5–6. The students start using the platform once Phases 2 and 3 are done, and real accounts are created in Phase 6.
