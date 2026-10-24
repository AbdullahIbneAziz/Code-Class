# CodeClass: Project Architecture

> A private homework and class test platform for a small Python / competitive-programming class.
> **Status:** **v2.2: APPROVED by the teacher on 24 Oct 2026.** Nothing has been built yet.
> **Date:** 24 October 2026 (v1: 21 October 2026; v2: 24 October 2026)

**How to review this document**
- Items marked **✅ DECIDED** are your answers. They're all listed in [§19](#19-decisions).
- Items marked **🔵 MY CALL** are decisions I made because they didn't seem to need your input. Change any you disagree with.
- Everything else is what you already told me.
- Add your comments anywhere (for example `> COMMENT: ...`) or send them in chat.

**What changed in v2** (after a design review)

| # | Problem in v1 | Fixed in |
|---|---|---|
| 1 | Username login wasn't possible as described (Supabase Auth needs an email or phone) | §2.1 |
| 2 | "Two layers of protection" wasn't true, because the admin key skips the database's access rules | §8, §11 |
| 3 | Uploads through the Netlify server can't carry 5–25 MB files | §8.2, §10 |
| 4 | It wasn't clear when a test upload "counts" if it finishes after the end time | §4.3, §9.4 |
| 5 | A marked late homework would disappear from the "Late" count | §9.2 |
| 6 | Excused students and solutions: two sections disagreed | §4.4, §19 |
| 7 | CSV export isn't a real backup | §14 |
| 8 | No rules for editing a homework or test after it's published | §4.8 |
| 9 | Clock-change days need special handling in forms | §12 |
| 10 | File validation and clean-up weren't defined | §10 |
| 11 | "£0 guaranteed" was too strong; Netlify's free plan is credit-based | §15 |
| 12 | The children's-data section was too thin | §13 |
| — | Plan and tests didn't prove the risky parts before going live | §16, §17 |

**What changed in v2.1** (after a second review)

| # | Problem in v2 | Fixed in |
|---|---|---|
| 1 | `.invalid` login emails may be refused by Supabase; rate limit is per IP address | §2.1, Phase 0 (§16) |
| 2 | Hiding the sign-up page doesn't switch off Supabase's public sign-up API | §2.1, §14, §17 |
| 3 | `now()` is fixed when the transaction starts, so a call waiting for the lock could pass the deadline check after the deadline | §4.3, §9.4 |
| 4 | The teacher could skip the §4.8 editing rules or delete files by calling Supabase directly | §8.1, §9.3, §11 |
| 5 | Marking could miss a re-upload, because the submission row is reused | §8.4, §9.1 |
| 6 | "Contract" isn't a safe lawful-basis recommendation; a DPIA is required | §13, §16, §19 |
| 7 | The backup/restore recipe didn't match Supabase's actual process | §14 |
| 8 | Deactivation isn't instant for download links that were already created | §2.1 |
| 9 | Wrong date in the spring clock-change test | §17.3 |

