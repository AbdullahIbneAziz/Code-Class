# CodeClass

A private homework platform for one teacher and her students. Students log in with a username and password, and the teacher manages their accounts. The site runs on Netlify; accounts, data and files live in Supabase (London). The UI is English only.

Design details: [ARCHITECTURE.md](ARCHITECTURE.md). Live site: https://codeclass-tuition.netlify.app

## What this is

It is a web app written with Next.js (a JavaScript framework; think of it as Flask or Django for the browser, with the pages and the server code in one project). You do not need to know Next.js for day-to-day use. This file covers what you need to run and look after it.

Phase 1 included: username login, forced password change at first login, and a teacher page to add, reset, rename and deactivate students.

Phase 2 included:

- Lectures: the teacher uploads, edits and deletes lectures; students download them.
- Homework: the teacher creates it, schedules when it appears, chooses which students get it, attaches question files, edits it under fixed rules and deletes it.
- UK time entry, with BD time shown beside it on teacher screens.
- Student homework list and detail pages with downloads. Hidden or unassigned homework simply shows "not found".
- Student upload: on time, late, replace until marked, and missed work.
- A student home page with a "pending homework" banner.

Phase 3 (current) includes:

- Marking: a queue of work waiting for a mark, and a mark and comment for each student.
- Solutions: the teacher uploads a solution and students see it under fixed rules.
- Progress: marks, averages and counts for the teacher dashboard and for each student.

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
| `npm run reset-teacher-password` | Set a new temporary password for the teacher |

## Create the teacher account

Run this once per Supabase project, from the project folder:

```
npm run -s create-teacher -- --username miraz --name "Your Name" --password <temp>
```

Replace `<temp>` with a temporary password of at least 8 characters. The `-s` flag stops npm from printing the full command back on screen, which would show the password.

In the Windows Command Prompt (cmd), do not use any of these characters in the password: `<` `>` `&` `|` `^` `%`. cmd treats them as special commands and will cut the password short or fail. Use letters, numbers and characters such as `-`, `_`, `.` or `!` instead (or use PowerShell). You will be forced to choose a new password the first time you log in, so the temporary one is only used once.

## Add / reset / rename / deactivate a student

Log in, then open **Students** (`/teacher/students`).

- **Add:** enter a username (lowercase letters, numbers, underscore; starts with a letter; 3 to 20 characters, for example `student1`), a display name, and a temporary password of at least 8 characters. The temporary password is shown once on screen. Copy it and send it to the family on WhatsApp. If you reload the page it is gone. The student must choose a new password at first login.
- **Reset password:** type a new temporary password in the student's row and press Reset password. It is shown once and the student must change it at next login.
- **Rename:** type the new username in the row and press Rename. The student logs in with the new name from then on.
- **Deactivate:** press Deactivate, then Confirm deactivate. The student can no longer log in, but nothing is deleted. Press Reactivate to undo it.

## I forgot my own password

The Supabase dashboard cannot set a password for you here: no emails are sent in this project (your login address, `miraz@email.com`, is not a real mailbox). Use the reset script instead. It runs on your own computer, which holds `.env.local` with the admin key:

```
npm run -s reset-teacher-password -- --username miraz --password <temp>
```

Replace `<temp>` with a temporary password of at least 8 characters (the `-s` flag stops npm from printing it back). The script only needs the username `miraz`. It works for the teacher account only. Then log in with the temporary password: you will be asked to choose a new one straight away.

## Upload a lecture

Log in, open **Lectures**, fill in the inline **Upload lecture** form with a title and the files. Allowed types are `.ipynb`, `.py`, `.pdf`, `.pptx`, `.png` and `.jpg`, up to 25 MB each. Students see it straight away and can download the files. You can edit the title, add or replace files, or delete the lecture later. Deleting is permanent.

## Create and schedule homework

Open **Homework**, then New homework. Fill in the title, instructions, maximum mark, the **show from** time and the **deadline**, and attach question files (`.ipynb`, `.py`, `.pdf`, `.txt`, `.zip`, up to 25 MB).

- Leave **show from** blank to publish now. Otherwise students cannot see it until that time.
- Every active student is ticked by default. Untick anyone who should not get it.
- New students only get work created after they join. Older homework is not added to them automatically.

## Edit homework after it's published

The database enforces these rules, so the pages cannot get around them.

| What you change | Before anyone has submitted | After someone has submitted |
| --- | --- | --- |
| Title, instructions | Any time | Any time |
| Question file (replace) | Allowed | Allowed, with a warning (see below) |
| Show from | Allowed before it is visible | Locked once visible |
| Deadline later | Allowed | Allowed (late work may become on time) |
| Deadline earlier | Allowed (not before now) | Blocked |
| Maximum mark | Allowed | Locked once any work has been marked |
| Add a student | Allowed | Allowed |
| Remove a student | Allowed | Blocked for a student who has submitted |
| Delete the homework | Allowed | Blocked once anyone has submitted |

