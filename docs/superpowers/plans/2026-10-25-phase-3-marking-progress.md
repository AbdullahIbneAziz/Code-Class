# CodeClass Phase 3 (Marking + Progress) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The teacher uploads a solution to a homework, unlocks it for everyone, and marks submitted work from a "Needs marking" queue or the homework's own page, with a version check. Students see their marks, feedback and solutions under the exact §4.4 rule, a Marked tab, progress tiles, a "Recently marked" list and a full `/progress` history. The teacher dashboard shows "Needs marking (N)" and "Students at a glance", both built from the database views.

**Architecture:** Two new checked `SECURITY DEFINER` functions, `save_mark` and `unlock_solution_for_all`, are the only write paths. `save_mark` takes the locks in the global order (assignment → assignment_students → submission), **then** reads the clock. One migration also gives the `solutions` storage policy the Phase 2 live-row check and appends mark, feedback and solution columns to the `student_items` view. Every count and average on screen is read from `student_progress`, and every per-item fact from `student_items`. The app never recounts. Solution visibility is decided only by RLS (`can_read_solution`), on both the file row and the storage object.

**Tech Stack:** As Phase 2 (Next.js 16.4 with `proxy.ts` and `cacheComponents`, `@supabase/ssr`, `supabase-js` v2, `tus-js-client`, Vitest, `pg`, Playwright, Supabase CLI). No new dependencies. UK time goes only through `src/lib/time/uk.ts` (pure `Intl`). There is no date-fns.

**Spec:** [ARCHITECTURE.md](../../../ARCHITECTURE.md) (v2.2). Section numbers (§) refer to it. **Carried requirements:** [carried-requirements.md](../carried-requirements.md). **Style reference:** [Phase 2 plan](2026-10-25-phase-2-lectures-homework.md). **Phase 2 ledger:** `.superpowers/sdd/2026-10-25-phase-2-lectures-homework/progress.md`.

**Branch:** `phase-3-marking-progress`, created from `main` @ `fde41b8`.

**Scope:** §16 row 3 only: marking queue, `save_mark`, solutions and the unlock rule, "unlock for everyone", the progress page and the dashboard table. Not in this plan: class-test pages, countdown and warnings (Phase 4); `set_exception`, the Exceptions UI, clean-up, dark-mode polish and phone layout (Phase 5); backups and "Last backup: N days ago" (Phase 6, §14); `+ New class test` (Phase 4). `save_mark` and the progress screens already handle `kind = 'test'`, so Phase 4 only adds pages.