**What changed in v2.2** (teacher's answers, 24 Oct 2026): all decisions answered (§19); backups use PostgreSQL client tools instead of Docker (§14.1); legal paperwork moved outside the project at the teacher's request, so the pre-launch legal gate and privacy pages are removed (§13, §16).

---

## Contents

1. [Why we are building this](#1-why-we-are-building-this)
2. [Who uses it](#2-who-uses-it)
3. [What it does (features)](#3-what-it-does-features)
4. [Rules](#4-rules)
5. [What it will NOT do (for now)](#5-what-it-will-not-do-for-now)
6. [Screens](#6-screens)
7. [Technology](#7-technology)
8. [System architecture](#8-system-architecture)
9. [Database design](#9-database-design)
10. [Files: types, sizes, storage and clean-up](#10-files-types-sizes-storage-and-clean-up)
11. [Access control (who can do what)](#11-access-control-who-can-do-what)
12. [Time zone handling](#12-time-zone-handling)
13. [Children's data and privacy](#13-childrens-data-and-privacy)
14. [Backups and recovery](#14-backups-and-recovery)
15. [Free-plan limits and capacity budget](#15-free-plan-limits-and-capacity-budget)
16. [Build plan (phases)](#16-build-plan-phases)
17. [Testing](#17-testing)
18. [Risks and how we handle them](#18-risks-and-how-we-handle-them)
19. [Decisions](#19-decisions)

---

## 1. Why we are building this

The teacher is in **Bangladesh** and teaches two **Class 7** students in **England** over Google Meet, twice a week. Homework goes out as Jupyter notebooks and comes back 2–3 days later, usually done the night before class. The teacher can't see whether the students practise between classes.

The platform fixes this by:

- giving homework **daily or nearly daily**, so practice happens between classes;
- showing students and parents **straight away** what's pending, what's late and how they're doing;
- giving the teacher **one place** to hand out work, collect it, mark it by hand, give feedback and track progress.

Google Classroom was rejected because daily homework would flood it with posts, and it doesn't show progress at a glance.

**Success looks like:** students submit homework on the day it's set, the teacher can see at a glance who is keeping up, and parents can check progress without asking.

---

## 2. Who uses it

| Role | Who | Access |
|---|---|---|
| **Teacher** | You (one account, username `miraz`) | Full control |
| **Student** | 2 students now, maybe a few more later | The teacher creates the account. **Parents use the same login** as their child (your choice). |

- There is **no public sign-up page**. Only the teacher can create accounts.
- **Trade-off of the shared login (your choice, kept):** the platform can't tell whether the student or the parent did something, such as an upload. Every action is recorded as "the student".

### 2.1 How student username login works

Supabase Auth only logs people in with an **email or phone number**, not a bare username. So:

- 🔵 **MY CALL:** Each student gets a hidden **internal login email** on a **mail domain the teacher controls**. Supabase refuses example and test domains (`email_address_invalid`), so reserved endings like `.invalid` aren't used.
  - ✅ **DECIDED (teacher's choice):** **placeholder addresses** in the pattern `{username}@email.com`, for **everyone, including the teacher**:

    | Person | Username typed at login | Hidden address |
    |---|---|---|
    | Teacher | `miraz` | `miraz@email.com` |
    | Student | `student1` | `student1@email.com` |
    | Student | `student2` | `student2@email.com` |

  - These are **not real inboxes** and are **never used for email**. The teacher shares logins and updates with families over **WhatsApp**.
  - **The platform never sends any email** (§2.2). This matters because `email.com` is a real provider, so a sent email could reach a stranger.
  - The domain (`email.com`) is a single setting (`NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN`), not hard-coded. If Supabase refuses it in the Phase 0 proof, or it ever needs changing, only that setting and the stored addresses change, and usernames stay the same.
  - **Nobody but the teacher ever sees or types these addresses.**
  - **Proved before any build work** (Phase 0, §16): on a throwaway Supabase project, create a user with this address, sign in, rename the username, and reset the password. If any step fails, we stop and choose again.
- **Logging in:** the student types `ayaan` and a password. The login page turns that into the internal address and logs in through Supabase Auth **directly from the browser**. Usernames aren't secret, so no lookup table or server endpoint is needed.
- **Wrong details:** the page always shows the same message, *"Username or password is incorrect"*. It never says whether the username exists.
- **Too many attempts:** Supabase Auth's built-in rate limit on password logins applies **per IP address**. The browser talks to Supabase directly, so each home's attempts are counted separately.
- **Public sign-up switched off:** having no sign-up *page* isn't enough, because Supabase's sign-up API is public by default. The Supabase setting **"Allow new users to sign up" is turned OFF**. The teacher's admin-key account creation still works with it off; this is checked in Phase 0 and in the access tests (§17), and the setting is part of the restore steps (§14).
- **Creating a student** (teacher only): the server uses the admin key to create the Auth user with the internal email, mark it as confirmed (so no email is sent), and create the matching `profiles` row in the same step.
- **Passwords: the teacher's process (decided 24 Oct 2026):**
  1. The teacher creates the account with a **temporary password** and sends the username and password to the family on **WhatsApp**.
  2. At **first login**, the student **must set their own password** before they can see anything else (a "Choose your new password" screen).
  3. Afterwards they can change it any time from **My account → Change password**. They type the current password, then the new one twice.
  4. **Forgotten password:** the family asks the teacher on WhatsApp. The teacher uses **Students → Reset password** (admin key, server only) to set a new temporary password and sends it on WhatsApp. At the next login the student must choose a new password again (step 2).
- **How the "must change" step works:** `profiles.must_change_password` is set to `true` when an account is created or reset. While it's `true`, every page redirects to `/account/new-password`. The password change runs through a server action: it checks the current password, updates it in Supabase Auth with the user's own session, and only then clears the flag.
- **Password rule:** at least 8 characters, and it can't be the same as the temporary one.
- 🔵 **MY CALL:** Supabase's "secure password change" option (which asks for an **email** code) stays **off**, because there's no email. Asking for the current password does the same job.
- **Teacher password reset:** no email either. The teacher logs in to **supabase.com** with their own Supabase account, opens **Authentication → Users**, and sets a new password for `miraz`. The README has the steps.
- **Deactivating a student:** two steps, both needed:
  1. The Auth user is **banned**, so they can't log in again or refresh their session.
  2. `profiles.is_active = false`. Every database and storage access rule checks this, so database and file requests from a session that was already open are refused **straight away**, not when the session expires (up to 1 hour later).
  - **One limit:** a download link created **before** deactivation keeps working until it expires, **at most 60 seconds** (§8.3). Supabase can't cancel a signed link early. This is tested (§17.2).
  - History is kept. Reactivating reverses both steps.
- **Renaming a username:** the teacher changes it, and the server updates the internal email to match. The admin key marks the new address as confirmed, so no confirmation email is sent.

### 2.2 No email, ever
- Supabase's **"Confirm email"** setting is **OFF**, and every account is created already confirmed by the admin key.
- The app has **no** "forgot password", magic-link or email-change screens.
- Public sign-up is OFF (§2.1), so nobody can trigger a sign-up email.
- **No custom mail server (SMTP) is ever set up.** Supabase's built-in mailer only delivers to addresses of members of the project's own Supabase team, so even if a Supabase email feature were triggered by mistake, it couldn't reach a stranger's `@email.com` inbox.
- App code never calls `signUp`, `resetPasswordForEmail`, `signInWithOtp` or an email-change API. A test checks for this (plan Task 3).
- These settings go into `project-settings.md` for restores (§14.1), and the access tests (§17.2) check that the password-reset and magic-link API calls send nothing to these addresses.

---

## 3. What it does (features)

### 3.1 Teacher

| # | Feature | Details |
|---|---|---|
| T1 | **Upload lectures** | Title, optional description, one or more files (types in §10.1). Students can download them at any time. |
| T2 | **Create homework** | Title, instructions, question file(s) (usually a notebook with 5–10 questions), **deadline**, **maximum mark**. |
| T3 | **Create class test** | Title, question file(s), **start time**, **end time**, maximum mark. |
| T4 | ✅ **DECIDED: Schedule in advance** | Each homework has a **"show from"** time (e.g. *Tue 9:00 AM*). Before that, students can't see it. You can set up a whole week in one sitting. Leave it blank to publish straight away. |
| T5 | ✅ **DECIDED: Choose students** | Every active student is ticked by default. Untick anyone who shouldn't get it. |
| T6 | **Upload solution** | Attach a solution file at any time. Students only see it under the rule in §4.4. |
| T7 | **Unlock solution for everyone** | One button: lets students who **didn't** submit see the solution too. It still waits for each student's own deadline (§4.4). |
| T8 | **Mark by hand** | A "Needs marking" list. For each submission: **Download notebook**, type a **mark** and a **feedback comment**, then **Save**. No auto-marking. |
| T9 | ✅ **DECIDED: Exceptions per student** | For one student on one item: **extend the deadline**, **move the test window** (e.g. the student was ill), or **excuse** it so it doesn't count. |
| T10 | **Teacher dashboard** | "Needs marking" queue, students-at-a-glance table, status of each item, and **"Last backup: N days ago"** (§14). |
| T11 | **Manage students** | Create, reset password, rename, deactivate or reactivate (§2.1). |
| T12 | **Export one student's data** | A zip of one student's profile, marks, feedback and uploaded files, for a family's data request (§13). |

### 3.2 Student / parent

| # | Feature | Details |
|---|---|---|
| S1 | **Pending banner** | The first thing after login: *"⚠ You have 2 pending homeworks"* and the list below it. |
| S2 | **Download** | Lectures, homework questions, and test questions (test questions only after the test starts). |
| S3 | **Upload work** | `.ipynb` or `.py`, for homework or a test. |
| S4 | **My progress** | Submitted, Late and Missed counts, homework average %, class test average %. |
| S5 | **Marks and feedback** | The mark and teacher comment on each marked item. |
| S6 | **Solutions** | Visible and downloadable once unlocked (§4.4). |
| S7 | **My account** | Change password (current password + new password twice). The first login, and the first login after a teacher reset, go straight to "Choose your new password" (§2.1). The teacher has the same page. |

---

## 4. Rules

### 4.1 Time
- **All times on the platform are UK time** (Europe/London, which switches automatically between GMT and BST). The teacher enters and sees times in UK time, even from Bangladesh. See §12.
- "Now" always means **the database server's clock**, never the student's or teacher's computer clock. Functions that check deadlines read the actual current time (`clock_timestamp()`) **after** taking their lock, not the transaction start time (`now()`). See §9.4.

### 4.2 Homework deadlines

| When the submission is saved | Result |
|---|---|
| Before the student's deadline | ✅ **On time** |
| At or after the deadline | ⚠ Accepted, counts as **Late** |
| Never, and the deadline has passed | ❌ **Missed** (becomes **Late** once they submit) |

- Homework submissions **never close**.
- "The student's deadline" means the homework deadline, or their personal extension if they have one (§4.6).
- 🔵 **MY CALL:** Lateness is **worked out each time it's shown, not stored**. It compares the submission time with the student's current deadline. If you give an extension after a late submission, it becomes on time. This is deliberate, and §4.8 limits which deadline changes are allowed.

### 4.3 Class test deadlines

| When | What the student sees or can do |
|---|---|
| Before the start time | The test's title and time window. **Can't download questions.** |
| Between start and end | Download questions, upload answers. |
| At or after the end time | **Submission closed completely.** No submission means **Missed**. |

**When does a test upload count? (one rule, used everywhere):**
A test submission counts **only if it is accepted at final validation before the student's end time.**

- **Final validation** is the moment `finalize_submission` (§9.4) reads the database clock **after** it has the lock and **before** it writes anything. The upload must already be finished by then.
- That one reading is used for **both** the deadline check **and** `submitted_at`, so the stored time can never say 4:59 for a submission accepted at 5:00.
- The write and commit happen a few milliseconds after that moment. The rule is defined as **"accepted at final validation"**, not "committed before the deadline", because a commit time can't be checked inside the transaction it belongs to.
- So an upload that starts at 4:59:50 and finishes at 5:00:05 is **rejected**. A finalize call that starts at 4:59:59 but has to wait for the lock until 5:00:01 is also **rejected**. There is no grace period, matching your "complete shutdown" rule.

To make this fair, the test page shows a countdown and warns at **10, 5 and 1 minutes**: *"Upload now. Uploads that finish after 5:00 PM will not be accepted."* It also shows the upload's progress. A notebook under 1 MB uploads in a few seconds.

These checks run **on the server and in the database**, never just in the page.

### 4.4 Solutions

**One rule, used for both the page and the file download.** A student can see a solution when **all** of these are true:

1. a solution file has been uploaded, **and**
2. the student's own deadline / end time **has passed**, **and**
3. **at least one** of:
   - they have submitted, **or**
   - the teacher pressed **"Unlock solution for everyone"**, **or**
   - ✅ **DECIDED:** the item is **excused** for them.

Otherwise they see *"Submit your homework to unlock the solution."*

- 🔵 **MY CALL:** "Unlock solution for everyone" **does not** skip the deadline. Students still wait until their own deadline passes. A student with an extension doesn't see it early, so they can't copy it.

### 4.5 Re-uploading
- 🔵 **MY CALL:** A student can **replace** their upload any number of times **until the teacher marks it**. After that it's locked.
- 🔵 **MY CALL:** After their deadline, a student **can't replace** an upload that was on time. This stops an on-time submission from turning late by accident and stops anyone from swapping in a copy of the solution.
- **Class tests:** replacing is allowed only inside the test window.

### 4.6 Exceptions for one student (if Decision 1 = yes)
- **Extend deadline** (homework) / **move window** (test): sets a personal deadline or window for that student only. Allowed at any time, including after the original deadline.
- **Excuse:** the item disappears from that student's pending list and doesn't count in their counts or averages. If they'd already submitted, the submission is kept but ignored in averages. Excusing can be undone.
- If a student already has a **mark** and their deadline then changes, the mark stays. Only the late/on-time label is recalculated (§4.2).
- Solution access always follows §4.4 using the **student's own** deadline.

### 4.7 Students who join later
- ✅ **DECIDED:** A new student only gets homework and tests **created after they join**. Older work never counts as "missed" for them. You can still add them to an older item by hand.

### 4.8 Editing a homework or test after it's published

| What you change | Before anyone has submitted | After someone has submitted |
|---|---|---|
| Title, instructions | ✅ Any time | ✅ Any time |
| Question file (replace) | ✅ | ✅ Allowed with a warning: *"Students who already downloaded the old file won't see the change. Tell them in class."* |
| "Show from" time | ✅ Before it's visible | ❌ Locked once visible |
| **Homework deadline: later** | ✅ | ✅ (late submissions may become on time) |
| **Homework deadline: earlier** | ✅ (not before now) | ❌ Blocked. Use a per-student exception instead. |
| Test start / end time | ✅ Before the test starts | Only **extending the end** while the test runs (e.g. technical problems). Everything else is locked. Use per-student exceptions after that. |
| Maximum mark | ✅ | ❌ Locked once **any** submission has been marked |
| Add a student | ✅ | ✅ |
| Remove a student | ✅ | ❌ If that student has submitted, excuse them instead |
| Solution file | ✅ Any time | ✅ Any time |
| Delete the whole item | ✅ | ❌ Blocked once anyone has submitted |

**These rules are enforced by the database, not only by the edit pages.** The teacher has **no direct write access** to `assignments`, `assignment_files`, `assignment_students` or `submissions`. Every change goes through a checked database function (`update_assignment`, `set_exception`, `attach_file`, `replace_file`, … in §9.3) that applies this table. So calling Supabase directly from the teacher's session can't get around it (§11).

**Database safety checks** (the database refuses bad data even if the page has a bug):
- `max_marks > 0`
- `0 ≤ mark ≤ max_marks`
- homework: `visible_from ≤ due_at`
- test: `visible_from ≤ opens_at < due_at`
- overrides: `opens_at_override < due_at_override` when both are set

### 4.9 How counts and averages are worked out

Each *(student, item)* pair has **separate facts** (§9.2), and the counts come from those facts, not from a single display label:

| Number shown | Counts items where... |
|---|---|
| **Submitted** | the student has a submission, **including late and marked ones** |
| **Late** | the submission is late. **Late is part of Submitted**, so a late homework counts in both. |
| **Missed** | no submission and the student's deadline has passed |
| **Pending** | visible, not excused, no submission, deadline not passed yet |

- 🔵 **MY CALL:** Homework average = mean of *(mark ÷ maximum mark)* over **marked** items, plus **missed** items counted as **0%**.
- **Not counted:** excused items, and submitted items that aren't marked yet.
- Late work has **no automatic penalty**. If you want to lower the mark, do it by hand.
- Class test average works the same way.

---

## 5. What it will NOT do (for now)

- ❌ Auto-marking or **running student code**. Uploaded `.py` and `.ipynb` files are **stored and downloaded only**. The platform never runs or displays them as live pages.
- ❌ An in-browser code editor
- ❌ Live proctoring (tests run alongside your Google Meet class)
- ❌ Separate parent accounts
- ❌ Email, SMS or push notifications
- ❌ Payments, class scheduling or video
- ❌ More than one teacher or class

**It would count as a failure, even if it "works", if:**
- a student sees a solution before §4.4 allows it;
- a class test accepts a submission saved at or after its end time;
- times show in the wrong zone, or shift by an hour when the clocks change;
- one student can see another student's work, marks or feedback;
- anything is visible without logging in;
- it needs a paid plan to keep running at this class size;
- data is lost with no way to restore it;
- the student's first screen doesn't make *"what do I need to do now?"* obvious.

---

## 6. Screens

The two main screens were approved from wireframes on 21 Oct 2026.

### 6.1 Student / parent home

```
┌───────────────────────────────────────────────────────────────────┐
│ CodeClass   Home | Homework | Class Tests | Lectures | My Progress │
├───────────────────────────────────────────────────────────────────┤
│ ⚠ You have 2 pending homeworks                                    │
│                                                                   │
│ PENDING                                                           │
│ ┌───────────────────────────────────────────────┐                 │
│ │ HW 14: Prefix sums (6 questions)              │                 │
│ │ Due today, 8:00 PM          [Download] [Upload] │               │
│ └───────────────────────────────────────────────┘                 │
│ ┌───────────────────────────────────────────────┐                 │
│ │ HW 13: Two pointers   LATE, was due yesterday │                 │
│ │                                    [Upload]   │                 │
│ └───────────────────────────────────────────────┘                 │
│ UPCOMING CLASS TEST                                               │
│   Class Test 4: Sorting, Sat 25 Oct, 4:00–5:00 PM                 │
│                                                                   │
│ MY PROGRESS                                                       │
│  [11 Submitted] [2 Late] [1 Missed] [82% HW avg] [75% Test avg]   │
│                                                                   │
│ RECENTLY MARKED                                                   │
│   HW 12: Binary search, 8/10                                      │
│   "Good work. Q7 fails on an empty list."     [View solution]     │
└───────────────────────────────────────────────────────────────────┘
```

### 6.2 Teacher dashboard

```
┌───────────────────────────────────────────────────────────────────┐
│ CodeClass Teacher  Dashboard | Homework | Tests | Lectures | Students │
├───────────────────────────────────────────────────────────────────┤
│ [+ New homework] [+ New class test] [+ Upload lecture]            │
│ Last backup: 3 days ago ✓                                          │
│                                                                   │
│ NEEDS MARKING (3)                                                 │
│  HW 13, Ayaan (late)  [Download] [mark /10] [comment...] [Save]   │
│  HW 13, Zara          [Download] [mark /10] [comment...] [Save]   │
│                                                                   │
│ STUDENTS AT A GLANCE                                              │
│  Student │ Submitted │ Late │ Missed │ HW avg │ Test avg │ Last login │
│  Ayaan   │    11     │  2   │   1    │  82%   │   75%    │ Today 6:40 │
│  Zara    │    13     │  0   │   0    │  91%   │   88%    │ 3 days ago │
│                                                                   │
│ HW 13: Two pointers (due yesterday 8:00 PM UK · 1:00 AM BD)       │
│  Ayaan: late · Zara: on time · Solution: uploaded                 │
│  [Unlock solution for everyone]  [Exceptions...]                  │
└───────────────────────────────────────────────────────────────────┘
```

### 6.3 All pages

| Who | Page | URL |
|---|---|---|
| Everyone | Login | `/login` |
| Everyone | Choose new password (forced after first login or reset) | `/account/new-password` |
| Everyone | My account: change password | `/account` |
| Student | Home (pending banner, progress, recent marks) | `/` |
| Student | All homework (pending / submitted / marked tabs) | `/homework` |
| Student | One homework: download, upload, mark, feedback, solution | `/homework/[id]` |
| Student | All class tests | `/tests` |
| Student | One test: countdown, download, upload, result | `/tests/[id]` |
| Student | Lectures | `/lectures` |
| Student | My progress (full history table) | `/progress` |
| Teacher | Dashboard | `/teacher` |
| Teacher | Homework list / create / edit | `/teacher/homework`, `/teacher/homework/new`, `/teacher/homework/[id]` |
| Teacher | Class test list / create / edit | `/teacher/tests`, `/teacher/tests/new`, `/teacher/tests/[id]` |
| Teacher | Marking queue | `/teacher/marking` |
| Teacher | Lectures | `/teacher/lectures` |
| Teacher | Students (create, reset password, rename, deactivate, history, export) | `/teacher/students`, `/teacher/students/[id]` |

🔵 **MY CALL:** The design is clean and calm, with a light theme and a dark theme. It works on laptops first but is still usable on a phone or tablet.

---

## 7. Technology

All of these have free plans. You chose Supabase and Netlify, and I picked the rest.

| Part | Choice | Why |
|---|---|---|
| Website framework | **Next.js** (React, TypeScript) | Works with Netlify and Supabase. One project handles both pages and server logic. |
| Styling | **Tailwind CSS** | Fast to build a clean, consistent look. |
| Logins | **Supabase Auth** | Secure password handling (§2.1). |
| Database | **Supabase Postgres** | Access rules enforced inside the database (Row Level Security, §11). |
| File storage | **Supabase Storage** | Private buckets with their own access rules. |
| Hosting | **Netlify (free plan)** | Allows paid tutoring. Vercel's free plan is non-commercial only. |
| Time zones | **`date-fns-tz`** | Correct UK time, plus clock-change detection (§12). |
| Large teacher uploads | **`tus-js-client`** | Supabase's recommended method for files over 6 MB (resumable). |
| Code storage | **GitHub (private repo)** | Netlify deploys from it. |
| Supabase region | 🔵 **MY CALL: London (eu-west-2)** | Keeps the children's data in the UK, close to the students. |

---

## 8. System architecture

```
  Students / parents (England)                Teacher (Bangladesh)
             │                                         │
             └──────────────── web browser ────────────┘
                 │  pages / actions           │  file bytes (direct)
                 ▼                            │
  ┌──────────────────────────────────┐        │
  │ NETLIFY: Next.js app              │        │
  │  • pages (student + teacher)     │        │
  │  • server actions: no file bytes │        │
  │     - user client (RLS applies)  │        │
  │     - admin client: accounts     │        │
  │       + clean-up only            │        │
  └───────────────┬──────────────────┘        │
                  │                           │
  ┌───────────────▼───────────────────────────▼──┐
  │ SUPABASE (London)                             │
  │  Auth (logins)                                │
  │  Postgres: tables + access rules (RLS)        │
  │            + rule functions (§9.3)            │
  │  Storage: private buckets + access rules      │
  └───────────────────────────────────────────────┘
```

### 8.1 Key design ideas

1. **The browser is never trusted.** Every rule (deadline, test window, solution unlock, "is this yours?") is enforced **in the database**, not just in the page or the Netlify server.
2. **One source of truth.** Each rule is written **once**, as a database function (§9.3). Pages, the dashboard, the database access rules and the storage access rules all call the same functions, so they can't disagree.
3. **Two server clients, kept apart:**
   - **User client** (the logged-in person's own session): used for **all** normal reads and writes, by students and the teacher. Database and storage access rules **apply**.
   - **Admin client** (service-role key): **skips all access rules**, so it's used only for creating, resetting, renaming and deactivating accounts, file clean-up, the per-student export, and the backup script. It lives in one file (`src/lib/supabase/admin.ts`) that only those teacher actions may import. It is never used to read or write homework, submissions or marks on behalf of a user.
   - This is what makes the "two layers" real: a bug in a page or server action still goes through the user client, so the database's access rules still block it.
   - **The teacher's session is limited too.** Access rules decide *who* may change a row, but not *which* changes are allowed. So rule-sensitive teacher writes (editing published items, exceptions, marking, attaching or replacing files) go only through checked database functions, and the teacher has **no direct insert/update/delete** on those tables. In storage the teacher can **upload new files only**: no overwrite and no delete. Files are removed only by clean-up (§10.4), which never removes a file a row still points to.
4. **File bytes never pass through Netlify.** Browsers upload to and download from Supabase Storage **directly**. This avoids Netlify's size limits and saves Netlify credits (§15).

### 8.2 Upload flow (student submission)

```
 1. Student picks a file. The page checks type and size (only to be helpful).
 2. The browser uploads it straight to Supabase Storage at
      submissions/{assignment_id}/{student_id}/{random_id}.{ext}
    Storage access rules allow this only if: it's their own folder, they're
    assigned and active, the window is open (§9.3), and the type/size limits pass.
    Otherwise the upload is refused.
 3. The browser calls the database function finalize_submission(assignment_id, object_path).
    In ONE transaction it:
      a. locks this student + assignment row (so two actions can't run at once),
      b. THEN reads the clock once: t = clock_timestamp()   (not now(), see §9.4),
      c. checks again using t: active, assigned, not excused, window open (test: t < end),
         not marked, §4.5 replace rules, object exists in their folder,
      d. saves the submission with submitted_at = t and revision + 1,
      e. remembers the previous file as "replaced".
 4. If step 3 says no, the page shows why. The uploaded file isn't referenced,
    so clean-up removes it later (§10.4).
```

- **The upload alone is not a submission.** Uploaded bytes only become a submission once `finalize_submission` succeeds.
- **Old files are deleted only after the new submission is saved**, by the clean-up in §10.4. So a submission never points at a deleted file.
- **Teacher uploads** (lectures, questions, solutions) use the same direct-to-storage approach, always to a **new** generated path (no overwriting). Files over 6 MB use resumable upload. After the upload succeeds, the page calls `attach_file` (new file) or `replace_file` (swap a file). The function checks the §4.8 rules, writes the `lecture_files` / `assignment_files` row, and puts any replaced file in `replaced_files` for clean-up.

### 8.3 Download flow

The page asks Supabase (through the **user** client) for a **signed link valid for 60 seconds**. Storage access rules check the §9.3 functions first, so the link is created only if access is allowed. The file downloads straight from Supabase under its **original file name** (cleaned up, §10.2).

### 8.4 Marking and concurrency

- `save_mark(submission_id, expected_revision, mark, feedback)` locks the same student + assignment row as `finalize_submission`, so marking and uploading **can't overlap**.
- **Version check:** each submission row has a `revision` number that goes up by 1 on **every** finalize. The row ID alone isn't enough, because a re-upload reuses the same row. The marking page records the `revision` of the file the teacher downloaded and sends it with the mark. While holding the lock, `save_mark` compares it with the current `revision`. If they differ, saving fails with *"This student uploaded a new version. Please download it again."*
- Two uploads from the same student at the same moment: the row lock makes them run one after the other. The second one replaces the first under the normal rules.

---

## 9. Database design

### 9.1 Tables

```
profiles                       ── one row per user
  id               uuid  PK  (= Supabase auth user id)
  role             'teacher' | 'student'
  username         text unique         (students only)
  display_name     text
  is_active        boolean             (false = deactivated; checked by every rule)
  must_change_password boolean         (true after create/reset; forces /account/new-password, §2.1)
  joined_at        timestamptz         (for §4.7)
  last_seen_at     timestamptz         (shown as "Last login"; updated at most every 5 min)

lectures
  id, title, description, created_at

lecture_files
  id, lecture_id → lectures
  original_name    text   (cleaned, for download name only)
  object_path      text   (generated, see §10.2)
  size_bytes, created_at

assignments                    ── homework AND class tests in one table
  id
  kind             'homework' | 'test'
  title, instructions
  max_marks        numeric        CHECK (max_marks > 0)
  visible_from     timestamptz    (homework: when it appears; test: when it's announced)
  opens_at         timestamptz    (test: start time; homework: = visible_from)
  due_at           timestamptz    (homework: deadline; test: end time)
  solution_unlocked_for_all  boolean
  created_at
  CHECK (visible_from <= opens_at AND opens_at < due_at)

assignment_files
  id, assignment_id → assignments
  purpose          'question' | 'solution'
  original_name, object_path, size_bytes, created_at

assignment_students            ── who gets each item + per-student exceptions
  assignment_id → assignments
  student_id    → profiles
  opens_at_override  timestamptz null
  due_at_override    timestamptz null
  excused            boolean default false
  PRIMARY KEY (assignment_id, student_id)

submissions                    ── current submission per student per item
  id, assignment_id, student_id      UNIQUE (assignment_id, student_id)
  original_name, object_path, size_bytes
  submitted_at     timestamptz        (clock reading taken after the lock, §9.4)
  revision         integer            (starts at 1, +1 on every finalize; used by save_mark, §8.4)
  mark             numeric null       CHECK (mark >= 0)  + trigger: mark <= max_marks
  feedback         text null
  marked_at        timestamptz null

replaced_files                 ── old files waiting for clean-up
  object_path, replaced_at

app_meta                       ── small settings, e.g. last_backup_at
  key, value
```

- Times are stored as exact moments (UTC) and always **shown** in UK time.
- `is_late` is **not stored**. It's calculated (§4.2).

### 9.2 Status: separate facts, not one label

The view `student_assignment_facts` gives one row per *(student, assignment)* with:

| Fact | Meaning |
|---|---|
| `effective_opens_at` | `coalesce(opens_at_override, opens_at)` |
| `effective_due_at` | `coalesce(due_at_override, due_at)` |
| `is_visible` | now ≥ `visible_from` |
| `is_excused` | from `assignment_students` |
| `has_submission` | a submission row exists |
| `is_late` | `has_submission` and `submitted_at ≥ effective_due_at` |
| `is_marked` | `mark` is set |
| `score_pct` | `mark / max_marks`, if marked |
| `action_state` | **one** of `hidden`, `upcoming`, `pending`, `missed`, `done`, `excused`. This drives only the "what to do now" label and the pending banner. |

`student_progress` builds every count and average from **these facts** (§4.9), never from `action_state`. So a late homework that's been marked still counts in both **Submitted** and **Late**, and the page can show "Late · Marked 7/10" together.

Both views use **`security_invoker = true`**, so they follow the access rules of the person asking. A student only ever gets their own rows.

### 9.3 Rule functions (single source of truth)

| Function | Used by |
|---|---|
| `is_teacher()`, `is_active_student()` | every access rule |
| `can_see_assignment(assignment_id)` | assignment list, question-file access |
| `can_read_question(assignment_id)` | storage rule for `questions` |
| `can_read_solution(assignment_id)` | **§4.4 exactly**; storage rule for `solutions` **and** the "View solution" button |
| `can_upload_now(assignment_id)` | storage rule for `submissions` (step 2 of §8.2) |
| `finalize_submission(assignment_id, object_path)` | step 3 of §8.2 |
| `save_mark(submission_id, expected_revision, mark, feedback)` | teacher marking (§8.4) |
| `create_assignment(...)`, `update_assignment(id, ...)`, `delete_assignment(id)` | teacher create/edit/delete, applying **§4.8** |
| `set_assignment_students(id, student_ids)` | choose students (§4.8 add/remove rules) |
| `set_exception(assignment_id, student_id, opens_override, due_override, excused)` | per-student exceptions (§4.6) |
| `unlock_solution_for_all(assignment_id)` | the "Unlock solution for everyone" button |
| `attach_file(...)`, `replace_file(...)` | teacher file rows for lectures, questions and solutions (§8.2) |
| `create_lecture(...)`, `update_lecture(...)`, `delete_lecture(id)` | lectures (delete moves its files to `replaced_files`) |

Security rules for these functions:
- Functions that write data run with elevated rights, so each one **checks `auth.uid()` and the role itself** (`is_teacher()` / `is_active_student()`) and uses a fixed `search_path`. They are the **only** write path: the matching tables grant `SELECT` only to `authenticated`.
- `EXECUTE` is **revoked from `public` and `anon`** on every function and granted only to `authenticated`. Teacher-only functions also check `is_teacher()` inside.

### 9.4 `finalize_submission`: the exact rule

```
input: assignment_id, object_path      caller: auth.uid() = student
lock assignment_students row (assignment_id, student) FOR UPDATE   ← may wait here
t := clock_timestamp()                 ← ONE clock reading, taken AFTER the lock
reject unless:
  caller is an active student                         → "account inactive"
  row exists and not excused                          → "not assigned"
  object_path is inside submissions/{assignment_id}/{caller}/ and the object exists
  t ≥ effective_opens_at                              → "not open yet"
  kind = 'test' → t < effective_due_at                → "test closed"
  existing submission not marked                      → "already marked"
  existing submission on time AND t ≥ effective_due_at
                                                      → "can't replace after deadline"
upsert submission: object_path, original_name, size, submitted_at = t,
                   revision = revision + 1 (or 1), mark/feedback cleared
if there was a previous object_path → insert into replaced_files
commit
```

**Why `clock_timestamp()` and not `now()`:** in PostgreSQL, `now()` is fixed when the transaction **starts**. A call that starts at 4:59:59, waits for the lock and continues at 5:00:01 would still see 4:59:59 and wrongly pass. `clock_timestamp()` is the real time at the moment it's read. Reading it **once, after the lock**, and using that value for both the check and `submitted_at` gives the "accepted at final validation" rule in §4.3. Other time-sensitive write functions (`save_mark`, `update_assignment`, `set_exception`) follow the same pattern: lock, then read the clock.

---

## 10. Files: types, sizes, storage and clean-up

### 10.1 Allowed types and sizes

| Who / what | Allowed extensions | Max size |
|---|---|---|
| Student submission | `.ipynb`, `.py` | **5 MB** |
| Question / solution file (teacher) | `.ipynb`, `.py`, `.pdf`, `.txt`, `.zip` | 25 MB |
| Lecture file (teacher) | `.ipynb`, `.py`, `.pdf`, `.pptx`, `.png`, `.jpg` | 25 MB |

These are enforced by **bucket settings and storage access rules** (extension and size), not just by the page. MIME types sent by browsers are unreliable for `.ipynb`, so the extension is checked from the storage path, which the rules also control.

### 10.2 Names and paths
- **Storage paths are generated**, e.g. `submissions/{assignment_id}/{student_id}/{uuid}.ipynb`. The user's file name is **never** part of the path.
- The **original file name** is stored separately in the database, cleaned (path characters and control characters removed, max 120 characters), and used **only** as the download name.
- Files are always served as **downloads** ("attachment"). They're never opened as web pages.

### 10.3 Student code
- The platform **never runs or renders** uploaded `.py` or `.ipynb` files.
- ⚠ When **you** open a student's notebook in Jupyter on your own computer, its code can run there. The risk is low with these students, but it's good practice to skim a notebook before clicking "Run All".

### 10.4 Clean-up
One clean-up task removes:
- **abandoned uploads**: objects in `submissions/` that no submission points to and that are **older than 1 hour**;
- **replaced files** listed in `replaced_files`;
- teacher uploads whose database row was never written (also older than 1 hour).

It runs (admin client) **when the teacher opens the dashboard**, at most once every 6 hours, and from a **"Clean up files"** button. It only deletes files that no row points to, so a submission can never point at a deleted file.

### 10.5 Buckets

| Bucket | Contents | Path pattern |
|---|---|---|
| `lectures` | Lecture files | `{lecture_id}/{uuid}.{ext}` |
| `questions` | Question files | `{assignment_id}/{uuid}.{ext}` |
| `solutions` | Solution files | `{assignment_id}/{uuid}.{ext}` |
| `submissions` | Student uploads | `{assignment_id}/{student_id}/{uuid}.{ext}` |

All four are **private**.

---

## 11. Access control (who can do what)

Row Level Security is **on for every table** and on `storage.objects`. "Active student" means `role = 'student' AND is_active`.

### 11.1 Database

| Table | Anonymous | Active student | Teacher |
|---|---|---|---|
| `profiles` | nothing | read **own** row | read all; **writes only via admin-key account actions** (§2.1) |
| `lectures`, `lecture_files` | nothing | read | read; writes **only via functions** (§9.3) |
| `assignments` | nothing | read where assigned **and** visible | read; writes **only via functions** applying §4.8 |
| `assignment_files` | nothing | read question rows where `can_read_question`, solution rows where `can_read_solution` | read; writes **only via** `attach_file` / `replace_file` |
| `assignment_students` | nothing | read **own** rows | read; writes **only via** `set_assignment_students` / `set_exception` |
| `submissions` | nothing | read **own**; write **only** through `finalize_submission` | read; mark **only** through `save_mark` |
| `replaced_files`, `app_meta` | nothing | nothing | read (writes via functions / admin) |
| Views (`student_assignment_facts`, `student_progress`) | nothing | own rows (`security_invoker`) | all rows |
| Functions | **no execute** | as §9.3 | as §9.3 |

"Writes only via functions" means `INSERT`/`UPDATE`/`DELETE` are **not granted** to the `authenticated` role on those tables at all. RLS alone isn't relied on for this.

Deactivated students get exactly what anonymous users get. **Public sign-up is off** (§2.1), so nobody can create their own account through the API.

### 11.2 Storage

| Bucket | Anonymous | Active student | Teacher |
|---|---|---|---|
| `lectures` | nothing | read | read; **insert only** (new paths); no update/delete |
| `questions` | nothing | read where `can_read_question` | read; **insert only**; no update/delete |
| `solutions` | nothing | read where `can_read_solution` | read; **insert only**; no update/delete |
| `submissions` | nothing | **insert only** in own folder where `can_upload_now`; read own; **no update/delete** | read |

- With no `UPDATE` permission, nobody can overwrite an existing file ("upsert"), so a stored file never changes under a database row.
- **Deleting files is done only by clean-up** (admin client, §10.4). It deletes only files that **no row points to**. The teacher's own session can't delete a file directly.

### 11.3 Secrets
- The **admin (service-role) key** is a Netlify environment variable used only on the server, through `src/lib/supabase/admin.ts`. It never goes to the browser.
- The **public (anon) key** is safe in the browser **because** of the rules above.
- HTTPS everywhere (Netlify and Supabase provide it).

---

## 12. Time zone handling

The aim is that the teacher types times in UK time, everyone sees UK time, and nothing shifts when the clocks change.

- **Input:** when you type *"Tue 21 Oct, 8:00 PM"*, the app reads it as **Europe/London** time and stores the exact moment.
- **Display:** every date shows in **Europe/London** with a small "UK time" label, whatever the viewer's computer is set to.
- **Checks** (late, test closed, and so on) compare exact moments using the database clock.
- **Clock-change days** need care, because on two days a year some UK times are unusual:
  - **Last Sunday of March** (clocks go forward): times from **1:00 to 1:59 AM don't exist**. The form **refuses** them with *"This time doesn't exist in the UK on this day (clocks go forward). Please choose another time."*
  - **Last Sunday of October** (clocks go back): times from **1:00 to 1:59 AM happen twice**. The form asks **"BST (first time) or GMT (second time)?"** before saving.
  - After saving, the item shows the zone it's in, e.g. *"1:30 AM GMT"*.
- 🔵 **MY CALL:** The teacher's screens also show Bangladesh time in small grey text (e.g. *"8:00 PM UK · 1:00 AM BD"*). Students see only UK time.

---

## 13. Children's data and privacy

The students are **children**, currently living in the UK. The platform is built **privacy-first** whatever the legal position: minimal data, private by default, data held in London.

> **Teacher's decision (24 Oct 2026):** legal paperwork (lawful basis, DPIA, privacy notice, ICO fee / UK representative) is **outside this project** and the teacher's own responsibility. The build doesn't wait for it. *Designer's note, recorded once:* UK data-protection rules depend on where the students **live**, not on their nationality.

| Topic | Plan |
|---|---|
| **Who is responsible** (data controller) | You, the teacher, as the person providing the tuition. |
| **Purpose** | Giving out and collecting homework and tests, marking, and showing progress to the student and their parent. **Nothing else**: no advertising, no analytics, no profiling. |
| **Data the app stores** | Username, display name (first name only), password (stored only in a scrambled, non-reversible form), last login time, and the student's uploads, marks and feedback. |
| **Data the services handle** | **Supabase** (database, storage, logins) also keeps operational records such as login events, IP addresses and request logs. **Netlify** (hosting) keeps request logs including IP addresses. Both act as **processors** for you under their standard data-processing terms. |
| **Where it's held** | Supabase project in **London**. Netlify serves pages from a global network. |
| **Retention** | ✅ **DECIDED:** a student's data is kept while they're taught, then their **account, uploads and marks are deleted 12 months after they leave** (backups age out within a further 3 months, §14). The teacher dashboard lists deactivated students whose 12 months are up, with a **Delete** button. |
| **Family rights** | Parents (or the student) can ask to **see, correct, export or delete** the data by messaging you. You use **Export one student's data** (T12) and **Deactivate → Delete** to handle it. Reply within one month. |
| **Privacy-by-design measures** | Private by default (nothing public, no sharing between students), data kept to the minimum, no location, no profiling, no advertising or analytics. Parents have full visibility because they share the student's login. |
| **Shared login** | Your choice: parent and student share one account. Trade-off: actions can't be attributed to one person (§2). |

---

## 14. Backups and recovery

The Supabase free plan has **no downloadable automatic backups**, and database backups **don't include stored files**. So we make our own backups, with **both** the database **and** the files.

### 14.1 What one backup contains

🔵 **MY CALL:** A **backup script** (`npm run backup`) that **you run on your own computer once a week**. It follows **Supabase's CLI backup guide** and produces these files, packed into one **password-protected zip** (e.g. `codeclass-backup-2026-10-24.zip`):

| # | File | What it is |
|---|---|---|
| 1 | `roles.sql` | Database roles (`supabase db dump --role-only`) |
| 2 | `schema.sql` | Our tables, views, functions and access rules (`supabase db dump`) |
| 3 | `data.sql` | All data (`supabase db dump --data-only --use-copy`), **including login accounts (`auth` schema) and file records (`storage` schema)** |
| 4 | `files/` | **Every file** from all four buckets, under their original storage paths |
| 5 | `files-manifest.json` | List of every file with size and checksum, used to verify the backup |
| 6 | `migrations/` | Copy of `supabase/migrations/` from the repo. This includes the **storage access rules and any `auth`/`storage` customisations**, which the schema dump doesn't include and must be re-applied separately. |
| 7 | `project-settings.md` | Settings that **aren't in the database** and must be set again by hand: Auth settings (**"Allow new users to sign up" = OFF**, minimum password length, session length, site URL/redirects), each bucket's **private flag, size limit and allowed types**, and the **list** of Netlify environment variables (names only, never secret values) |

- ✅ **DECIDED: no Docker.** The Supabase CLI's dump command needs Docker Desktop, so instead the script calls the **PostgreSQL client tools** (`pg_dump`, `pg_dumpall --roles-only`, `psql`) directly, with the same options the Supabase CLI uses. You install them once from the official PostgreSQL Windows installer (choose "Command Line Tools" only), and the version must match the Supabase database version. The commands shown above (`supabase db dump ...`) describe **what** each file contains; the script produces the same files without Docker. This must pass the restore test (§14.4).

### 14.2 Verified before it counts
`last_backup_at` (and the dashboard's **"Last backup: N days ago"**, amber after 8 days, red after 14) is updated **only after** the script has:
1. finished the zip;
2. re-opened it and checked that the three `.sql` files exist, aren't empty and contain the expected tables;
3. checked every file in `files/` against `files-manifest.json` and against a fresh list of the buckets (same count, same sizes).

If any check fails, the script says so, and the dashboard **keeps the old date**.

### 14.3 Where, who and how many
- **Where:** a folder on your computer that syncs to your **Google Drive**. That's off-site from Supabase, private to you, and free.
- **Who can access:** only you. The zip password is kept in your password manager, **not** in the code or the repo.
- **How many:** keep the **last 12 weekly backups** (about 3 months) and delete older ones.
- **Before deleting old student work** (§13 retention): make a fresh, verified backup first.

### 14.4 Restore procedure (in this order; full steps in the README)
1. Create a **new Supabase project** (London region).
2. Set **Auth settings** from `project-settings.md`, **sign-up OFF first**.
3. Restore `roles.sql`, then `schema.sql`, then `data.sql` with `psql`, following the Supabase guide (data loaded with triggers disabled via `session_replication_role = replica`).
4. Re-apply the **storage access rules and `auth`/`storage` customisations** from `migrations/`.
5. Create or check the **four buckets** with the settings from `project-settings.md`.
6. **Upload every file** from `files/` to the same bucket and path (script: `npm run restore-files`), then check against the manifest.
7. The new project has **new API keys**: update the Netlify environment variables and redeploy.
8. **Smoke test:** teacher login; a student login; open a submission; confirm a student **can't** see the other student's work; confirm the sign-up API is refused.

**Tested before go-live:** a full restore into a **spare** Supabase project must pass step 8 in Phase 6 (§16).

---

## 15. Free-plan limits and capacity budget

**Target: £0 per month, staying inside the free-plan limits.** This is a target that we measure, not a guarantee. If a limit is reached, the service pauses rather than charging money.

### 15.1 Storage budget (Supabase free: 1 GB)

| Category | Estimate per school year |
|---|---|
| Student submissions (2 students × ~300 items × ~0.5 MB) | ~300 MB |
| Question files (~300 × ~0.1 MB) | ~30 MB |
| Solution files (~300 × ~0.1 MB) | ~30 MB |
| Lecture files (~70 × ~3 MB average, PDFs/slides) | ~210 MB |
| Temporary / replaced files before clean-up | ~20 MB |
| **Total** | **~590 MB / year** |

That's enough for about **one school year at 2 students**. With more students, or after a year, older terms need clearing **after a backup** (§14) under the retention rule (§13).

### 15.2 Netlify (free: 300 credits per month)

Netlify's free plan gives a monthly credit allowance. **Production deploys, server compute, bandwidth and requests all use credits**, and the site **pauses** for the rest of the month if they run out.

- Files don't go through Netlify (§8.1), so the biggest bandwidth cost is avoided.
- 🔵 **MY CALL:** **Deploys are the main cost to control.** Deploy at most **about 10 times a month** once live, and group changes together. Use free local testing and preview builds for trying things.
- **Monitoring:** check the Netlify usage page **once a week** during the first month, then monthly. If usage passes **70%** before the 20th of the month, stop deploying until the next month.
- Exact credit prices change, so check Netlify's pricing page. We'll measure real usage in Phase 6.

### 15.3 Supabase pausing

- Supabase **may pause** a free project after about **7 days of low activity**. Daily homework makes this unlikely, but **not impossible**.
- If it pauses: log in to supabase.com → open the project → **Restore**. Data is kept. The steps are in the README.
- The weekly backup (§14) also connects to the project, which helps keep it active.

### 15.4 Other limits

| Limit | Free plan | Our use |
|---|---|---|
| Supabase database size | 500 MB | Under 10 MB per year |
| Supabase per-file upload | 50 MB | 5 MB student, 25 MB teacher |
| Supabase monthly active users | 50,000 | 3–6 |

---

## 16. Build plan (phases)

Each phase ends with something you can try. **Real student data isn't used until Phase 6 is complete.**

| Phase | What gets built | You can then... |
|---|---|---|
| **0. Login proof** (before any app code) | On a **throwaway** Supabase project, with "Allow new users to sign up" **OFF**: create a user with the chosen internal address (§2.1) using the admin key, sign in from a browser, rename the username, reset the password, and confirm the public sign-up API is **refused**. If anything fails, stop and choose another address scheme. | Know that username login works before building on it |
| **1. Foundation + proof** | Project setup, all tables, constraints, rule functions and access rules; username login (§2.1); teacher creates/resets/renames/deactivates students. **Deploy to Netlify straight away.** **Prove the upload route**: upload 5 MB and 25 MB files through the deployed site. | Log in as teacher and as a test student on the live site |
| **2. Lectures + homework** | Upload lectures; create and schedule homework; download; `finalize_submission`; on-time, late and missed; pending banner; editing rules (§4.8) | Run a **trial** homework cycle with test accounts |
| **3. Marking + progress** | Marking queue, `save_mark`, solutions + unlock rule, "unlock for everyone", progress page, dashboard table | Mark trial work and see the counts and averages |
| **4. Class tests** | Test window, questions hidden before start, hard close, countdown and warnings | Run a **trial** test with a test account |
| **5. Exceptions + polish** | Extend/move/excuse, rename, per-student export, retention delete list, clean-up task, dark mode, phone layout | Handle a pretend sick day |
| **6. Go-live checks** | Backup script; **full restore test** (§14.4); full access test suite on the **deployed** site (§17); README; usage check on Netlify and Supabase. | Create the real student accounts and share the logins with the families |

🔵 **MY CALL:** Everything in the database (scheduling, per-student assignment, exceptions) is created in **Phase 1**, even where the screens come later, so nothing needs redoing.

---

## 17. Testing

### 17.1 Rule tests (database functions)
- Every row of §4.2, §4.3, §4.5, §4.8 and §9.4, including uploads **1 second before / at / after** a deadline.
- A **test upload that starts before the end time but finishes after it is rejected**.
- **A finalize call held across the deadline:** one session holds the student's lock past the end time while a second finalize call waits. The second call must be **rejected** and must not store a `submitted_at` before the end time. The same check is run for `save_mark` and `update_assignment`.
- `submitted_at` always equals the clock reading used for the deadline check.
- **Two uploads racing** from the same student: both handled, one after the other, and the final state is valid.
- **Upload racing with marking**: one wins cleanly, and the teacher gets the "new version" message if the upload wins.
- **Re-upload between download and mark:** the teacher downloads revision 1, the student re-uploads (same row, revision 2), and `save_mark` with `expected_revision = 1` is **refused**.
- **Changing an exception after submission** (extend, move, excuse, un-excuse): the late flag, counts, averages and solution access all update correctly.
- **A marked late homework still counts in both Submitted and Late.**
- **Solution rule (§4.4)**: every combination of submitted / not submitted / unlocked for all / excused / before and after the student's own deadline.
- The database refuses a mark above the maximum, a maximum mark of 0 or below, and times in the wrong order.

### 17.2 Access tests (run against the **deployed** site in Phase 6)
- **Student A** tries to read **Student B's** database rows, submission files, marks and feedback, using direct API calls and guessed paths. **All refused.**
- **Anonymous** and **deactivated** users try every page, server action, database table, function and storage bucket. **All refused** (except the login page).
- A student tries to upload into another student's folder, into a closed test, or a `.exe` file. **All refused.**
- A student tries to fetch a solution file before §4.4 allows it, with a direct link. **Refused.**
- **Public sign-up:** a call to Supabase's sign-up API with the public key is **refused**, while the teacher's admin-key account creation **still works**.
- **Teacher session, direct API calls** (not through the pages): try to insert/update/delete `assignments`, `assignment_files`, `assignment_students` and `submissions` directly, move a deadline earlier after a submission, change `max_marks` after marking, and delete or overwrite a stored file that a row points to. **All refused.** The same changes made through the checked functions are allowed or refused exactly as §4.8 says.
- **Deactivation and signed links:** create a download link, deactivate the student, then (a) a new database or storage request is refused straight away, and (b) the existing link stops working **no later than 60 seconds** after it was created.

### 17.3 Time zone tests
- Display from a computer set to Bangladesh time and one set to UK time: both show the same UK time.
- **Spring-forward**: a nonexistent time (**28 Mar 2027, 1:30 AM**, the last Sunday of March) is refused by the form.
- **Fall-back**: an ambiguous time (e.g. 31 Oct 2027, 1:30 AM) needs a BST/GMT choice and stores the right moment.
- A deadline just before and just after each clock change.

### 17.4 Files and operations
- **Maximum-size files** (5 MB student, 25 MB teacher) uploaded **through the deployed site**.
- Over-size and wrong-type files are refused by **storage**, not just by the page.
- Clean-up removes abandoned and replaced files and **never** removes a file that a row points to.
- **Backup → restore** into a spare project following §14.4: logins, data, files, access rules, bucket settings and **sign-up OFF** all work afterwards.
- A deliberately **broken backup** (a missing file, an empty `data.sql`) fails verification and **doesn't** update "Last backup".

### 17.5 Manual check before launch
A full trial week as teacher and as two test students: create, schedule, upload, late, mark, solution unlock, test with hard close, exception, export, backup.

---

## 18. Risks and how we handle them

| Risk | How we handle it |
|---|---|
| Student's upload finishes just after a test ends | Clear rule (§4.3), countdown warnings at 10/5/1 minutes, and a visible progress bar. The upload is rejected. You can give a per-student exception if it was a genuine technical problem. |
| A server bug tries to show another student's data | Normal requests use the user client, so the database and storage access rules still block it (§8.1). |
| The admin key leaks | It's only on Netlify's server settings and used in one file. If it leaks, generate a new key in Supabase (old one stops working) and update Netlify. |
| A student shares a solution with the other student | Can't be fully prevented. Solutions unlock only after the student's own deadline **and** after they've submitted, which limits it. |
| A student uses another student's login | Each family gets only its own login. Passwords can be reset any time. |
| Supabase pauses the project | Restore steps in the README. Data is kept. |
| Data loss | Weekly database + file backups, off-site, with a tested restore (§14). |
| Free limits reached | Capacity budget and monitoring (§15). The service pauses instead of charging. |
| Free plans change their terms | Standard tools (Postgres, Next.js), so it can move to another host if needed. |
| You forget to mark | The dashboard "Needs marking" count is always visible. |
| You forget to back up | The dashboard turns amber after 8 days and red after 14. |

---

## 19. Decisions

All answered by the teacher on **24 October 2026**:

| # | Decision | Answer |
|---|---|---|
| 1 | **Exceptions per student:** extend a deadline, move a test window, or excuse an item for one student (§3.1 T9, §4.6) | ✅ Yes |
| 2 | **Choose students per item:** everyone ticked by default, untick to exclude (§3.1 T5) | ✅ Yes |
| 3 | **New students** only get work created after they join (§4.7) | ✅ Yes |
| 4 | **Schedule homework in advance** with a "show from" time (§3.1 T4) | ✅ Yes |
| 5 | **Excused students can see the solution** after their deadline, even without submitting (§4.4) | ✅ Yes |
| 6 | **Retention:** delete a student's data 12 months after they leave (§13) | ✅ Yes |
| 7 | **Login addresses:** placeholder `{username}@email.com` for everyone; no email is ever sent; logins shared on WhatsApp (§2.1, §2.2) | ✅ Teacher `miraz`; student usernames are chosen by the teacher in Phase 6 and kept out of this public repo (shown here as `student1`, `student2`) |
| 8a | **Passwords:** the teacher gives a temporary password; the student must change it at first login; they can change it later in My account; forgotten password = ask the teacher, who resets it, then the student changes it again (§2.1) | ✅ |
| 8 | **Name:** CodeClass | ✅ |
| 9 | **Language:** English only | ✅ |
| 10 | **Backup tool:** PostgreSQL client tools, no Docker (§14.1) | ✅ |
| 11 | **Legal paperwork:** outside this project, the teacher's responsibility (§13) | ✅ |

**🔵 MY CALL items (change any you disagree with):**
- teacher resets student passwords; no email reset for students (§2.1)
- teacher edits and file changes only through checked database functions; nobody deletes files except clean-up (§8.1, §11)
- lateness worked out from the current deadline, so an extension can turn "late" into "on time" (§4.2)
- no grace period at test end; the upload must be **finished and accepted at final validation** before the end time (§4.3)
- "Unlock solution for everyone" still waits for each student's deadline (§4.4)
- no replacing an on-time upload after the deadline (§4.5)
- editing rules after publishing (§4.8)
- missed = 0% in averages, late = no automatic penalty (§4.9)
- 5 MB student / 25 MB teacher upload limits and allowed file types (§10.1)
- weekly backup run on **your** computer into Google Drive (§14)
- at most ~10 deploys a month once live (§15.2)
- Supabase in London (§7)

Once this document is approved, the next step is the step-by-step build plan, starting with Phase 0.