Replacing a question file shows this warning: students who already downloaded the old file will not see the change, so tell them in class.

## UK time and clock changes

All times you type are UK time. On teacher screens the same moment in Bangladesh time is shown in grey beside it.

- In March, when the clocks go forward, one hour does not exist (01:00 to 02:00). A time in that hour is refused; choose another.
- In October, when the clocks go back, one hour happens twice. If you pick a time in it, the form asks whether you mean BST (the first time) or GMT (the second).

## What students see

- The home page starts with a banner such as "⚠ You have 2 pending homeworks" ("1 pending homework" for one).
- Each homework shows as pending, on time, late or missed.
- A student uploads a `.ipynb` or `.py` file (up to 5 MB). Before the deadline it counts as on time; after it, late.
- A student can replace their file until you mark it.
- On-time work is locked after the deadline, so it cannot be swapped for a different file later.
- If nothing is uploaded by the deadline, the homework shows as missed.

## Marking

Work waiting for a mark is listed at **Marking** (`/teacher/marking`). The dashboard shows the same list as **Needs marking (N)**.

1. Download the student's notebook first.
2. Type the mark and a comment (up to 2000 characters).
3. Press **Save**.

- If you see "This student uploaded a new version. Please download it again.", the student has uploaded again since you opened the page. Download the new file, then press Save.
- To correct a mark, change it and press **Update mark**.
- Marking locks the student's file. They cannot replace it any more.
- A class test cannot be marked until that student's test has ended. Tests arrive in Phase 4, but this rule is already in place.
- Excused students and deactivated students are not in the queue. You can still mark them from the homework's own page.

## Solutions

On a homework's page, press **Upload solution**. Press **Replace solution** to swap the file later.

A student sees the solution when both of these are true:

1. Their own deadline has passed.
2. They have submitted, they have been excused, or you pressed **Unlock solution for everyone**.

Unlocking cannot be undone. Even after you unlock, each student still waits for their own deadline.

## Progress numbers

The teacher dashboard (**Students at a glance**), the student's home page and the student's **Progress** page (`/progress`) all show the same numbers.

- Late work counts in **Submitted** too.
- Missed work counts as 0%.
- Excused work and work not yet marked are left out of the averages.
- There is no automatic penalty for late work.
- A brand-new student shows zeros and dashes.

## Upload proof

25 October 2026, on the live site (https://codeclass-tuition.netlify.app): a 25 MB lecture file uploaded by the teacher (resumable upload) and a 5 MB notebook uploaded and submitted by a student both worked. All 39 other browser tests for login, students, lectures, homework, submitting and the home page also passed on the live site. Test accounts were removed afterwards.

## Supabase project paused

The free Supabase plan pauses a project after a week with no activity. If the site shows errors or nobody can log in after a quiet spell:

1. Go to supabase.com and open the project.
2. Press **Restore** and wait a few minutes.
3. Try the site again. Nothing is lost.

## Deploying

The site is on Netlify as `codeclass-tuition`. Netlify rebuilds the live site automatically whenever `main` changes on GitHub. Since 25 October 2026 `main` is the production branch, and branch deploys are set to "Deploy only the production branch". You do not need to run a deploy command.

Keep it to a few deploys a month: each deploy uses Netlify credits on the free plan. Check Netlify → Usage now and then. Before merging, run `npm run lint`, `npm test` and `npm run build` so you do not spend a deploy on a broken build.

After a deploy, `BASE_URL=https://codeclass-tuition.netlify.app npm run test:e2e -- login must-change students upload-proof lectures homework-teacher homework-student submit home solutions-teacher marking marking-homework marks-student dashboard progress` runs the browser tests against the live site.

To check the security headers, request a page such as `/login` (for example `curl -sI https://codeclass-tuition.netlify.app/login`). The redirect on `/` has an empty body, so it carries no frame headers, and that is harmless.

Replaced or deleted files stay in storage until the Phase 5 clean-up, so they still count toward the 1 GB budget, but students can no longer open them.

## Running costs

Netlify free plan: 300 credits a month (billing period 22nd to 21st).

- 25 October 2026, after the Phase 1 and Phase 2 deploys plus the live browser tests: **15 credits used** this period (2 builds, about 2,300 web requests, 21 MB bandwidth). Each production deploy costs a few credits, so about 10 deploys a month stays well inside the free limit.
- Supabase: free plan, £0.
