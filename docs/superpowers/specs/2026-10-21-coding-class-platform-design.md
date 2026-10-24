# Coding Class Platform: Design

Date: 2026-10-21
Status: **Superseded** by [ARCHITECTURE.md](../../../ARCHITECTURE.md) (v2, 2026-10-24). Kept for history only.

## 1. Intent and why

The teacher lives in Bangladesh and teaches competitive programming in Python to two Class 7 students (about 11–12 years old) who live in England. Classes run on Google Meet twice a week. At the moment homework goes out as Jupyter notebooks, and students hand it back 2–3 days later, usually all at once just before the next class. The teacher can't see whether they practise between classes.

The fix is a small private website that:

- gives out homework **daily or nearly daily**, so practice happens between classes and not the night before;
- shows students and parents straight away what's pending, what's late and how they're doing;
- gives the teacher one place to hand out work, collect it, mark it by hand, comment on it and track each student over time.

Google Classroom was considered and rejected. Daily homework would bury it in posts, and it doesn't give the at-a-glance progress view wanted here.

**Success:** students submit homework on the day it's set, the teacher can see at a glance who is keeping up, and parents can check progress without asking the teacher.

## 2. Users and roles

| Role | Who | How they get access |
|---|---|---|
| Teacher | One person (the owner) | Single teacher account |
| Student | Two students now, possibly a few more later | Teacher creates the account. **The parent uses the same login as the student** (the teacher shares the login with the parents). |

- There is no public sign-up. Only the teacher can create student accounts. *(builder call, agreed in spirit: "they will have accounts", "I will share the accounts with the parents")*
- A separate parent role is **not** needed; parents and students share one view.

## 3. Goals

### Teacher can
1. **Upload lectures**: files such as notebooks, PDFs and slides, each with a title and optional description. Students can download them at any time.
2. **Create homework**: title, instructions, one or more attached files (usually a `.ipynb` with 5–10 questions), a deadline, and the maximum mark.
3. **Create class tests**: title, attached question file(s), a **start time**, an **end time** and the maximum mark.
4. **Upload a solution file** for any homework or class test.
5. **Mark submissions by hand**: download each student's submitted file, enter a mark and a written feedback comment, then save. No auto-marking.
6. **See a dashboard** with:
   - a "Needs marking" queue of submissions not yet marked;
   - per-student totals: submitted, late, missed, homework average %, class test average %, last login;
   - for each homework or test: who submitted on time, who was late, who hasn't submitted, and whether the solution is uploaded or released.
7. **Release a solution to everyone** with one button, overriding the "unlock after submitting" rule below.

### Student / parent can
1. On logging in, see a **clear "You have N pending homeworks" banner** and the pending list straight away, before anything else.
2. Download lectures, homework files and class test files (test files only once the test has started).
3. Upload their completed work (`.ipynb` or `.py`) for a homework or class test.
4. See their own progress: number submitted, late and missed, homework average, class test average.
5. See marks and teacher feedback on each marked item.
6. See and download a solution once it's unlocked for them (see rules).

## 4. Rules

### Time
- **All times on the platform are UK time** (Europe/London, which handles the change between GMT and BST). The teacher enters deadlines in UK time and everyone sees UK time, including the teacher in Bangladesh.

### Homework deadlines
- Before the deadline: the student can upload, and an upload is **on time**.
- After the deadline: **submissions stay open**. An upload is accepted and labelled **Late**.
- A homework with no submission after its deadline counts as **Missed**. If the student later submits it, it changes from Missed to Late.

### Class test deadlines
- Before the start time, students can see the test is coming (title and time window) but **cannot download the question files**.
- Between start and end, students can download the questions and upload their answer.
- **At the end time, submission closes completely.** No late uploads. A test without a submission counts as Missed.
- Time checks must be enforced on the server, not just hidden in the page.

### Solutions
- The teacher can upload a solution file at any time, but students only ever see it once **both** of these are true:
  - the deadline (homework) or end time (class test) has passed, **and**
  - this student has submitted, **or** the teacher has pressed "Release solution to everyone".
- A student who hasn't submitted sees "Submit your homework to unlock the solution".
- Solution files must be protected on the server (not just hidden from view) so a student can't fetch them early.

### Resubmission *(builder call)*
- A student may replace their upload until the teacher marks it. The latest upload is the one that counts, and its on-time/late status depends on when that latest upload happened. *Note: replacing an on-time upload after the deadline would make it late. Simplest acceptable behaviour: after the deadline, block replacing an upload that was on time.*
- Once marked, the submission is locked.

### Averages *(builder call)*
- Homework average = mean of (mark / max mark) over **marked** homeworks. Missed homeworks count as 0% once their deadline has passed. Late work is marked normally (no automatic penalty; the teacher can lower the mark by hand).
- Class test average is worked out the same way.

## 5. Non-goals (not in this version)
- Auto-marking or running student code on the platform.
- An in-browser code editor.
- Live proctoring. Tests run during or alongside the Google Meet class.
- A separate parent login or role.
- Notifications by email, push or SMS.
- Payments, scheduling or video. Google Meet stays as it is.
- Multiple teachers or multiple classes.

## 6. Anti-goals (failure even if it "works")
- Students see a solution before submitting (unless the teacher released it).
- A class test accepts an upload after its end time.
- Times shown in the wrong time zone, or shifted by an hour around the change to or from British Summer Time.
- Any student can see another student's work, marks or feedback.
- Anything is publicly visible without logging in.
- It costs money to run.
- It's cluttered. The student's first screen must make "what do I need to do now?" obvious.

## 7. Constraints
- **Free to run.** No paid tiers, not even cheap ones (the teacher's explicit requirement).
- **Stack (teacher's choice):** Supabase (auth, Postgres, file storage) + a Next.js web app hosted on **Netlify** (free plan). Vercel was ruled out because its free Hobby plan only allows non-commercial use and this is paid tutoring.
- Supabase free plan limits: 50 MB per upload, about 1 GB of storage, and the project pauses after 7 days without activity. Daily use keeps it awake. Document how to un-pause it.
- **Children's data (UK):** store only what's needed (display name and login). No photos, no ages, no addresses. Keep everything private behind login. Secure by default: storage buckets are private and access is controlled by Supabase Row Level Security, with downloads through signed URLs.
- Works well on a laptop browser and is usable on a phone or tablet.
- UI language is English.

## 8. Screens (agreed from wireframes)

**Student / parent home:** top nav (Home, Homework, Class Tests, Lectures, My Progress), a red pending banner, cards for pending homework (title, deadline, Download, Upload, Late label), the next class test with its exact window, progress tiles (Submitted, Late, Missed, HW avg, Test avg), and recently marked items with mark, comment and a "View solution" button.

**Teacher dashboard:** buttons for "+ New homework", "+ New class test" and "+ Upload lecture"; a "Needs marking" list where each item has Download notebook, a mark box, a feedback box and Save; a "Students at a glance" table (submitted, late, missed, HW avg, test avg, last login); and per-homework status with a "Release solution to everyone" button.

The other pages (homework list, test list, lectures, progress history, student management) follow the same simple style.

## 9. Left to the builder
- Visual design, component library and styling. Keep it clean and calm.
- Database schema, Row Level Security policies and storage layout.
- Whether to use server actions, API routes or Supabase Edge Functions for time-checked uploads, as long as the deadline rules are enforced on the server.
- How the teacher account is set up on first run (seed script, env-configured email, etc.).
- How the teacher creates or resets student logins (username/email + password).
- Testing approach.
- A short README covering setup, deployment to Netlify and connecting to Supabase, written for a teacher who knows Python but may not know Next.js.