**Decisions recorded for this phase**
1. **`save_mark(p_submission_id uuid, p_expected_revision integer, p_mark numeric, p_feedback text) returns void`** (§8.4, §9.3) is teacher-only. Lock order (carried **h**): `assignments … FOR SHARE`, then this student's `assignment_students … FOR UPDATE`, then the `submissions` row `FOR UPDATE`, **then** `t := clock_timestamp()`. It sets `mark`, `feedback` and `marked_at = t`. It never changes `revision`, `submitted_at` or the file. `finalize_submission` already refuses once a submission is marked (§4.5).
2. **Re-marking is allowed** (the teacher corrects a mark). It goes through the same revision check, and `marked_at` moves to the new `t`. A mark can't be cleared: `p_mark` null is refused, so marked work stays locked.
3. 🔵 My call (spec silent): **a test submission can't be marked before that student's own end time** (copy `testopen`). Marking locks replacement (§4.5), and §4.3 promises replacement throughout the window. Homework can be marked any time after it is submitted.
4. 🔵 **Excused** submissions are left out of the queue and the "Needs marking" count, because they don't count (§4.6). They can still be marked from the homework page, and the view ignores those marks in averages. **Deactivated** students are left out of the queue, the count and "Students at a glance". The homework page still shows them as `(inactive)` and allows marking.
5. Feedback is trimmed. An empty comment is stored as `null`. The limit is **2000** characters (`feedback`). It is shown as plain text with its line breaks (`whitespace-pre-wrap`; React escapes it).
6. **Expected revision = the revision of the file the teacher last downloaded.** `MarkForm` stores `item.revision` when it mounts and updates it whenever Download is clicked. After a `revision` refusal the form calls `router.refresh()`, so Download now serves the new file. Save keeps failing until the teacher downloads again (§8.4 "Please download it again").
7. **Solutions:** the UI keeps one solution per homework (`Upload solution`, then `Replace solution`), using the existing `attach_file` / `replace_file` with target `'solution'`. The DB still allows more than one, and a student sees every solution row RLS allows. `unlock_solution_for_all(p_assignment_id uuid) returns void` is one-way and idempotent, with no undo. It is allowed before a solution exists and before the deadline, sits behind a confirmation, and still waits for each student's own deadline (§4.4). Its lock is `assignments … FOR NO KEY UPDATE`. It does no time check, so it never reads the clock.
8. **Storage (carried k):** `solutions_student_select` additionally requires a live `assignment_files` row with `purpose = 'solution'` for that object, just as migration 000006 did for lectures and questions.
9. **`student_items`** gets these columns appended (via `create or replace view`, so the existing columns and order are kept): `submission_id, mark, feedback, marked_at, score_pct, solution_unlocked_for_all, student_is_active`.
10. **Student homework tabs** (§6.3, Phase 2 ledger Task 8): `Pending` = `pending` or `missed`. `Submitted` = (`done` or `excused`) and not marked. `Marked` = `is_marked`, including excused. 🔵 Excused items show under Submitted labelled `Excused`, because the student has nothing left to do. On an excused homework's page the upload form is replaced by `You've been excused from this homework. It doesn't count.` This also clears the Phase 2 Task 9 minor "excused students still see the form".
11. **Solution notice** on the student page (pure function, Task 5). §4.4's `Submit your homework to unlock the solution.` is used only when submitting would unlock it. Otherwise the page says when it will open.
12. **Progress (carried g):** a missing `student_progress` row means `0/0/0/0` counts and `null` averages. Percentages show as `Math.round(x) + '%'`, and `null` shows as `—`. Marks show at most 2 decimals with trailing zeros dropped (`8/10`, `7.5/10`).
13. `statusLabel` gains `Scheduled` (hidden) and `Upcoming` (a test before it opens), so teacher views no longer say `Pending` for scheduled work (Phase 2 ledger Task 6 minor). Students never get hidden rows.
14. Deploy (at most **2** production deploys in Phase 3): merge into `main` **and** fast-forward `phase-0-1-foundation` (Netlify's production branch) to the same commit. The teacher hasn't approved switching Netlify to `main`, so this plan doesn't change it. *Superseded 25 Oct 2026 (ruling R5): the teacher switched Netlify's production branch to `main`; deploy = fast-forward and push `main` only.*
15. Carried items left for later: (a), (e), the rest of (k) → Phase 5; (j) → Phase 4; (d), (i) → before the first real student / Phase 6. The new migration uses `drop policy if exists` (replay-safe, as (e) asks).

## Global Constraints

Still in force from Phases 0–2:
- Supabase `codeclass-dev` (London) is the **shared live DB the deployed site uses**. It holds the real teacher account `miraz`. Tests never read, change, count on or assume the absence of non-`t_` rows. DB tests run in `withTx` (always rolled back). Committed fixtures go only through `tests/db/committed.ts` (`withCommitted`). API and e2e tests use `makeTestUser` / `cleanupTestUsers`, with `t_` names, and **register cleanup (`trackAssignmentTitle`, `trackFolder`, `trackObject`) before creating anything**. Dates are relative to now (`Date.now() ± n * HOUR`), never fixed calendar dates. Lists shared with other data (the queue, the dashboard, Students at a glance) are asserted **by the test's own rows**, never by totals. **No real student names anywhere** (public repo).
- Migrations are forward-only and date-prefixed. Never edit an applied one. Phase 3 adds **`20261025000007_marking_solutions.sql`** only. Apply with `npm run db:push`.
- Tables: no `INSERT`/`UPDATE`/`DELETE` grant to `anon`/`authenticated`. The whole-schema guard in `tests/db/access.test.ts` stays green, and views stay `security_invoker = true`.
- Every new function: `SECURITY DEFINER`, `SET search_path = ''`, fully qualified names, `REVOKE EXECUTE … FROM public, anon`, `GRANT EXECUTE … TO authenticated`, and `public.is_teacher()` checked first (`42501`, `Teacher access required.`).
- **Global lock order:** `assignments` row → `assignment_students` row(s) → `submissions` row → `t := clock_timestamp()` once, with `t` used for every check and every stored time. Modes: `finalize_submission` KEY SHARE, `save_mark` **SHARE**, `update_assignment` / `set_assignment_students` / `unlock_solution_for_all` NO KEY UPDATE, `delete_assignment` / `attach_file` / `replace_file` UPDATE.
- Rule refusals raise `P0001` with the exact copy below, and the app shows them through `rpcErrorMessage`. Teacher actions use `teacherClient()` (`src/lib/accounts/teacher-client.ts`).
- Signed URLs last 60 s and are made by the user-scoped client only (`<DownloadButton>`). Uploads never overwrite (`upsert: false`).
- Admin boundary unchanged: no Phase 3 file under `src/` imports `src/lib/supabase/admin.ts` or `src/lib/accounts/admin-client.ts`.
- **Next.js 16:** read the relevant guide in `node_modules/next/dist/docs/` before writing pages or actions (AGENTS.md). `params`/`searchParams` are Promises. Request-time data stays inside `<Suspense>`. In server code, `await connection()` (or a cookies-based client call) **before** any `Date.now()` / `new Date()`.
- **Forms** use `onSubmit` (`preventDefault` + `startTransition(async () => …)`), not `<form action>`, so a refusal keeps the typed values. The submit button is disabled until `useHydrated()` is true. Mark forms set `noValidate`, so the app and DB copy is what the teacher sees.
- **UK time:** display with `<UkTime>` (`teacher` adds BD time in grey). Day logic goes only through `src/lib/time/uk.ts`.
- UI is English only, product name **CodeClass**. Copy marked exact is verbatim.

New in Phase 3:
- **One source for numbers:** Submitted / Late / Missed / Pending / HW avg / Test avg come **only** from `student_progress`. Per-item late, marked, mark and status come only from `student_items`. No page or library counts them itself. A missing progress row = zeros and `null` averages (carried g).
- **Solution visibility** is decided only by RLS: `assignment_files` rows (policy → `can_read_solution`) and storage (`solutions_student_select`). The UI shows `Download solution` / `View solution` only when that row comes back.
- **Netlify:** at most **2** production deploys in Phase 3 (procedure in Decision 14).

**DB refusal copy (exact, new in Phase 3):**

| Key | Message |
|---|---|
| revision | `This student uploaded a new version. Please download it again.` |
| nomark | `Please enter a mark.` |
| range | `The mark must be between 0 and {max}.` (`{max}` = `trim_scale(max_marks)::text`, e.g. `10`, `7.5`) |
| feedback | `The comment is too long (2000 characters at most).` |
| testopen | `This test is still running. Mark it after it ends.` |
| gone | `That item no longer exists.` (existing copy, used for an unknown submission or assignment) |

App-only copy (exact): a non-numeric mark gives `Please enter a mark as a number.` (`parseMarkInput`, Task 3). An empty mark gives the `nomark` copy before any RPC.

## Review Focus

1. **The student re-uploads after the teacher opened the marking page.** Save is refused with the `revision` copy, the typed mark and comment stay, Download now gets the new file, and Save works only after that download. Test: Task 3 e2e `a new upload after the page loaded is refused with the new-version message until the teacher downloads again`.
2. **Edge marks:** `0`, `10` (= max) and `7.5` are accepted; `10.5`, `-1`, `abc` and an empty box are refused with the exact copy, and the comment stays typed. Tests: Task 1 DB `mark bounds`, Task 3 unit `parseMarkInput`, Task 3 e2e `bad marks are refused and the typed comment stays`.
3. **A brand-new student with no items** (no `student_progress` row). Dashboard row `0 · 0 · 0 · — · — · Never`, and home and `/progress` show `0 Submitted … — HW avg`. Nothing crashes and no row is missing. Tests: Task 6 API `zero-item student`, Task 7 e2e `a new student with no items shows zeros and dashes`, Task 8 e2e `a student with no items sees zeros and dashes`.
4. **A student with a personal extension after the teacher unlocked for everyone and the class deadline passed.** No `View solution` / `Download solution`, the notice `The solution will be available after your deadline.` shows, and a direct signed-URL request is refused. Test: Task 5 e2e `solution stays hidden before the student's own deadline even when unlocked for everyone`.
5. **Feedback written over several lines, or containing `<b>` / `<script>` text.** It shows as plain text with its line breaks, both on the student page and in the home "Recently marked" list. Test: Task 5 e2e `detail page shows mark, multi-line feedback as plain text, and the locked note`.

---

## File map

```
supabase/migrations/
  20261025000007_marking_solutions.sql   save_mark, unlock_solution_for_all, solutions live-row policy, student_items columns
src/
  lib/homework/types.ts            (mod) StudentItem + submission/mark/solution fields; TeacherHomeworkDetail + solution; HomeworkStatus
  lib/homework/map.ts              ItemRow, mapStudentItem (moved from queries.ts; no next/server import)
  lib/homework/queries.ts          (mod) getHomeworkForTeacher (solution), listMySolutions, listHomeworkStatus
  lib/homework/status.ts           (mod) statusLabel (+Scheduled/Upcoming), itemLabel, homeworkTab, solutionNotice
  lib/marking/format.ts            formatMark, markText, parseMarkInput
  lib/marking/queries.ts           listMarkingQueue
  lib/progress/types.ts            Progress, ProgressRow, GlanceRow
  lib/progress/format.ts           EMPTY_PROGRESS, toProgress, formatPct
  lib/progress/queries.ts          getMyProgress, listStudentsAtAGlance, listMyHistory, listRecentlyMarked
  lib/time/uk.ts                   (mod) lastSeenLabel
  actions/marking.ts               saveMarkAction
  actions/homework.ts              (mod) unlockSolutionForAllAction
  components/DownloadButton.tsx    (mod) onDownload callback
  components/MarkForm.tsx          per-submission mark entry (client)
  components/MarkingQueue.tsx      "Needs marking (N)" list (server)
  components/UnlockSolution.tsx    unlock button + confirm (client)
  components/ProgressTiles.tsx     five §6.1 tiles (server)
  app/teacher/layout.tsx           (mod) nav + Marking
  app/teacher/page.tsx             (mod) dashboard sections
  app/teacher/marking/page.tsx
  app/teacher/homework/[id]/page.tsx       (mod) Solution section, MarkForm per submission
  app/teacher/homework/HomeworkSolution.tsx
  app/(student)/layout.tsx         (mod) nav + My Progress
  app/(student)/page.tsx           (mod) My progress tiles, Recently marked
  app/(student)/progress/page.tsx
  app/(student)/homework/page.tsx          (mod) Marked tab
  app/(student)/homework/[id]/page.tsx     (mod) Your mark, Solution
  app/(student)/homework/[id]/SubmitPanel.tsx (mod) excused state, refresh on refusal
tests/
  db/marking.test.ts, db/committed.ts (mod: waitUntilBlocked), db/rules.test.ts (mod)
  api/helpers.ts (mod: displayName, adminSeedSubmission, adminSeedSolution, titled cleanup of solutions/submissions)
  api/storage.test.ts (mod), api/progress.test.ts
  unit/marking.test.ts, unit/status.test.ts (mod), unit/progress.test.ts, unit/uk-time.test.ts (mod)
  e2e/solutions-teacher.spec.ts, e2e/marking.spec.ts, e2e/marking-homework.spec.ts, e2e/marks-student.spec.ts,
  e2e/dashboard.spec.ts, e2e/progress.spec.ts
README.md, supabase/project-settings.md, docs/superpowers/carried-requirements.md   (Task 9)
```

---

### Task 1: `save_mark`, `unlock_solution_for_all`, solutions live-row policy, `student_items` columns (DB)

**Files:**
- Create: `supabase/migrations/20261025000007_marking_solutions.sql`, `tests/db/marking.test.ts`
- Modify: `tests/db/committed.ts`, `tests/db/rules.test.ts`, `tests/api/storage.test.ts`

**Interfaces:**
- Consumes: `is_teacher()`, `can_read_solution(uuid)`, `finalize_submission`, `update_assignment`, `student_assignment_facts`, the `submissions_mark_le_max` trigger, `seedUser`/`seedAssignment`/`assign`/`seedObject`, `withCommitted`/`session`/`uploadObject`.
- Produces (SQL):
  - `save_mark(p_submission_id uuid, p_expected_revision integer, p_mark numeric, p_feedback text) returns void`. In this order:
    1. Not teacher → 42501.
    2. Read `assignment_id, student_id` from `submissions` by id, with no lock (these keys never change). Not found → `gone`.
    3. `perform … from assignments where id = v_a for share` (→ `gone`), then `select * from assignment_students where (v_a, v_s) for update` (→ `gone`), then `select * from submissions where id = p for update` (→ `gone`), **then** `t := clock_timestamp()`. Read the `assignments` row after the locks.
    4. `p_expected_revision is distinct from cur.revision` → `revision`. Use `is distinct from`, so a null expected revision is refused too.
    5. `p_mark is null` → `nomark`. `p_mark < 0 or p_mark > a.max_marks` → `range`. `length(btrim(p_feedback)) > 2000` → `feedback`. `a.kind = 'test' and t < coalesce(s.due_at_override, a.due_at)` → `testopen`.
    6. `update submissions set mark = p_mark, feedback = nullif(btrim(coalesce(p_feedback,'')), ''), marked_at = t`.
  - `unlock_solution_for_all(p_assignment_id uuid) returns void`: not teacher → 42501. `select … for no key update` (→ `gone`), then `update assignments set solution_unlocked_for_all = true`.
  - `drop policy if exists solutions_student_select on storage.objects`, then recreate it as the 000004 version (uuid-guarded `can_read_solution(folder)`) `and exists (select 1 from public.assignment_files f where f.object_path = name and f.purpose = 'solution')`.
  - `create or replace view public.student_items with (security_invoker = true)`. The existing columns stay unchanged and in order, followed by `sub.id as submission_id, sub.mark, sub.feedback, sub.marked_at, f.score_pct, a.solution_unlocked_for_all, p.is_active as student_is_active`. Re-state `revoke all … from public, anon, authenticated; grant select … to authenticated`.
- Produces (`tests/db/committed.ts`): `waitUntilBlocked(pid: number, timeoutMs = 5000): Promise<void>`. It polls `pg_stat_activity where pid = $1 and wait_event_type = 'Lock'` from a separate pool client and throws on timeout. It proves the second session really waited.

- [ ] **Step 1: Write failing tests.** `marking.test.ts` (`withTx` unless *committed*; the submission is seeded as `postgres` at revision 1 unless stated):
  - `teacher marks a submission: mark, trimmed feedback and marked_at >= transaction start; revision, submitted_at and object_path unchanged`
  - `empty or whitespace feedback is stored as null`
  - `mark bounds` (max 10): `0`, `10` and `7.5` accepted; `10.5` and `-1` → `The mark must be between 0 and 10.`; `null` → `Please enter a mark.`; with max `7.5`, `8` → `… between 0 and 7.5.`
  - `feedback of 2001 characters is refused; 2000 is accepted`
  - `wrong or null expected revision is refused with the new-version copy and changes nothing`
  - `re-upload between download and mark is refused` (§17.1): the student finalizes a second path (revision 2), then `save_mark(…, 1, …)` → `revision`, and `save_mark(…, 2, …)` succeeds
  - `re-marking keeps the revision check and moves marked_at` (mark 6, then 8 with the same revision → mark 8, `marked_at` ≥ the first)
  - `a marked submission can't be replaced` (`save_mark`, then the student's `finalize_submission` with a new path → `This has already been marked, so it can't be replaced.`) and `update_assignment changing max_marks after save_mark → maxlock`
  - `test: marking before the student's own end time is refused (testopen); after it, or with a past due_at_override for that student, it is accepted`
  - `excused student's submission can be marked and is ignored in hw_avg_pct`
  - `save_mark feeds student_progress`: homework 8/10 and a test 3/5, both through `save_mark` → `hw_avg_pct = 80.00`, `test_avg_pct = 60.00`
  - `student, deactivated teacher → 42501; anon cannot execute save_mark or unlock_solution_for_all; unknown submission → gone`
  - `unlock_solution_for_all sets the flag, a second call is a no-op; unknown id → gone; student → 42501`
  - `after unlock, a student who didn't submit reads the solution only once their own deadline has passed` (solution row seeded; `can_read_solution` is false before `due_at_override` and true after)
  - `student_items: mark and feedback are visible only on the student's own rows; teacher sees student_is_active` (§17.2)
  - *committed* `upload wins the race: save_mark waits for finalize, then refuses the old revision`: A (student) `begin` + `finalize_submission(new path)`. B (teacher) `save_mark(…, 1, …)`, then `waitUntilBlocked(B)`. A commits. B → `revision`. Objects come from `uploadObject`, then `owner_id` is set as in `finalize.test.ts`.
  - *committed* `marking wins the race: finalize waits, then gets "already marked"`
  - *committed* `save_mark waits for update_assignment lowering max_marks, then refuses 8 out of 5`: A `update_assignment(max 5)` uncommitted. B `save_mark(8)` blocked. A commits. B → `The mark must be between 0 and 5.`
  - *committed* `update_assignment waits for save_mark, then refuses the max change (maxlock)` (the reverse order; proves carried h)
  - *committed* `save_mark held across a test's end time is accepted and marked_at is after the end`: test `due_at = clock + 2 s`. A (postgres) locks the `assignment_students` row. B reads `clock_timestamp()` (asserted `< due_at`), then calls `save_mark`, and `waitUntilBlocked(B)`. A runs `pg_sleep(3)` and commits. B succeeds and `marked_at >= due_at`.
  - `rules.test.ts`: `solutions storage policy requires a live solution row (single source)`: `pg_policies.qual` of `solutions_student_select` contains `can_read_solution` and `assignment_files`. The existing §4.4 matrix tests stay green.
  - `storage.test.ts`: `students can sign the live solution after their deadline but not a replaced or never-attached one` (homework due −1 h; s1 has an admin-inserted submission; attach, then replace; the old path → error, the new path → ok; a loose path → error; s2, who hasn't submitted → error).
- [ ] **Step 2:** `npm run test:db -- marking rules` and `npm run test:api -- storage` → the new tests FAIL.
- [ ] **Step 3:** Write the migration and `waitUntilBlocked`, then `npm run db:push`.
- [ ] **Step 4:** `npm run test:db` (all, including the whole-schema guard) and `npm run test:api` → PASS.
- [ ] **Step 5: Commit** `feat(db): save_mark with revision check and lock order, unlock_solution_for_all, live-row solution reads`

---

### Task 2: Teacher solution upload and "Unlock solution for everyone"

**Files:**
- Create: `src/app/teacher/homework/HomeworkSolution.tsx`, `src/components/UnlockSolution.tsx`, `tests/e2e/solutions-teacher.spec.ts`
- Modify: `src/lib/homework/types.ts`, `src/lib/homework/queries.ts` (`getHomeworkForTeacher`), `src/actions/homework.ts`, `src/app/teacher/homework/[id]/page.tsx`, `tests/api/helpers.ts`

**Interfaces:**
- Consumes: `uploadAndAttach` / `uploadAndReplace` (target `'solution'`), `validateFile('solution')`, `ALLOWED_EXT.solution`, `BUCKET.solution`, `<DownloadButton>`, `useHydrated`, `teacherClient`, `rpcErrorMessage`, `unlock_solution_for_all` (Task 1).
- Produces:
  - `TeacherHomeworkDetail` gains `solution: FileRow | null` (the earliest `purpose = 'solution'` row) and `solutionUnlockedForAll: boolean`.
  - `unlockSolutionForAllAction(id: string): Promise<ActionResult>` (revalidates `/teacher`, `/teacher/homework`, `/teacher/homework/{id}`).
  - `<UnlockSolution assignmentId: string unlocked: boolean />` (client). When not unlocked, it shows the button `Unlock solution for everyone`, which leads to the confirmation (exact) `Students who didn't submit will also see the solution, but only after their own deadline. This can't be undone.` with `Confirm unlock` / `Cancel`. When unlocked, it shows (exact) `Unlocked for everyone. Each student still waits for their own deadline.` Refusals appear in `role="alert"`.
  - `<HomeworkSolution assignmentId solution: FileRow | null />` (client), heading `Solution`. Without a file: `No solution uploaded yet.` and the button `Upload solution`. With a file: its name, `Download` and `Replace solution`. Progress `Uploading… {pct}%`. Always shows the rule line (exact): `Students see the solution after their own deadline, once they have submitted or been excused, or after you unlock it for everyone.` Hidden file input with `accept` from `ALLOWED_EXT.solution`. A page-side refusal shows the `validateFile` copy.
  - `/teacher/homework/[id]`: `<HomeworkSolution>` and `<UnlockSolution>` go after `Question files`.
  - `tests/api/helpers.ts`: cleanup for `trackAssignmentTitle` also lists and removes the `solutions` and `submissions` folders of each resolved assignment (the `questions` folder is removed already).

- [ ] **Step 1: Write failing tests** (`solutions-teacher.spec.ts`; teacher plus one student from `makeTestUser`; homework seeded by admin with a `t_hw_*` title registered first):
  - `teacher uploads a solution and replaces it` (`t_sol.ipynb` → 1 solution row with that `original_name`, then `Replace solution` with `t_sol2.py` → still 1 row named `t_sol2.py`, and the old path is in `replaced_files` with bucket `solutions`)
  - `unlock for everyone needs confirmation` (`Cancel` → the flag stays `false`; `Confirm unlock` → `true`, the button is gone and the unlocked text shows)
  - `a .exe solution is refused in the page before any upload` (the type copy listing `.ipynb, .py, .pdf, .txt, .zip`, and no solution row)
  - `before the deadline a student can't sign the solution, even after unlock` (the student's API client `createSignedUrl` on the live path → error)
- [ ] **Step 2:** `npm run test:e2e -- solutions-teacher` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm run test:e2e -- solutions-teacher homework-teacher` → PASS. `npm run lint && npm test` → PASS.
- [ ] **Step 5: Commit** `feat: teacher solution upload/replace and unlock for everyone`

---

### Task 3: Marking queue `/teacher/marking` with the revision check

**Files:**
- Create: `src/lib/marking/format.ts`, `src/lib/marking/queries.ts`, `src/actions/marking.ts`, `src/components/MarkForm.tsx`, `src/components/MarkingQueue.tsx`, `src/app/teacher/marking/page.tsx`, `tests/unit/marking.test.ts`, `tests/e2e/marking.spec.ts`
- Create (also): `src/lib/homework/map.ts`
- Modify: `src/lib/homework/types.ts`, `src/lib/homework/queries.ts` (move out `ItemRow`/`mapStudentItem`), `src/lib/homework/status.ts`, `src/components/DownloadButton.tsx`, `src/app/teacher/layout.tsx`, `tests/unit/status.test.ts`, `tests/api/helpers.ts`

**Interfaces:**
- Consumes: `save_mark` and the `student_items` columns (Task 1), `teacherClient`, `rpcErrorMessage`, `<UkTime teacher>`, `useHydrated`, `hasPassed`.
- Produces:
  - `StudentItem` gains `submissionId: string | null; mark: number | null; feedback: string | null; markedAt: string | null; scorePct: number | null; solutionUnlockedForAll: boolean; studentIsActive: boolean`. `mark` and `scorePct` are mapped with `Number()` when not null. `ItemRow` and `mapStudentItem` move to `src/lib/homework/map.ts`, which doesn't import `next/server`, so Vitest API tests can load them. `queries.ts` re-exports `mapStudentItem`.
  - `statusLabel` adds `'Scheduled'` (for `hidden`) and `'Upcoming'` (for `upcoming`). `itemLabel(item: StudentItem): string` = `statusLabel(item)` + (`isMarked && mark !== null` ? `` ` · Marked ${markText(mark, maxMarks)}` `` : `''`).
  - `formatMark(n: number): string` (at most 2 decimals, trailing zeros dropped), `markText(mark: number, max: number): string` → `` `${formatMark(mark)}/${formatMark(max)}` ``, `parseMarkInput(raw: string): { ok: true; mark: number } | { ok: false; message: string }`.
  - `listMarkingQueue(client): Promise<StudentItem[]>`: `student_items` with `has_submission`, not `is_marked`, not `is_excused` and `student_is_active`, ordered by `submitted_at` ascending (oldest first). After `await connection()` it drops tests whose `effectiveDueAt` hasn't passed.
  - `saveMarkAction(i: { submissionId: string; assignmentId: string; expectedRevision: number; mark: string; feedback: string }): Promise<ActionResult>`: `teacherClient` → `parseMarkInput` → `rpc('save_mark')` → revalidates `/teacher`, `/teacher/marking`, `/teacher/homework/{assignmentId}`.
  - `<DownloadButton … onDownload?: () => void />` calls `onDownload` once the URL is created.
  - `<MarkForm item: StudentItem />` (client, `noValidate`). It shows `Download` (bucket `submissions`, with `onDownload` updating the stored expected revision, Decision 6), a number input `step="any"` with the label `Mark for {studentName} out of {formatMark(max)}` and a visible `/ {max}`, and a textarea labelled `Comment for {studentName}` with placeholder `comment…`. The button is `Save`, or `Update mark` when `isMarked`, in which case the inputs are prefilled. Success shows `Saved.` (`role="status"`), then `router.refresh()`. A refusal shows the message in `role="alert"`, keeps the inputs, and calls `router.refresh()` for `revision`.
  - `<MarkingQueue items: StudentItem[] />` (server). Heading `Needs marking ({n})`, or `Nothing to mark.` when empty. One `<li aria-label="{title}, {studentName}">` per item with the text `{title}, {studentName}`, plus ` (late)` when `isLate`, then `Submitted <UkTime teacher>` and `<MarkForm>`.
  - `/teacher/marking`: heading `Marking`, then `<MarkingQueue items={await listMarkingQueue(client)} />`. Teacher nav: `Dashboard | Lectures | Homework | Marking | Students`.
  - `tests/api/helpers.ts`: `makeTestUser(role, o: { …; displayName?: string })`, and `adminSeedSubmission(assignmentId: string, studentId: string, o?: { submittedAt?: string; revision?: number; mark?: number | null; feedback?: string | null; markedAt?: string | null; name?: string }): Promise<{ id: string; objectPath: string }>`. It calls `trackObject('submissions', path)` **before** uploading a small `.ipynb` to `{a}/{s}/{uuid}.ipynb`, then inserts the row (default name `t_work.ipynb`, revision 1).

- [ ] **Step 1: Write failing tests.**
  - `marking.test.ts`: `formatMark(8)` → `'8'`, `(7.5)` → `'7.5'`, `(7.25)` → `'7.25'`, `(7.256)` → `'7.26'`; `markText(7.5, 10)` → `'7.5/10'`; `parseMarkInput(' 7.5 ')` → `{ ok: true, mark: 7.5 }`, `('')` → `Please enter a mark.`, `('abc')` → `Please enter a mark as a number.`, `('-1')` → `{ ok: true, mark: -1 }` (the range belongs to the DB)
  - `status.test.ts`: `hidden` → `Scheduled`, `upcoming` → `Upcoming`; `itemLabel` of a marked late item with mark 7 out of 10 → `Submitted · Late · Marked 7/10`; unmarked → equal to `statusLabel`
  - `marking.spec.ts` (teacher; students with `displayName: 't_name_<hex>'`):
    - `queue lists a submitted homework with the late flag, and the heading count equals the rows listed`: one late and one on-time submission seeded. Both rows are visible, only the late one says `(late)`, and the `n` in `Needs marking (n)` equals the number of `li` rows.
    - `teacher downloads, marks 7.5 with a comment, and the row leaves the queue` (`download.suggestedFilename()` = `t_work.ipynb`; DB `mark = 7.5`, `feedback` = the comment, `marked_at` set; the row is gone after the refresh)
    - `bad marks are refused and the typed comment stays` (`11` → `The mark must be between 0 and 10.`; empty → `Please enter a mark.`; `-1` → the range copy; the comment text is still in the textarea each time; the DB mark is still null) (Review Focus 2)
    - `a new upload after the page loaded is refused with the new-version message until the teacher downloads again`: with the page open, admin uploads a new object and sets `revision = 2, object_path = new`. Typing `8` and pressing Save → the alert shows the `revision` copy and the DB mark is null. Save again without downloading → the same alert. Click `Download`, then `Save` → `Saved.`, and the DB has `mark = 8` (Review Focus 1).
    - `excused and deactivated students' submissions are not in the queue` (admin sets `excused = true` for one and `is_active = false` for the other; neither row is listed)
    - `a student visiting /teacher/marking is sent to /`
- [ ] **Step 2:** `npm test -- marking status` and `npm run test:e2e -- marking` → FAIL.
- [ ] **Step 3:** Implement. Read the Next 16 server-action and `revalidatePath` guides first.
- [ ] **Step 4:** Both commands → PASS. `npm run test:e2e -- homework-teacher submit` still PASS.
- [ ] **Step 5: Commit** `feat: marking queue with mark, comment and new-version check`

---

### Task 4: Marking on the homework page

**Files:**
- Modify: `src/app/teacher/homework/[id]/page.tsx`
- Test: `tests/e2e/marking-homework.spec.ts`

**Interfaces:**
- Consumes: `<MarkForm>`, `itemLabel` (Task 3), `getHomeworkForTeacher` (all students, including excused and inactive).
- Produces: the `Student status` section lists one `<li aria-label="{studentName}">` per student with the text `{studentName}{studentIsActive ? '' : ' (inactive)'}: {itemLabel(item)}`. Under each student who has a submission it shows `Submitted <UkTime teacher>` and `<MarkForm item />`. With `isMarked` it also shows `Marked <UkTime teacher at={markedAt}>`, and the form is prefilled with the button `Update mark`.

- [ ] **Step 1: Write failing tests** (`marking-homework.spec.ts`):
  - `homework page shows each student's submission with mark entry and saves a mark` (two students, one submitted → only that `li` has the form; save `9` → the line reads `{name}: Submitted · On time · Marked 9/10`)
  - `a marked submission can be corrected with Update mark` (seeded mark 6 with `markedAt` −1 h → the form is prefilled with `6`; `Update mark` with `8` → DB `mark = 8`, `marked_at` later than the seed)
  - `an excused student's submission can be marked here` (admin `excused = true`; the line shows `Excused`, and saving `5` writes the mark)
  - `scheduled homework lists its students as Scheduled`
- [ ] **Step 2:** `npm run test:e2e -- marking-homework` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm run test:e2e -- marking-homework homework-teacher` → PASS (the Phase 2 lines `Test student: Submitted · On time` / `Test student: Pending` still match).
- [ ] **Step 5: Commit** `feat: mark and re-mark from the homework page`

---

### Task 5: Student marks, feedback, solution, the Marked tab and excused items

**Files:**
- Modify: `src/lib/homework/status.ts`, `src/lib/homework/queries.ts` (`listMySolutions`), `src/app/(student)/homework/page.tsx`, `src/app/(student)/homework/[id]/page.tsx`, `src/app/(student)/homework/[id]/SubmitPanel.tsx`, `tests/unit/status.test.ts`, `tests/api/helpers.ts`
- Test: `tests/e2e/marks-student.spec.ts`

**Interfaces:**
- Consumes: the `StudentItem` mark fields, `itemLabel`, `markText` (Task 3), `hasPassed`, `<DownloadButton>`, `<UkTime>`, the RLS on solution rows (Task 1).
- Produces:
  - `homeworkTab(item: StudentItem): 'pending' | 'submitted' | 'marked' | null` (Decision 10; `hidden`/`upcoming` → `null`)
  - `solutionNotice(i: { available: boolean; hasSubmission: boolean; isExcused: boolean; unlockedForAll: boolean; deadlinePassed: boolean }): string | null`. Available → `null`. Not submitted, not excused and not unlocked → `Submit your homework to unlock the solution.` Otherwise, deadline not passed → `The solution will be available after your deadline.` Otherwise → `No solution has been shared yet.`
  - `listMySolutions(client, assignmentIds: string[]): Promise<Map<string, FileRow>>`: one `assignment_files` query with `purpose = 'solution'` and `.in('assignment_id', ids)`, keeping the earliest row per assignment. An empty `ids` → an empty map with no query. RLS decides.
  - `/homework`: tabs `Pending | Submitted | Marked` via `?tab=pending|submitted|marked`, filtered by `homeworkTab`. Cards show `itemLabel`. Empty states: `Nothing to do right now.` / `Nothing submitted yet.` / `Nothing marked yet.`
  - `/homework/[id]`: the status line uses `itemLabel`. When `isMarked`, a section `Your mark` (`id="your-mark"`) shows `{markText}`, `Marked <UkTime at={markedAt}>`, and, if there is feedback, a heading `Teacher's comment` with the feedback in a `whitespace-pre-wrap` paragraph. A section `Solution` (`id="solution"`) shows `Download solution` for each visible solution row, or the `solutionNotice` text.
  - `<SubmitPanel>`: when `isExcused`, the form is replaced by (exact) `You've been excused from this homework. It doesn't count.` After any DB refusal it calls `router.refresh()` and keeps the alert, so a just-marked item shows `Marked. Your file is locked.`
  - `tests/api/helpers.ts`: `adminSeedSolution(assignmentId: string, originalName: string): Promise<{ fileId: string; objectPath: string }>` (`trackObject('solutions', path)` before the upload, then insert the `assignment_files` row).

- [ ] **Step 1: Write failing tests.**
  - `status.test.ts`: `homeworkTab` for pending, missed, done, done + marked, excused, excused + marked, and hidden; `solutionNotice` for each of the four outcomes.
  - `marks-student.spec.ts` (homework seeded by admin; due times relative to now):
    - `Marked tab lists marked homework with its mark; Submitted no longer does` (mark 8 → the Marked card shows `Submitted · On time · Marked 8/10`, and the Submitted tab doesn't list it)
    - `excused homework appears under Submitted as Excused and its page has no upload form`
    - `detail page shows mark, multi-line feedback as plain text, and the locked note` (feedback `"Good work.\nQ7 fails on <b>empty</b> lists."` → `Your mark` shows `8/10`, the paragraph's `innerText` contains the line break and the literal `<b>empty</b>`, there is no `b` element inside it, and `Marked. Your file is locked.` shows) (Review Focus 5)
    - `submitted and past the deadline: Download solution gets the original name` (`adminSeedSolution(id, 't_solution.ipynb')` → `suggestedFilename()` = `t_solution.ipynb`)
    - `not submitted, not unlocked, past the deadline: "Submit your homework to unlock the solution."` (and no `Download solution`)
    - `solution stays hidden before the student's own deadline even when unlocked for everyone` (class `due_at` −1 h, the student's `due_at_override` +1 h, `solution_unlocked_for_all = true` → the notice `The solution will be available after your deadline.`, no `Download solution`, and the student's API client `createSignedUrl` → error) (Review Focus 4)
    - `after the teacher marks, an open page's upload is refused with the marked copy and the page shows the locked state` (page open, admin sets a mark, upload → the alert shows `This has already been marked, so it can't be replaced.`, then `Marked. Your file is locked.` appears)
- [ ] **Step 2:** `npm test -- status` and `npm run test:e2e -- marks-student` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm run test:e2e -- marks-student homework-student submit home` → PASS.
- [ ] **Step 5: Commit** `feat: student marks, feedback, solutions and the Marked tab`

---

### Task 6: Progress library and queries

**Files:**
- Create: `src/lib/progress/types.ts`, `src/lib/progress/format.ts`, `src/lib/progress/queries.ts`, `tests/unit/progress.test.ts`, `tests/api/progress.test.ts`
- Modify: `src/lib/time/uk.ts`, `tests/unit/uk-time.test.ts`

**Interfaces:**
- Consumes: the `student_progress` view (`submitted, late, missed, pending` int; `hw_avg_pct, test_avg_pct` numeric 0–100 or null), `student_items`, `mapStudentItem` (imported from `@/lib/homework/map`), `profiles.last_seen_at`.
- Produces:
  - `type Progress = { submitted: number; late: number; missed: number; pending: number; hwAvgPct: number | null; testAvgPct: number | null }`; `type ProgressRow = { student_id: string; submitted: number; late: number; missed: number; pending: number; hw_avg_pct: number | string | null; test_avg_pct: number | string | null }`; `type GlanceRow = { studentId: string; displayName: string; username: string; lastSeenAt: string | null; progress: Progress }`
  - `EMPTY_PROGRESS: Progress` (zeros, `null` averages), `toProgress(row: ProgressRow | null): Progress` (`null` → `EMPTY_PROGRESS`; averages through `Number()` when not null), `formatPct(n: number | null): string` (`Math.round(n) + '%'`, `null` → `—`)
  - `getMyProgress(client, studentId: string): Promise<Progress>` (`.eq('student_id', studentId).maybeSingle()` → `toProgress`)
  - `listStudentsAtAGlance(client): Promise<GlanceRow[]>`: active students ordered by `display_name`, then one `student_progress` query `.in('student_id', ids)`. A student with no row gets `EMPTY_PROGRESS`.
  - `listMyHistory(client): Promise<StudentItem[]>` (own `student_items`, every kind, `effective_due_at` descending), `listRecentlyMarked(client, limit = 3): Promise<StudentItem[]>` (`is_marked`, `marked_at` descending)
  - `lastSeenLabel(at: Date | null, now: Date): string` in `uk.ts`. `null` → `Never`. Same UK day → `Today, 6:40 PM`. The previous UK day → `Yesterday, 6:40 PM`. Otherwise `{n} days ago` (UK calendar days, using the existing `ukDayNumber`).
  - None of these modules imports `next/server`. They don't read the clock, apart from the `now` argument.

- [ ] **Step 1: Write failing tests.**
  - `progress.test.ts`: `toProgress(null)` equals `EMPTY_PROGRESS`; `toProgress({…, hw_avg_pct: '82.50', test_avg_pct: null})` → `hwAvgPct: 82.5, testAvgPct: null`; `formatPct(82.5)` → `'83%'`, `(0)` → `'0%'`, `(null)` → `'—'`
  - `uk-time.test.ts`: `lastSeenLabel(null, now)` → `Never`; now `2026-10-21T12:00Z`: at `…21T05:40Z` → `Today, 6:40 AM`; at `…20T22:30Z` → `Yesterday, 11:30 PM`; at `…18T12:00Z` → `3 days ago`; UK-day boundary: now `2026-10-21T23:30Z` (00:30 UK on the 22nd), at `2026-10-21T22:00Z` → `Yesterday, 11:00 PM`; the same results under `TZ=Asia/Dhaka`
  - `api/progress.test.ts` (teacher and students from `makeTestUser`, homework from `adminSeedAssignment`):
    - `zero-item student: getMyProgress returns zeros and null averages, and listStudentsAtAGlance includes them with EMPTY_PROGRESS` (Review Focus 3)
    - `listStudentsAtAGlance excludes a deactivated student`
    - `numbers come from the view`: A due −2 h, submitted −1 h, mark 8/10; B due −1 h with no submission; C due +24 h, submitted → the student's `getMyProgress` gives `{ submitted: 2, late: 1, missed: 1, pending: 0, hwAvgPct: 40, testAvgPct: null }`, and the teacher's `listStudentsAtAGlance` row for that student is equal
    - `listRecentlyMarked returns only the student's own marked items, newest first, at most 3`
- [ ] **Step 2:** `npm test -- progress uk-time` and `npm run test:api -- progress` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Both → PASS.
- [ ] **Step 5: Commit** `feat: progress queries from student_progress with zero-row defaults`

---

### Task 7: Teacher dashboard (Needs marking, Students at a glance, homework status)

**Files:**
- Modify: `src/app/teacher/page.tsx`, `src/lib/homework/types.ts`, `src/lib/homework/queries.ts`
- Test: `tests/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: `<MarkingQueue>`, `listMarkingQueue`, `itemLabel` (Task 3), `<UnlockSolution>` (Task 2), `listStudentsAtAGlance`, `formatPct`, `lastSeenLabel` (Task 6), `<UkTime teacher>`.
- Produces:
  - `type HomeworkStatus = { id: string; title: string; dueAt: string; solutionUploaded: boolean; solutionUnlockedForAll: boolean; students: StudentItem[] }`; `listHomeworkStatus(client, limit: number): Promise<HomeworkStatus[]>` (homework ordered by `due_at` descending with `limit`, embedding `assignment_files(purpose)`, then one `student_items` query `.in('assignment_id', ids)`)
  - `/teacher`, in this order: heading `Teacher dashboard`; buttons `+ New homework` and `+ Upload lecture` (existing); `<MarkingQueue>` (`Needs marking (N)`, with marking inline as in the §6.2 wireframe) and a link `Open marking queue` → `/teacher/marking`; heading `Students at a glance` with a table whose column headers are exactly `Student | Submitted | Late | Missed | HW avg | Test avg | Last login` and one row per `GlanceRow` (`displayName`, the counts, `formatPct`, `lastSeenLabel`; the clock is read after `connection()`); heading `Homework status` listing `listHomeworkStatus(client, 5)` with `{title}` linked to `/teacher/homework/{id}`, `Due <UkTime teacher>`, one line `{name}: {itemLabel}` per student joined with ` · `, `Solution: uploaded` / `Solution: not uploaded`, and `<UnlockSolution>`. The `More coming soon.` line is removed.

- [ ] **Step 1: Write failing tests** (`dashboard.spec.ts`; students with `displayName` `t_name_<hex>`; rows found by name; no totals asserted):
  - `Needs marking shows the seeded row and N equals the rows listed`
  - `marking from the dashboard removes the row and lowers N by one`
  - `students at a glance shows the view's numbers`: the Task 6 seed (A late 8/10, B missed, C submitted) gives the student's row `2 · 1 · 1 · 40% · — ·` plus a `Last login` cell starting `Today` (after the student logs in once in another context)
  - `a new student with no items shows zeros and dashes`: row `0 · 0 · 0 · — · — · Never` (Review Focus 3)
  - `homework status lists the seeded homework with each student's status and the solution state, and Unlock works there` (`Solution: uploaded` after `adminSeedSolution`; confirming the unlock sets the flag)
- [ ] **Step 2:** `npm run test:e2e -- dashboard` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm run test:e2e -- dashboard marking` → PASS.
- [ ] **Step 5: Commit** `feat: teacher dashboard with needs-marking, students at a glance and homework status`

---

### Task 8: Student progress page and home tiles

**Files:**
- Create: `src/components/ProgressTiles.tsx`, `src/app/(student)/progress/page.tsx`
- Modify: `src/app/(student)/page.tsx`, `src/app/(student)/layout.tsx`
- Test: `tests/e2e/progress.spec.ts`

**Interfaces:**
- Consumes: `getMyProgress`, `listMyHistory`, `listRecentlyMarked`, `formatPct` (Task 6), `listMySolutions`, `itemLabel`, `markText` (Tasks 3, 5), `<UkTime>`.
- Produces:
  - `<ProgressTiles progress: Progress />`: five tiles in the §6.1 order, with exactly this text: `{submitted} Submitted`, `{late} Late`, `{missed} Missed`, `{formatPct(hw)} HW avg`, `{formatPct(test)} Test avg`
  - Home `/`, after the Pending section: heading `My progress`, `<ProgressTiles>`, and the link `See full history` → `/progress`. Then the heading `Recently marked` with up to 3 items: `{title}, {markText}`; the feedback in quotes (`whitespace-pre-wrap`) when present; and `View solution` → `/homework/{id}#solution` (`/tests/{id}` for `kind = 'test'`), shown only when `listMySolutions` has that id. Empty state: `Nothing marked yet.` The pending banner stays the first element (Phase 2 test).
  - `/progress`: heading `My progress`, `<ProgressTiles>`, the line (exact) `Missed work counts as 0%. Excused work and work not yet marked don't count in the averages.`, then a table with the column headers `Item | Type | Due | Status | Mark`. There is one row per `listMyHistory` item: the title linked as above, `Homework`/`Test`, `<UkTime at={effectiveDueAt}>`, `statusLabel`, and `markText` or `—`.
  - Student nav: `Home | Homework | Lectures | My Progress` (`/progress`; tests are added in Phase 4).

- [ ] **Step 1: Write failing tests** (`progress.spec.ts`):
  - `home shows My progress tiles from the view` (the Task 6 seed → `2 Submitted`, `1 Late`, `1 Missed`, `40% HW avg`, `— Test avg`)
  - `recently marked shows mark and feedback, and View solution only when the solution is open` (two marked items, only one with a solution and past its deadline → exactly one `View solution` link, pointing to `/homework/{id}#solution`)
  - `/progress shows the tiles and one history row per item with status and mark` (a row `{title} · Homework · … · Submitted · Late · 8/10`; a missed row `Missed · —`)
  - `a student with no items sees zeros and dashes on home and /progress` (`0 Submitted … — HW avg`, `Nothing marked yet.`, an empty table) (Review Focus 3)
  - `nav has My Progress`
- [ ] **Step 2:** `npm run test:e2e -- progress` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm run test:e2e -- progress home` → PASS.
- [ ] **Step 5: Commit** `feat: student progress page, home progress tiles and recently marked`

---

### Task 9: Deploy, live checks, README

**Files:**
- Modify: `README.md`, `supabase/project-settings.md`, `docs/superpowers/carried-requirements.md`
- Test: Phase 3 e2e specs against `BASE_URL=https://codeclass-tuition.netlify.app`

- [ ] **Step 1:** Full local run: `npm run lint && npm test && npm run test:db && npm run test:api && npm run test:e2e` → all PASS. `npm run build` → succeeds. Afterwards check with an admin query that no `t_` users, assignments or objects are left and that `miraz` is unchanged.
- [ ] **Step 2: Docs.** README: change "Phase 2 (current)" to "Phase 3 (current) includes". Add *Marking* (the queue and the dashboard; download first, then mark and comment; "new version" means download again; marks can be corrected with Update mark; marking locks the student's file; a test can't be marked until it ends). Add *Solutions* (upload/replace; who sees it and when, in the §4.4 rule in plain words; Unlock for everyone is one-way and still waits for each student's deadline). Add *Progress numbers* (§4.9 in plain words: late counts in Submitted too, missed = 0%, excused and unmarked work don't count, a new student shows zeros). `project-settings.md`: a restore needs migrations up to `20261025000007_marking_solutions.sql`. `carried-requirements.md`: mark (g), (h) and the solutions part of (k) as DONE in Phase 3 (naming the migration and files); (a), (d), (e), (i), (j) and the rest of (k) stay. Commit `docs: Phase 3 README, restore list, carried requirements`.
- [ ] **Step 3: Deploy once** (production deploy 1 of at most 2; the controller does this after the whole-branch review): push `phase-3-marking-progress`, `git checkout main && git merge --ff-only phase-3-marking-progress`, `git branch -f phase-0-1-foundation main`, then push `main` and `phase-0-1-foundation`. Wait for the Netlify production deploy to finish. `npx supabase migration list --db-url "$DATABASE_URL"` lists 14 migrations, ending with `20261025000007`. *Superseded 25 Oct 2026 (ruling R5): the teacher switched Netlify's production branch to `main`; deploy = fast-forward and push `main` only.*
- [ ] **Step 4: Live checks.** `BASE_URL=https://codeclass-tuition.netlify.app npm run test:e2e -- solutions-teacher marking marking-homework marks-student dashboard progress home submit login` → PASS. `curl -sI https://codeclass-tuition.netlify.app/` still shows the 307 to `/login` and the security headers.
- [ ] **Step 5:** Netlify **Usage**: record this deploy's credits under *Running costs* in the README, and the live-check date and result under the Phase 3 section. Commit `docs: Phase 3 deploy record`. This doc-only commit is not deployed separately: it rides along with the next deploy, or the controller spends deploy 2 of 2 only if a live fix is needed.

---

## Done when

- Every suite passes locally, and the Phase 3 e2e specs pass against `https://codeclass-tuition.netlify.app`.
- With `t_` accounts on the live site, the teacher uploads a solution, unlocks it for everyone, marks a late submission from the dashboard and corrects it from the homework page. A re-upload in between gets the "new version" message. The student sees the mark, the comment, the Marked tab, `View solution` only under §4.4, the progress tiles and `/progress`. The dashboard's Students at a glance shows the same numbers.
- Carried (g), (h) and the solutions part of (k) are done. The others are recorded for Phases 4–6. At most 2 production deploys were used.
- No real student data exists anywhere.
