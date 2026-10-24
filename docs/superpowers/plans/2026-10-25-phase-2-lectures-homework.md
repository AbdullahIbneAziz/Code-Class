# CodeClass Phase 2 (Lectures + Homework) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The teacher uploads lectures and creates, schedules, edits and deletes homework (with question files and chosen students). Students see and download them, upload work that `finalize_submission` accepts as on time or late, see missed work, and get the pending banner first on their home page. The Phase 1 upload proof also runs here: 5 MB and 25 MB through the deployed site.

**Architecture:** Every write goes through checked `SECURITY DEFINER` functions (§9.3). Tables keep SELECT-only grants. File bytes go from the browser straight to Supabase Storage, using standard upload up to 6 MB and TUS resumable upload above it. The browser then calls `attach_file` / `replace_file` / `finalize_submission` with the user's own session. Form metadata (title, times, students) goes through Next server actions, which parse UK time and call the same functions with the user-scoped server client. Downloads use 60-second signed URLs from the user-scoped browser client, so storage RLS decides.

**Tech Stack:** As Phase 1 (Next.js 16.4 with `proxy.ts` and `cacheComponents`, `@supabase/ssr`, `supabase-js` v2, Vitest, `pg`, Playwright, Supabase CLI), plus `date-fns`, `date-fns-tz` (§7) and `tus-js-client` (§7).

**Spec:** [ARCHITECTURE.md](../../../ARCHITECTURE.md) (v2.2, approved 24 Oct 2026). Section numbers (§) refer to it. **Carried requirements:** [carried-requirements.md](../carried-requirements.md). **Style reference:** [Phase 0–1 plan](2026-10-24-phase-0-1-foundation.md).

**Scope:** §16 row 2 only. Not in this plan: marking, `save_mark`, solutions UI, `unlock_solution_for_all`, progress page, dashboard tables (Phase 3); class-test pages, countdown and warnings (Phase 4); `set_exception`, clean-up task, dark-mode polish (Phase 5). Shared functions are built with their full §9.3 signature and full §4.8 behaviour, so later phases only add callers.

**Decisions recorded for this phase**
1. Uploads go browser → Storage directly. Files over 6 MB use TUS with 6 MB chunks (§8.1, §8.2). The deferred Phase 1 proof (5 MB student notebook, 25 MB teacher file through `https://codeclass-tuition.netlify.app`) is written in Task 4 (teacher, 25 MB) and Task 9 (student, 5 MB) as `tests/e2e/upload-proof.spec.ts`, and run against the deployed site in Task 11.
2. Teacher write paths are only the functions listed in Global Constraints. Students write only through `finalize_submission`, which reads `clock_timestamp()` once, after taking the lock (§9.4).
3. UK time: form input is parsed as Europe/London. Nonexistent spring-forward times are refused. Ambiguous fall-back times need a BST/GMT choice (§12). Test dates: **28 Mar 2027 01:30** (nonexistent) and **31 Oct 2027 01:30** (ambiguous).
4. New homework has every active student ticked by default (§3.1 T5). Nothing auto-adds a student to older work (§4.7).
5. Pending banner: `⚠ You have N pending homeworks`, listed first (§3.2 S1, §6.1). N counts homework whose `action_state` is `pending` **or** `missed`, following the approved wireframe, where a late, unsubmitted homework sits under PENDING. Homework never closes. The §4.9 "Pending" *count* on the Phase 3 progress page is separate and unchanged.
6. Signed download URLs are valid for 60 s and created by the user-scoped client with `download: original_name` (§8.3). Original names are cleaned once, in SQL (`clean_file_name`, ≤ 120 chars, §10.2).
7. `replaced_files` gains a `bucket` column, because question and solution paths have the same shape (`{assignment_id}/{uuid}.{ext}`), so a bare path can't name its bucket.
8. `finalize_submission` takes a third parameter, `p_original_name`, because §9.4 stores `original_name` and the two-argument signature has no source for it. The size comes from storage metadata, not from the caller.
9. Carried **(b)**, locking `max_marks` once any mark exists, is pulled forward into `update_assignment` (Task 5). Phase 2 builds that function, and the rule is part of §4.8.
10. Carried **(a)** (override vs `visible_from`) is **deferred to Phase 5**, because Phase 2 never writes overrides. Carried **(c)** and **(f)** are done in Task 1.
11. `update_assignment` implements the §4.8 test rows too (start/end rules), with DB tests, so Phase 4 adds only pages.
12. 🔵 My call (spec silent): creating homework with a deadline that has already passed is refused, and a homework must have at least one student.

## Global Constraints

Still in force from Phase 0–1:
- Supabase `codeclass-dev` (London) is a **shared live dev DB**. DB tests run in `withTx` (always rolled back). Committed fixtures are allowed only through `tests/db/committed.ts` (Task 5), with `t_` names and guaranteed cleanup. API and e2e tests clean up with `cleanupTestUsers()`. Use only `t_`-prefixed test accounts. **No real student names anywhere** (public repo).
- Migrations are forward-only and date-prefixed. Never edit an applied migration. Phase 2 uses `20261025000001`–`20261025000004`. Apply with `npm run db:push` (fall back to `psql "$DATABASE_URL" -f <file>` as in Phase 1).
- Tables: no `INSERT`/`UPDATE`/`DELETE` grant to `anon`/`authenticated`. The whole-schema guard in `tests/db/access.test.ts` must stay green.
- Every new function: `SECURITY DEFINER` (except the pure helper `clean_file_name`), `SET search_path = ''`, fully qualified names, `REVOKE EXECUTE ... FROM public, anon`, `GRANT EXECUTE ... TO authenticated`. `clean_file_name` is granted to nobody. Teacher functions check `public.is_teacher()` first. The student function checks `public.is_active_student()`.
- Time-sensitive writes (`update_assignment`, `delete_assignment`, `set_assignment_students`, `finalize_submission`): take the row locks first, **then** `t := clock_timestamp()` once, and use `t` for every check and stored time.
- Buckets, extensions and sizes per §10.1/§10.5: submissions `.ipynb`/`.py` ≤ **5 MB** (5242880); questions/solutions `.ipynb .py .pdf .txt .zip` ≤ **25 MB** (26214400); lectures `.ipynb .py .pdf .pptx .png .jpg` ≤ 25 MB. Paths: `lectures/{lecture_id}/{uuid}.{ext}`, `questions/{assignment_id}/{uuid}.{ext}`, `solutions/{assignment_id}/{uuid}.{ext}`, `submissions/{assignment_id}/{student_id}/{uuid}.{ext}`. The extension is lowercased, and the user's file name is never in the path.
- Uploads never overwrite: `upsert: false` / TUS header `x-upsert: false`.
- Signed URLs: `expiresIn` **60**, user-scoped client only.
- Admin boundary: `src/lib/supabase/admin.ts` may be imported only by `src/lib/accounts/*.ts`, `src/actions/account.ts`, `scripts/*.ts`, `tests/**`. `src/lib/accounts/admin-client.ts` may be imported only by `src/actions/teacher-students.ts` and `tests/**`. **No Phase 2 file imports either.**
- No `auth.signUp`, `resetPasswordForEmail`, `signInWithOtp` or `updateUser({ email })` (forbidden-calls test).
- UI is English only, product name **CodeClass**. Copy marked "exact" below is verbatim.

New in Phase 2:
- **Next.js 16:** read the relevant guide in `node_modules/next/dist/docs/` before writing pages, actions or the proxy (AGENTS.md). The proxy is `src/proxy.ts`, not middleware. `cacheComponents` is on, so request-time data stays inside `<Suspense>`. `params`/`searchParams` are Promises. In a Server Component, read the clock only after a dynamic API (`cookies()` via the Supabase client, or `await connection()`).
- **Forms that carry files or may need a BST/GMT prompt** use `onSubmit` (`preventDefault` + `startTransition(() => action(formData))`), **not** `<form action>`, so a refused save doesn't reset typed values or chosen files.
- **Rule refusals** raise `errcode 'P0001'` with the user-facing message from the copy table below. A non-teacher calling a teacher function gets `errcode '42501'`, message `Teacher access required.` The app shows `error.message` for P0001, `You don't have permission to do that.` for 42501, and otherwise `Something went wrong. Please try again.` (`rpcErrorMessage`, Task 4).
- **UK time:** parse form input as `Europe/London` with `date-fns-tz`. Display in `Europe/London` with the zone (`GMT`/`BST`) and a small `UK time` label. Teacher screens add Bangladesh time (`Asia/Dhaka`) in grey. Students never see BD time.
- **Netlify:** at most **2** production deploys in Phase 2 (§15.2).

**DB refusal copy (exact):**

| Key | Message |
|---|---|
| title | `Please enter a title.` / `The title is too long (200 characters at most).` |
| max | `The maximum mark must be more than 0.` |
| order | `The deadline must be after the 'show from' time.` |
| past | `The deadline must be in the future.` |
| none | `Choose at least one student.` |
| inactive | `Only active students can be given work.` |
| shown | `The 'show from' time is locked because students can already see this.` |
| earlier | `You can't move the deadline earlier after someone has submitted. Use a per-student exception instead.` |
| pastnew | `The new deadline can't be in the past.` |
| maxlock | `The maximum mark is locked because marking has started.` |
| running | `Only the end time can be extended while the test is running.` |
| ended | `This test has finished, so its times are locked.` |
| delete | `This homework can't be deleted because someone has submitted.` |
| remove | `{display_name} has submitted, so they can't be removed. Excuse them instead.` |
| gone | `That item no longer exists.` |
| upload | `That upload wasn't found. Please try again.` |
| attached | `That file is already attached.` |
| acct | `Your account is not active.` |
| notyours | `This isn't assigned to you.` |
| notopen | `This isn't open yet.` |
| closed | `The test has closed. Uploads that finish after the end time are not accepted.` |
| marked | `This has already been marked, so it can't be replaced.` |
| ontime | `Your on-time submission can't be replaced after the deadline.` |

## Review Focus

1. **The teacher's computer is on Bangladesh time.** Typing 8:00 PM must save 8:00 PM UK, not 8:00 PM Dhaka, and the edit form must show 20:00 again. Test: Task 6 e2e with Playwright `timezoneId: 'Asia/Dhaka'`.
2. **A save is refused (ambiguous time, past deadline) after files were chosen.** Every typed value and chosen file stays, and the teacher only has to pick BST/GMT or fix the field. Test: Task 6 e2e "ambiguous time asks for BST or GMT and keeps the typed values".
3. **The upload succeeds but finalize refuses** (the deadline passed while the page was open). The student sees the reason, and their previous on-time submission and revision are unchanged. Tests: Task 7 DB "refused finalize leaves the previous submission unchanged", Task 9 e2e "deadline passes while the page is open".
4. **Odd file names**: `../../My HW (final).IPYNB`, 200-character names, control characters. The upload works, the path extension is lowercase, and the download name is cleaned to ≤ 120 characters with the extension kept. Tests: Task 3 DB `clean_file_name` cases, Task 4 unit `validateFile`/`newObjectPath`.
5. **A student guesses the URL of a scheduled homework, or one not assigned to them.** They get a 404 with no title shown, and its question-file signed URL is refused. Test: Task 8 e2e.

---

## File map

```
supabase/migrations/
  20261025000001_rule_helpers.sql        can_read_question via can_see_assignment; assignment_students policy (c)
  20261025000002_files_lectures.sql      replaced_files.bucket, unique object_path, clean_file_name, lecture fns, attach_file, replace_file
  20261025000003_assignments.sql         create/update/delete_assignment, set_assignment_students, view student_items
  20261025000004_finalize_submission.sql finalize_submission
src/
  proxy.ts                               uses decideRoute
  lib/auth/route-decision.ts             decideRoute (pure)
  lib/accounts/guard.ts                  requireTeacher: NotTeacherError only for "not a teacher"
  lib/accounts/admin-client.ts           + import 'server-only'
  lib/time/uk.ts                         parseUkLocal, formatUk*, formatBd, toUkInputParts, dueLabel
  lib/time/form.ts                       readUkField (server actions)
  lib/db/errors.ts                       rpcErrorMessage, ActionResult
  lib/files/rules.ts                     FileTarget, BUCKET, ALLOWED_EXT, MAX_BYTES, validateFile, newObjectPath
  lib/files/types.ts                     FileRow
  lib/files/upload.ts                    uploadObject (standard ≤ 6 MB, TUS above)
  lib/files/attach.ts                    uploadAndAttach, uploadAndReplace
  lib/files/submit.ts                    uploadAndFinalize
  lib/files/download.ts                  signedDownloadUrl
  lib/lectures/queries.ts                listLectures
  lib/homework/types.ts                  ActionState, StudentItem, TeacherHomework, TeacherHomeworkDetail
  lib/homework/queries.ts                listMyItems, getMyItem, listQuestionFiles, listHomeworkForTeacher, getHomeworkForTeacher, listActiveStudents
  lib/homework/status.ts                 statusLabel
  lib/homework/pending.ts                pendingBanner
  actions/lectures.ts                    create/update/deleteLectureAction
  actions/homework.ts                    create/update/deleteHomeworkAction, setHomeworkStudentsAction
  components/NavBar.tsx, UkTime.tsx, UkDateTimeField.tsx, DownloadButton.tsx, PendingCard.tsx
  app/(student)/layout.tsx               student nav: Home | Homework | Lectures
  app/(student)/page.tsx                 pending banner + list (Task 10)
  app/(student)/lectures/page.tsx
  app/(student)/homework/page.tsx, [id]/page.tsx, [id]/SubmitPanel.tsx
  app/teacher/layout.tsx                 NotTeacherError-only redirect + nav
  app/teacher/page.tsx                   + New homework / + Upload lecture buttons
  app/teacher/lectures/page.tsx, LectureForms.tsx
  app/teacher/homework/page.tsx, new/page.tsx, [id]/page.tsx, HomeworkForm.tsx, HomeworkFiles.tsx, HomeworkStudents.tsx, DeleteHomework.tsx
tests/
  unit/route-decision.test.ts, guard.test.ts, admin-boundary.test.ts (mod), uk-time.test.ts, file-rules.test.ts, status.test.ts, pending.test.ts
  db/helpers.ts (mod: seedObject, pool max 4), db/committed.ts, db/rules.test.ts (mod), db/access.test.ts (mod)
  db/files.test.ts, db/assignments.test.ts, db/finalize.test.ts
  api/helpers.ts (mod: trackFolder, trackLecture, replaced_files cleanup)
  e2e/lectures.spec.ts, e2e/homework-teacher.spec.ts, e2e/homework-student.spec.ts, e2e/submit.spec.ts, e2e/home.spec.ts, e2e/upload-proof.spec.ts
README.md, supabase/project-settings.md  (Task 11)
```

---

### Task 1: Phase 1 carry-overs (proxy errors, teacher guard, admin boundary, single-source question rule)

**Files:**
- Create: `src/lib/auth/route-decision.ts`, `supabase/migrations/20261025000001_rule_helpers.sql`
- Modify: `src/proxy.ts`, `src/lib/accounts/guard.ts`, `src/app/teacher/layout.tsx`, `src/lib/accounts/admin-client.ts`, `tests/unit/admin-boundary.test.ts`, `tests/db/access.test.ts`, `tests/db/rules.test.ts`
- Test: `tests/unit/route-decision.test.ts`, `tests/unit/guard.test.ts`

**Interfaces:**
- Produces:
  - `type RouteProfile = { role: 'teacher' | 'student'; is_active: boolean; must_change_password: boolean }`
  - `type RouteDecision = { kind: 'next' } | { kind: 'redirect'; to: string } | { kind: 'signout'; to: '/login' | null } | { kind: 'unavailable' }` (`signout` with `to: null` = sign out, then continue)
  - `STUDENT_PATH_PREFIXES = ['/homework', '/lectures', '/tests', '/progress']`
  - `decideRoute(i: { path: string; user: { id: string } | null; profile: RouteProfile | null; profileError: boolean }): RouteDecision`. Order: (1) no user → `/login` unless already there; (2) `profileError` → `next` for `/auth/signout`, else `unavailable` (**never sign out on an error**); (3) no profile or inactive → `signout` (`to: null` on `/login`); (4) must change; (5) student on `/teacher*` → `/`; (6) teacher on `/` or a student prefix → `/teacher`; (7) `/login` → role home; else `next`.
  - Proxy on `unavailable`: status **503**, body `CodeClass can't reach its database right now. Please try again in a minute.`, header `cache-control: no-store`, session untouched.
  - `requireTeacher` throws `NotTeacherError` only when there is no user or `is_teacher` returns `false`. An RPC error throws a plain `Error('Could not check teacher access: <message>')`. The teacher layout redirects to `/` only for `NotTeacherError` and rethrows anything else.
  - `can_read_question(p)` = `can_see_assignment(p) AND (is_teacher() OR <own assignment_students row with now() >= coalesce(opens_at_override, opens_at)>)`. The visibility/assignment/active rule then lives only in `can_see_assignment` (§8.1).
  - Policy `assignment_students_select` (carried c): student branch adds `public.can_see_assignment(assignment_id)`.

- [ ] **Step 1: Write failing tests.**
  - `route-decision.test.ts`: `profile error on / is unavailable, not signout`; `profile error on /auth/signout is next`; `no profile row signs out to /login`; `inactive on /login signs out with to null`; `teacher on /homework and /lectures/x goes to /teacher`; plus one case per existing rule (logged-out → `/login`; must-change → `/account/new-password`; student on `/teacher/students` → `/`; teacher on `/` → `/teacher`; logged-in on `/login` → role home).
  - `guard.test.ts` (fake client objects): `rpc error rejects with a non-NotTeacherError`; `is_teacher false rejects with NotTeacherError`; `no user rejects with NotTeacherError`; `teacher resolves { userId }`.
  - `admin-boundary.test.ts`: add `admin-client.ts is imported only by src/actions/teacher-students.ts` (same walker, resolving `@/lib/accounts/admin-client` and relative paths) and `admin-client.ts is server-only` (contains `import 'server-only'`). Check the current importers of both files when you start, because other work may have landed since this plan was written.
  - `access.test.ts`: `student cannot see assignment_students rows of a hidden homework` (visible_from +1h → 0 rows as the student; 1 row as the teacher).
  - `rules.test.ts`: `can_read_question uses can_see_assignment (single source)`: `pg_get_functiondef('public.can_read_question(uuid)'::regprocedure)` contains `can_see_assignment` and does not contain `visible_from`.
- [ ] **Step 2:** `npm test` and `npm run test:db` → the new tests FAIL.
- [ ] **Step 3:** Implement `decideRoute` and rewire `proxy.ts` to use it (keep cookie forwarding, cache headers and `touch_last_seen` as they are). Fix `guard.ts` and `teacher/layout.tsx`, add `import 'server-only'` to `admin-client.ts`, write the migration, then `npm run db:push`.
- [ ] **Step 4:** `npm run lint && npm test && npm run test:db` → all PASS. The existing `npm run test:e2e -- must-change login` also PASS.
- [ ] **Step 5: Commit** `fix: proxy keeps sessions on profile errors, NotTeacherError-only redirect, admin-client boundary, single-source question rule`

---

### Task 2: UK time library and form/display components

**Files:**
- Create: `src/lib/time/uk.ts`, `src/lib/time/form.ts`, `src/components/UkTime.tsx`, `src/components/UkDateTimeField.tsx`
- Modify: `package.json` (add `date-fns`, `date-fns-tz`)
- Test: `tests/unit/uk-time.test.ts`

**Interfaces:**
- Produces (`uk.ts`, pure, no dependence on the process time zone):
  - `UK_TZ = 'Europe/London'`, `BD_TZ = 'Asia/Dhaka'`, `type UkZone = 'GMT' | 'BST'`
  - `type ParseResult = { ok: true; instant: Date; zone: UkZone } | { ok: false; reason: 'nonexistent' | 'ambiguous' | 'invalid'; message: string }`
  - `parseUkLocal(date: string /* yyyy-MM-dd */, time: string /* HH:mm */, choice?: UkZone): ParseResult`
  - `ukZoneAt(d: Date): UkZone` (from `formatInTimeZone(d, UK_TZ, 'xxx') === '+01:00'`; never use the `zzz` token, which prints `GMT+1`)
  - `formatUk(d: Date): string` (pattern `EEE d MMM yyyy, h:mm a`), `formatUkWithZone(d: Date): string` (`… GMT|BST`), `formatBd(d: Date): string` (pattern `EEE d MMM, h:mm a` in `BD_TZ`)
  - `toUkInputParts(d: Date): { date: string; time: string; zone: UkZone }`
  - `dueLabel(due: Date, now: Date): string`. Compares **UK calendar days**: `Due today, 8:00 PM` / `Due tomorrow, 8:00 PM` / `Due Tue 21 Oct, 8:00 PM`. Past: `was due today, 8:00 PM` / `was due yesterday` / `was due Tue 21 Oct`.
- Produces (`form.ts`): `readUkField(fd: FormData, name: 'visibleFrom' | 'due', opts: { optional: boolean }): { ok: true; instant: Date | null } | { ok: false; message: string; needsZoneChoice?: true }`. It reads `${name}Date`, `${name}Time` and `${name}Zone`. Both date and time empty with `optional` → `instant: null`.
- Produces (components): `<UkTime at={iso} teacher?: boolean />` renders `formatUkWithZone`, a small `UK time` label, and, when `teacher`, a grey `· {formatBd} BD`. `<UkDateTimeField name label optional? defaultValue?: {date,time,zone} needsZoneChoice? />` renders `<input type="date" name="{name}Date">` and `<input type="time" name="{name}Time">`, plus, when `needsZoneChoice`, radios `{name}Zone` labelled `BST (first time)` / `GMT (second time)` under the legend `BST (first time) or GMT (second time)?`.
- Algorithm (`parseUkLocal`): validate the format (else `invalid`). Build the two candidates `new Date(`${date}T${time}:00Z`)` and `new Date(`${date}T${time}:00+01:00`)`. Keep those whose `formatInTimeZone(c, UK_TZ, "yyyy-MM-dd'T'HH:mm")` equals the input. 0 kept → `nonexistent`; 2 kept and no `choice` → `ambiguous`; 2 kept with `choice` → the `+01:00` candidate for BST or the `Z` candidate for GMT; 1 kept → that one.
- Copy (exact): nonexistent `This time doesn't exist in the UK on this day (clocks go forward). Please choose another time.`; ambiguous `This time happens twice in the UK on this day (clocks go back). BST (first time) or GMT (second time)?`; invalid `Please enter a valid date and time.`

- [ ] **Step 1: Write failing tests** (`uk-time.test.ts`; values are ISO UTC):
  - `parseUkLocal('2026-10-21','20:00')` → `2026-10-21T19:00:00.000Z`, `BST`; `('2026-12-01','20:00')` → `2026-12-01T20:00:00.000Z`, `GMT`
  - `('2027-03-28','01:30')` → `reason 'nonexistent'` with the exact message; `('2027-03-28','00:59')` → `00:59Z GMT`; `('2027-03-28','02:00')` → `01:00Z BST`
  - `('2027-10-31','01:30')` → `reason 'ambiguous'`; with `'BST'` → `2027-10-31T00:30:00.000Z`; with `'GMT'` → `2027-10-31T01:30:00.000Z`; `('2027-10-31','00:59')` → `2027-10-30T23:59Z BST`; `('2027-10-31','02:00')` → `02:00Z GMT`
  - `('2026-02-30','10:00')` and `('2026-10-21','25:00')` → `invalid`
  - `formatUkWithZone(new Date('2027-10-31T01:30:00Z'))` → `Sun 31 Oct 2027, 1:30 AM GMT`; `('2027-10-31T00:30:00Z')` → `Sun 31 Oct 2027, 1:30 AM BST`
  - `formatBd(new Date('2026-10-21T19:00:00Z'))` → `Thu 22 Oct, 1:00 AM`
  - `toUkInputParts(new Date('2026-10-21T19:00:00Z'))` → `{ date: '2026-10-21', time: '20:00', zone: 'BST' }`
  - `dueLabel`: now `2026-10-21T12:00Z`: due `…21T19:00Z` → `Due today, 8:00 PM`; `…22T19:00Z` → `Due tomorrow, 8:00 PM`; `…20T19:00Z` → `was due yesterday`. UK-day boundary: now `2026-10-21T23:30Z` (00:30 UK on the 22nd), due `2026-10-22T19:00Z` → `Due today, 8:00 PM`
  - `same output under TZ=Asia/Dhaka and TZ=Europe/London`: set `process.env.TZ` to each in turn and repeat the `formatUkWithZone`/`parseUkLocal` assertions
  - `readUkField`: empty optional → `{ ok: true, instant: null }`; empty required → `invalid`; ambiguous without `dueZone` → `needsZoneChoice: true`; with `dueZone=GMT` → the GMT instant
- [ ] **Step 2:** `npm test -- uk-time` → FAIL.
- [ ] **Step 3:** `npm install date-fns date-fns-tz`, then implement `uk.ts`, `form.ts` and the two components.
- [ ] **Step 4:** `npm test -- uk-time` → PASS. `npm run lint` → clean.
- [ ] **Step 5: Commit** `feat: UK time parsing with clock-change handling, UK/BD display`

---

### Task 3: File-row and lecture functions (DB)

**Files:**
- Create: `supabase/migrations/20261025000002_files_lectures.sql`
- Modify: `tests/db/helpers.ts`
- Test: `tests/db/files.test.ts`

**Interfaces:**
- Consumes: `is_teacher()`, the tables from 000001.
- Produces (SQL):
  - `replaced_files`: add `bucket text not null check (bucket in ('lectures','questions','solutions','submissions'))`, primary key → `(bucket, object_path)`. The table is empty, because nothing wrote to it in Phase 1. If it isn't empty, stop and report.
  - Unique indexes on `lecture_files(object_path)`, `assignment_files(object_path)` and `submissions(object_path)`.
  - `clean_file_name(p_name text) returns text`, `immutable`, not SECURITY DEFINER, executable by nobody. It removes control characters (`\x00-\x1f`, `\x7f`) and `/ \ : * ? " < > |`, trims whitespace and leading dots, and keeps the result ≤ **120** characters **including** the last extension (the base is truncated, not the extension). An empty result becomes `file`.
  - `create_lecture(p_title text, p_description text) returns uuid`; `update_lecture(p_lecture_id uuid, p_title text, p_description text) returns void`; `delete_lecture(p_lecture_id uuid) returns void` (inserts each file's `('lectures', object_path)` into `replaced_files`, then deletes the lecture; the files cascade). The title is trimmed, 1–200 characters (copy keys `title`). An empty description is stored as `null`.
  - `attach_file(p_target text /* 'lecture'|'question'|'solution' */, p_parent_id uuid, p_object_path text, p_original_name text) returns uuid`. The bucket comes from the target. The parent must exist (`gone`). `p_object_path` must be `{p_parent_id}/{uuid}.{ext}` and exist in `storage.objects` for that bucket (`upload`). It must not already be used by any file row or `replaced_files` (`attached`). `size_bytes` is `(storage.objects.metadata->>'size')::bigint` and `original_name` is `clean_file_name(p_original_name)`. The row goes to `lecture_files`, or to `assignment_files` with `purpose = p_target`.
  - `replace_file(p_target text, p_file_id uuid, p_object_path text, p_original_name text) returns void`. Same object checks. The row's purpose must match `p_target` (`gone`). It updates `object_path`, `original_name`, `size_bytes` and `created_at`, and queues the old path in `replaced_files`. **No §4.8 block:** question replace is allowed after submissions (the warning is a UI matter), and solutions and lectures can be replaced any time.
- Produces (`tests/db/helpers.ts`): `seedObject(c, bucket: string, name: string, sizeBytes: number, ownerId?: string): Promise<void>` (`insert into storage.objects (bucket_id, name, owner_id, metadata)` as `postgres` inside the tx). Raise the pool's `max` to **4**.
- Verify first: in a `withTx` scratch query, the `postgres` role can `select` from and `insert` into `storage.objects`. If it can't, stop and report, because `attach_file` depends on it.

- [ ] **Step 1: Write failing tests** (`files.test.ts`, all in `withTx`):
  - `clean_file_name cleans names` (call as `postgres`): `'../../My HW (final).IPYNB'` → `'My HW (final).IPYNB'`; `E'hw\n1.ipynb'` → `'hw1.ipynb'`; `'a:b*c?.py'` → `'abc.py'`; `repeat('a',200) || '.ipynb'` → `repeat('a',114) || '.ipynb'` (length 120); `'///'` → `'file'`
  - `teacher creates, updates and deletes a lecture; files move to replaced_files with bucket lectures`
  - `create_lecture refuses an empty or 201-character title` (P0001, exact copy)
  - `student and deactivated teacher get 42501 from every new function`
  - `attach_file records a lecture file with size from storage and a cleaned name` (seedObject 1234 bytes → `size_bytes = 1234`)
  - `attach_file refuses a missing object, another parent's folder and a nested path` (`upload`)
  - `attach_file refuses an object already attached` (`attached`)
  - `attach_file question/solution writes assignment_files with that purpose`; `attach_file refuses an unknown parent` (`gone`)
  - `replace_file swaps the path and queues the old one (bucket questions), even after a submission`
  - `replace_file refuses a purpose mismatch` (replacing a question row as `'solution'` → `gone`)
  - `anon cannot execute any new function; nobody can execute clean_file_name`
- [ ] **Step 2:** `npm run test:db -- files` → FAIL.
- [ ] **Step 3:** Write the migration, then `npm run db:push`.
- [ ] **Step 4:** `npm run test:db` → all PASS, including the existing whole-schema guard.
- [ ] **Step 5: Commit** `feat(db): lecture functions, attach_file/replace_file, cleaned file names`

---

### Task 4: Upload/download libraries, lectures pages, 25 MB teacher proof spec

**Files:**
- Create: `src/lib/db/errors.ts`, `src/lib/files/{rules,types,upload,attach,download}.ts`, `src/lib/lectures/queries.ts`, `src/actions/lectures.ts`, `src/components/NavBar.tsx`, `src/components/DownloadButton.tsx`, `src/app/teacher/lectures/page.tsx`, `src/app/teacher/lectures/LectureForms.tsx`, `src/app/(student)/layout.tsx`, `src/app/(student)/lectures/page.tsx`
- Modify: `src/app/teacher/layout.tsx` (nav), `src/app/teacher/page.tsx` (`+ Upload lecture` button), `tests/api/helpers.ts`, `package.json` (`tus-js-client`)
- Test: `tests/unit/file-rules.test.ts`, `tests/e2e/lectures.spec.ts`, `tests/e2e/upload-proof.spec.ts`

**Interfaces:**
- Consumes: Task 3 functions, `createBrowserSupabase`, `createServerSupabase`, `requireTeacher`, `<UkTime>`.
- Produces:
  - `type ActionResult = { ok: true } | { ok: false; message: string }`; `rpcErrorMessage(error: { code?: string; message: string } | null): string` (rules in Global Constraints)
  - `type FileTarget = 'lecture' | 'question' | 'solution' | 'submission'`; `BUCKET: Record<FileTarget, string>`; `ALLOWED_EXT: Record<FileTarget, string[]>`; `MAX_BYTES: Record<FileTarget, number>` (5242880 for submission, 26214400 otherwise)
  - `validateFile(file: { name: string; size: number }, target: FileTarget): { ok: true; ext: string } | { ok: false; message: string }`. Copy (exact): `This file type isn't allowed here. Allowed: .ipynb, .py` (the list follows `ALLOWED_EXT[target]` order); `This file is too big. The limit is 5 MB.` / `… 25 MB.`; `This file is empty.`
  - `newObjectPath(folder: string, ext: string): string` → `${folder}/${crypto.randomUUID()}.${ext}`
  - `type FileRow = { id: string; originalName: string; objectPath: string; sizeBytes: number; createdAt: string }`
  - `TUS_THRESHOLD_BYTES = 6 * 1024 * 1024`; `uploadObject(client: SupabaseClient, bucket: string, path: string, file: File, onProgress?: (fraction: number) => void): Promise<ActionResult>`. Up to the threshold it uses `storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' })` and calls `onProgress(1)` when done. Above it uses `tus-js-client` to `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable` with `headers: { authorization: 'Bearer <session access_token>', 'x-upsert': 'false' }`, `metadata: { bucketName, objectName: path, contentType, cacheControl: '3600' }`, `chunkSize: 6 * 1024 * 1024`, `uploadDataDuringCreation: true`, `removeFingerprintOnSuccess: true`, `retryDelays: [0, 3000, 5000, 10000]`. Failure copy: a 4xx refusal gives `The upload was refused. The file may be the wrong type or too big, or uploads may be closed.`; anything else gives `The upload failed. Check your internet connection and try again.`
  - `uploadAndAttach(client, i: { target: 'lecture' | 'question' | 'solution'; parentId: string; file: File; onProgress? }): Promise<{ ok: true; fileId: string } | { ok: false; message: string }>` (validate → path → `uploadObject` → `rpc('attach_file')`)
  - `uploadAndReplace(client, i: { target: 'lecture' | 'question' | 'solution'; parentId: string; fileId: string; file: File; onProgress? }): Promise<ActionResult>`
  - `signedDownloadUrl(client, bucket: string, objectPath: string, downloadName: string): Promise<{ ok: true; url: string } | { ok: false; message: string }>` (`createSignedUrl(objectPath, 60, { download: downloadName })`; failure copy `You can't download this file right now.`)
  - `<DownloadButton bucket objectPath downloadName label? />` (client): creates the URL with `createBrowserSupabase()` on click, then `window.location.assign(url)`. The default label is `Download`.
  - `<NavBar links={{ href: string; label: string }[]} />`. Teacher: `Dashboard | Lectures | Students` (Task 6 adds `Homework` after Dashboard). Student: `Home | Homework | Lectures`.
  - `type Lecture = { id: string; title: string; description: string | null; createdAt: string; files: FileRow[] }`; `listLectures(client): Promise<Lecture[]>` (newest first, embedded `lecture_files`)
  - `createLectureAction(i: { title: string; description: string }): Promise<{ ok: true; id: string } | { ok: false; message: string }>`, `updateLectureAction(i: { id: string; title: string; description: string }): Promise<ActionResult>`, `deleteLectureAction(id: string): Promise<ActionResult>`. Each one runs `requireTeacher` → `rpc` on the server user client → `revalidatePath('/teacher/lectures')` and `revalidatePath('/lectures')`.
  - `tests/api/helpers.ts`: `trackFolder(bucket: string, folder: string): void` (cleanup lists the folder recursively and removes every object), `trackLecture(id: string): void`. Cleanup also deletes `replaced_files` rows for the removed paths.
- Pages. `/teacher/lectures`: heading `Lectures`, form `Upload lecture` (fields `Title`, `Description (optional)`, `Files` multiple, button `Upload lecture`, progress `Uploading {name}… {pct}%`). Each lecture shows its files with `Download`/`Replace`, plus `Add file`, `Edit` and `Delete lecture` → `Confirm delete` / `Cancel`. If a file fails after the lecture was created, the page shows `The lecture was saved, but {name} didn't upload. Add it again below.` `/lectures` (student): heading `Lectures`, each lecture's title, description, `<UkTime>` and file `Download` buttons; empty state `No lectures yet.`

- [ ] **Step 1: Write failing tests.**
  - `file-rules.test.ts`: `validateFile({name:'My HW.IPYNB', size:10}, 'submission')` → `{ ok: true, ext: 'ipynb' }`; `.exe` → the exact type message listing `.ipynb, .py`; `5242881` bytes → `… limit is 5 MB.`; a lecture `.pptx` is ok and a question `.pptx` is refused; size 0 → `This file is empty.`; `newObjectPath('L1','ipynb')` matches `/^L1\/[0-9a-f-]{36}\.ipynb$/`; `rpcErrorMessage({code:'P0001', message:'X'})` → `'X'`, `{code:'42501'}` → `You don't have permission to do that.`, otherwise the generic message.
  - `lectures.spec.ts`: `teacher uploads a lecture with two files and a student downloads one with its original name` (`t_notes.pdf` 10 KB and `t_demo.ipynb` 2 KB; the student's `download.suggestedFilename()` is `t_notes.pdf`); `teacher replaces a lecture file and deletes a lecture after confirming`; `a .exe is refused in the page before any upload`; `a student has no teacher controls on /lectures`.
  - `upload-proof.spec.ts`: `teacher uploads a ~25 MB lecture file through the site (resumable)`. Write a `25*1024*1024 - 1024`-byte file to `test-results/t_big.pdf` and pass it with `setInputFiles(path)`. Assert that a request to `/storage/v1/upload/resumable` was made (`page.waitForRequest`), the file appears under the lecture, and the admin-listed object size equals the byte count. Timeout 180 s. All created objects are tracked with `trackFolder('lectures', lectureId)`.
- [ ] **Step 2:** `npm test -- file-rules` and `npm run test:e2e -- lectures upload-proof` → FAIL.
- [ ] **Step 3:** `npm install tus-js-client`, then implement the libraries, actions, components and pages.
- [ ] **Step 4:** Both commands → PASS. `npm test` (admin boundary) → PASS.
- [ ] **Step 5: Commit** `feat: direct-to-storage uploads (TUS over 6 MB), signed downloads, lectures pages`

---

### Task 5: Homework write functions and the `student_items` view (DB)

**Files:**
- Create: `supabase/migrations/20261025000003_assignments.sql`, `tests/db/committed.ts`
- Test: `tests/db/assignments.test.ts`

**Interfaces:**
- Consumes: `is_teacher()`, `student_assignment_facts`, `replaced_files.bucket` (Task 3).
- Produces (SQL; copy keys refer to the table in Global Constraints):
  - `create_assignment(p_kind text, p_title text, p_instructions text, p_max_marks numeric, p_visible_from timestamptz, p_opens_at timestamptz, p_due_at timestamptz, p_student_ids uuid[]) returns uuid`. `visible_from := coalesce(p_visible_from, now())`. For homework, `opens_at := visible_from` and `p_opens_at` is ignored. For a test, `opens_at := p_opens_at`. Checks: `title`, `max` (`p_max_marks > 0`), `order` (`due > opens_at`, plus `visible_from <= opens_at` for tests), `past` (`due > now()`), `none` (empty or null array), `inactive` (every id must be an active student). It inserts one `assignment_students` row per id with no overrides.
  - `update_assignment(p_assignment_id uuid, p_title text, p_instructions text, p_max_marks numeric, p_visible_from timestamptz, p_opens_at timestamptz, p_due_at timestamptz) returns void`. All arguments are required, and callers pass the current value for anything unchanged. **Lock** the `assignments` row `FOR UPDATE`, then all its `assignment_students` rows `ORDER BY student_id FOR UPDATE`, **then** `t := clock_timestamp()` (`gone` if missing). Let `submitted := exists(submission)` and `marked := exists(submission with mark)`. Rules (§4.8): title/instructions always change. `visible_from` changes only if `t < old.visible_from` (`shown`). `max_marks` changes only if not `marked` (`maxlock`, carried b). Homework `due`: later is always allowed; earlier needs not `submitted` (`earlier`) and `> t` (`pastnew`); homework `opens_at := visible_from`. Test times: if `t < old.opens_at`, anything goes (still `order`). If `old.opens_at <= t < old.due_at`, only `due_at` may change and only later (`running`). If `t >= old.due_at`, nothing changes (`ended`). Constraint checks repeat `order`.
  - `delete_assignment(p_assignment_id uuid) returns void`. Same lock and clock. Refuses if any submission exists (`delete`). Otherwise it queues every `assignment_files` path into `replaced_files` (bucket `questions`/`solutions` by purpose) and deletes the row.
  - `set_assignment_students(p_assignment_id uuid, p_student_ids uuid[]) returns void`. Same lock. Checks `none`, then `inactive` for each added id. Removing a student who has a submission is refused (`remove`, with their `display_name`). It inserts the added rows and deletes the removed ones.
  - View `public.student_items` (`security_invoker = true`, SELECT to `authenticated`): `student_assignment_facts f` joined to `assignments a`, `profiles p` (`student_name = p.display_name`) and left-joined to `submissions sub`. Columns: `assignment_id, student_id, student_name, kind, title, instructions, max_marks, visible_from, effective_opens_at, effective_due_at, action_state, is_excused, has_submission, is_late, is_marked, submitted_at, submission_name, submission_path, revision`.
- Produces (`tests/db/committed.ts`, for lock tests that need two sessions):
  - `type Committed = { userIds: string[]; assignmentIds: string[]; objects: { bucket: string; name: string }[] }`
  - `withCommitted<T>(seed: (c: pg.PoolClient, track: Committed) => Promise<void>, run: (track: Committed) => Promise<T>): Promise<T>`. It seeds with autocommit as `postgres` and always cleans up in `finally`: storage objects through the **admin Storage API** (direct SQL `DELETE` on `storage.objects` may be blocked by Supabase), then `replaced_files` rows for those names, then assignments, then `auth.users` by id. Objects for committed fixtures are created by uploading 1-byte files with the admin Storage API.
  - `session(): Promise<pg.PoolClient>` (a raw pool client; the caller runs `begin`, `actAs`, … and `release`).

- [ ] **Step 1: Write failing tests** (`assignments.test.ts`; `withTx` unless marked *committed*):
  - `create_assignment makes a homework with opens_at = visible_from and one row per ticked student`; `null visible_from publishes now`
  - `create_assignment refusals` (one assertion per key `title`, `max`, `order`, `past`, `none`, `inactive`; a teacher id in the list → `inactive`)
  - `a student who joins later gets no row for older homework, and set_assignment_students can add them by hand` (§4.7)
  - `student and anon cannot call any of the four functions` (42501)
  - Homework §4.8 matrix: `title and instructions change after a submission`; `show-from changes before visible, refused once visible`; `deadline later after a late submission turns it on time` (facts `is_late` becomes false); `deadline earlier with no submission is ok but not before now`; `deadline earlier after a submission is refused`; `max_marks changes before marking, refused once a mark exists`
  - Test-kind matrix: `before start any time can change`; `while running only a later end is accepted` (start move → `running`, earlier end → `running`); `after the end everything is locked` (`ended`)
  - `delete_assignment deletes and queues question files; refused after a submission`
  - `set_assignment_students removes an unsubmitted student, refuses one who submitted (with their name), refuses an empty list`
  - `student_items: a student sees own visible rows with title and status; hidden rows and other students' rows are absent; the teacher sees every row with student_name`
  - *committed* `update_assignment waiting on a lock past visible_from is refused`: homework with `visible_from = clock + 2 s`. Session A takes `select … from assignment_students … for update`. Session B calls `update_assignment` with a new `visible_from` and blocks. A runs `pg_sleep(3)` and commits. B fails with `shown`.
- [ ] **Step 2:** `npm run test:db -- assignments` → FAIL.
- [ ] **Step 3:** Write the migration and `committed.ts`, then `npm run db:push`.
- [ ] **Step 4:** `npm run test:db` → all PASS.
- [ ] **Step 5: Commit** `feat(db): create/update/delete homework and set students under the 4.8 rules`

---

### Task 6: Teacher homework pages (create, schedule, edit, students, question files, delete)

**Files:**
- Create: `src/lib/homework/types.ts`, `src/lib/homework/status.ts`, `src/lib/homework/queries.ts` (teacher half), `src/actions/homework.ts`, `src/app/teacher/homework/page.tsx`, `new/page.tsx`, `[id]/page.tsx`, `HomeworkForm.tsx`, `HomeworkFiles.tsx`, `HomeworkStudents.tsx`, `DeleteHomework.tsx`
- Modify: `src/app/teacher/layout.tsx` (nav `Homework`), `src/app/teacher/page.tsx` (`+ New homework`)
- Test: `tests/unit/status.test.ts`, `tests/e2e/homework-teacher.spec.ts`

**Interfaces:**
- Consumes: Task 5 functions and `student_items`, `readUkField`, `toUkInputParts`, `<UkDateTimeField>`, `<UkTime teacher>`, `uploadAndAttach`, `uploadAndReplace`, `<DownloadButton>`, `rpcErrorMessage`, `requireTeacher`.
- Produces:
  - `type ActionState = 'hidden' | 'upcoming' | 'pending' | 'missed' | 'done' | 'excused'`
  - `type StudentItem = { assignmentId: string; studentId: string; studentName: string; kind: 'homework' | 'test'; title: string; instructions: string | null; maxMarks: number; visibleFrom: string; effectiveOpensAt: string; effectiveDueAt: string; actionState: ActionState; isExcused: boolean; hasSubmission: boolean; isLate: boolean; isMarked: boolean; submittedAt: string | null; submissionName: string | null; submissionPath: string | null; revision: number | null }`
  - `statusLabel(item: StudentItem): 'Pending' | 'Missed' | 'Submitted · On time' | 'Submitted · Late' | 'Excused'` (from `actionState`/`isLate` only, never from the app clock)
  - `type TeacherHomework = { id: string; title: string; visibleFrom: string; dueAt: string; isScheduled: boolean; studentCount: number; submittedCount: number }`
  - `type TeacherHomeworkDetail = { id: string; title: string; instructions: string | null; maxMarks: number; visibleFrom: string; dueAt: string; isVisible: boolean; anySubmission: boolean; files: FileRow[]; students: StudentItem[] }`
  - `listHomeworkForTeacher(client): Promise<TeacherHomework[]>` (deadline newest first), `getHomeworkForTeacher(client, id: string): Promise<TeacherHomeworkDetail | null>`, `listActiveStudents(client): Promise<{ id: string; displayName: string; username: string }[]>`
  - `type HomeworkFormState = { ok: true; id: string } | { ok: false; message: string; zoneChoice?: ('visibleFrom' | 'due')[] } | null`
  - `createHomeworkAction(fd: FormData): Promise<HomeworkFormState>` and `updateHomeworkAction(fd: FormData): Promise<HomeworkFormState>`. Fields: `id` (update only), `title`, `instructions`, `maxMarks`, `visibleFrom{Date,Time,Zone}` (optional), `due{Date,Time,Zone}`, `studentIds` (create only, repeated). Each one runs `requireTeacher` → `readUkField` for both fields (collecting **all** zone choices before returning) → `rpc` → `revalidatePath('/teacher/homework')`.
  - `deleteHomeworkAction(id: string): Promise<ActionResult>`, `setHomeworkStudentsAction(id: string, studentIds: string[]): Promise<ActionResult>`
- Pages and copy:
  - `/teacher/homework`: heading `Homework`, button `+ New homework`. Rows show title, a `Scheduled` tag with `Shows from <UkTime teacher>` while hidden, `Due <UkTime teacher>`, and `{submitted}/{count} submitted`.
  - `/teacher/homework/new`: heading `New homework`. Fields `Title`, `Instructions`, `Maximum mark` (default `10`), `Show from (leave blank to publish now)`, `Deadline`, `Students` (every active student **checked by default**), `Question files` (multiple), button `Create homework`. On success the client uploads each file with `uploadAndAttach(target 'question')`, then navigates to `/teacher/homework/{id}`. If any file failed, it adds `?upload=failed`, and the edit page shows `The homework was saved, but a file didn't upload. Add it again below.`
  - `/teacher/homework/[id]`: the same form prefilled with `toUkInputParts`, button `Save changes`. `Show from` is disabled once visible, with the hint `Locked: students can already see this.`; any other refusal shows the DB message. A per-student status list shows `studentName: statusLabel(item)`. `Question files` has `Download`, `Replace` and `Add question file`. When `anySubmission`, the warning (exact) `Students who already downloaded the old file won't see the change. Tell them in class.` appears next to Replace. The `Students` checkboxes have a `Save students` button. `Delete homework` → `Confirm delete` / `Cancel`; success goes to `/teacher/homework`. An unknown id → `notFound()`.

- [ ] **Step 1: Write failing tests.** `status.test.ts`: one case per label (`done` + `isLate` → `Submitted · Late`; `done` → `Submitted · On time`; `missed` → `Missed`; `pending` → `Pending`; `excused` → `Excused`). Then `homework-teacher.spec.ts` (the teacher and two students from `makeTestUser`; created assignments tracked for cleanup; the fixed 2027 dates must stay in the future, so move them on if this suite is run after Oct 2027):
  - `new homework has every active student ticked and saves with a question file` (the DB has 2 `assignment_students` rows and 1 question row)
  - `teacher on a Bangladesh-time computer: 8:00 PM is saved as 8:00 PM UK` (context `timezoneId: 'Asia/Dhaka'`; deadline `2027-01-12` `20:00` → DB `due_at = 2027-01-12T20:00:00Z`; the list shows `Tue 12 Jan 2027, 8:00 PM GMT` and `Wed 13 Jan, 2:00 AM BD`; the edit form's time input has the value `20:00`) (Review Focus 1)
  - `ambiguous time asks for BST or GMT and keeps the typed values` (deadline `2027-10-31` `01:30`, a title and a chosen file → the legend `BST (first time) or GMT (second time)?` appears, the title and file are still set, choosing `GMT (second time)` saves `due_at = 2027-10-31T01:30:00Z`, and the page shows `1:30 AM GMT`) (Review Focus 2)
  - `nonexistent time is refused` (`2027-03-28` `01:30` → the exact nonexistent copy; nothing created)
  - `scheduled homework is listed as Scheduled and its show-from can be changed`
  - `after a submission: an earlier deadline is refused with the DB message and Replace shows the warning` (seed the submission via admin)
  - `unticking a student removes them; delete needs confirmation and is blocked after a submission`
- [ ] **Step 2:** `npm test -- status` and `npm run test:e2e -- homework-teacher` → FAIL.
- [ ] **Step 3:** Implement the types, `statusLabel`, queries, actions and pages.
- [ ] **Step 4:** `npm run test:e2e -- homework-teacher` → PASS. `npm run lint && npm test` → PASS.
- [ ] **Step 5: Commit** `feat: teacher homework create, schedule, edit, students, question files, delete`

---

### Task 7: `finalize_submission` (DB)

**Files:**
- Create: `supabase/migrations/20261025000004_finalize_submission.sql`
- Test: `tests/db/finalize.test.ts`

**Interfaces:**
- Consumes: `is_active_student()`, `clean_file_name`, `replaced_files.bucket`, `seedObject`, `withCommitted`/`session`.
- Produces: `finalize_submission(p_assignment_id uuid, p_object_path text, p_original_name text) returns uuid` (the submission id). Exactly §9.4, in this order:
  1. `select … from assignment_students where assignment_id = p and student_id = auth.uid() for update`, **then** `t := clock_timestamp()` (read once).
  2. Not an active student → `acct`. No row, or excused → `notyours`.
  3. The path must match `^{p}/{uid}/[0-9a-f-]{36}\.(ipynb|py)$`. The object must exist in bucket `submissions` with `owner_id = uid::text`. The path must not be in `replaced_files`. Otherwise → `upload`.
  4. If the current submission's `object_path = p_object_path`, return its id unchanged (idempotent double submit).
  5. `t < effective_opens_at` → `notopen`. Test and `t >= effective_due_at` → `closed`. Existing marked → `marked`. Existing on time (`submitted_at < effective_due_at`) and `t >= effective_due_at` → `ontime`.
  6. Upsert on `(assignment_id, student_id)`: `object_path`, `original_name = clean_file_name(p_original_name)`, `size_bytes` from `storage.objects.metadata->>'size'`, `submitted_at = t`, `revision = revision + 1` (or 1 on insert), and `mark`, `feedback`, `marked_at` cleared. Queue the previous path as `('submissions', old_path)`.

- [ ] **Step 1: Write failing tests** (`finalize.test.ts`; `withTx` unless *committed*; objects from `seedObject` with `owner_id` set to the student):
  - `first submission: revision 1, size from storage, cleaned name, submitted_at >= transaction start`
  - `one second before the deadline is on time` (due `clock_timestamp() + 1 s`, finalize at once → facts `is_late = false`); `after the deadline is late` (due `clock + 1 s`, `pg_sleep(1.2)`, finalize → `is_late = true`); `a missed homework becomes late once submitted`
  - `re-upload before the deadline gives revision 2 and queues the old path`
  - `refused finalize leaves the previous submission unchanged` (an on-time submission, then due moved to the past as `postgres`, then a new path → `ontime`; the row's path, revision and submitted_at are unchanged) (Review Focus 3)
  - `a late submission can still be replaced after the deadline`
  - `marked submission cannot be replaced` (`marked`); `excused or unassigned student` (`notyours`); `deactivated student` (`acct`); `teacher calling` (`acct`); `anon` (42501)
  - `path checks`: another student's folder, another assignment, a `.txt` extension, a missing object, an object owned by someone else, and a path already in `replaced_files` → all `upload`
  - `same path twice returns the same id and keeps the revision`
  - `test: before the start is refused (notopen); at or after the end is refused (closed)`
  - *committed* `finalize held across a test's end time is rejected and stores nothing`: test with `due_at = clock + 2 s`. Session A locks the `assignment_students` row. B calls finalize and blocks. A runs `pg_sleep(3)` and commits. B → `closed`, and no submission row exists.
  - *committed* `finalize held across a homework deadline stores a submitted_at after the deadline`: as above with homework. B succeeds, `submitted_at >= due_at` and `>=` A's `clock_timestamp()` read just before its commit (proves the clock is read after the lock).
  - *committed* `two finalize calls racing are applied one after the other`: two sessions call finalize at the same time with different paths. Both succeed, the final revision is 2, and the other path is in `replaced_files`.
- [ ] **Step 2:** `npm run test:db -- finalize` → FAIL.
- [ ] **Step 3:** Write the migration, then `npm run db:push`.
- [ ] **Step 4:** `npm run test:db` → all PASS.
- [ ] **Step 5: Commit** `feat(db): finalize_submission with lock-then-clock deadline rule`

---

### Task 8: Student homework list, detail and question download

**Files:**
- Create: `src/app/(student)/homework/page.tsx`, `src/app/(student)/homework/[id]/page.tsx`
- Modify: `src/lib/homework/queries.ts` (student half)
- Test: `tests/e2e/homework-student.spec.ts`

**Interfaces:**
- Consumes: `student_items`, `StudentItem`, `statusLabel` (Task 6), `dueLabel`, `<UkTime>`, `<DownloadButton>`.
- Produces:
  - `listMyItems(client): Promise<StudentItem[]>` (own rows, `kind = 'homework'`, ordered by `effective_due_at`), `getMyItem(client, assignmentId: string): Promise<StudentItem | null>`, `listQuestionFiles(client, assignmentId: string): Promise<FileRow[]>` (the RLS on `assignment_files` decides)
- Pages:
  - `/homework`: heading `Homework`, tabs `Pending` (pending + missed) and `Submitted` (done) via `?tab=pending|submitted` (default `pending`). The `Marked` tab arrives in Phase 3. Cards show the title, `dueLabel` (missed ones prefixed `LATE, `) and `statusLabel`, linking to `/homework/{id}`. Empty pending state: `Nothing to do right now.`
  - `/homework/[id]`: `notFound()` when `getMyItem` is null (hidden, unassigned or unknown). Shows title, instructions, `Due <UkTime>`, `statusLabel` and `Questions` with a `Download` per file (bucket `questions`). The `Your work` section is filled in by Task 9.

- [ ] **Step 1: Write failing tests.** `homework-student.spec.ts` (admin seeds; two students): `student sees a visible homework and downloads the question file with its original name`; `scheduled homework is not listed and its URL shows 404 without the title` (Review Focus 5); `homework assigned only to the other student is 404 and its question file cannot be signed` (`createSignedUrl` from the student's API client → error); `missed homework is under Pending as "LATE, was due …"`; `a teacher visiting /homework is sent to /teacher`.
- [ ] **Step 2:** `npm run test:e2e -- homework-student` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Both → PASS.
- [ ] **Step 5: Commit** `feat: student homework list and detail with question downloads`

---

### Task 9: Student upload and finalize (UI), 5 MB student proof

**Files:**
- Create: `src/lib/files/submit.ts`, `src/app/(student)/homework/[id]/SubmitPanel.tsx`
- Modify: `src/app/(student)/homework/[id]/page.tsx`, `tests/e2e/upload-proof.spec.ts`
- Test: `tests/e2e/submit.spec.ts`

**Interfaces:**
- Consumes: `validateFile('submission')`, `newObjectPath`, `uploadObject`, `rpc('finalize_submission')`, `rpcErrorMessage`, `StudentItem`, `<DownloadButton>`.
- Produces: `uploadAndFinalize(client, i: { assignmentId: string; studentId: string; file: File; onProgress? }): Promise<{ ok: true; submissionId: string } | { ok: false; message: string }>` (path `newObjectPath(`${assignmentId}/${studentId}`, ext)`, then upload, then finalize. On failure the uploaded object is left for Phase 5 clean-up.)
- `<SubmitPanel item={StudentItem} />` (client), heading `Your work`:
  - Input label `Choose your notebook (.ipynb or .py)`, button `Upload` (disabled while busy, showing `Uploading…`). On success: `router.refresh()`.
  - When `hasSubmission`: `Submitted <UkTime at={submittedAt}>`, `statusLabel`, and `Download` of own file (bucket `submissions`, `submissionPath`, `submissionName`), plus the note `You can replace your file until your teacher marks it.`
  - Locked states (input hidden): on time and the deadline has passed → `Your on-time submission is locked because the deadline has passed.`; `isMarked` → `Marked. Your file is locked.` A DB refusal message is shown verbatim in a `role="alert"` region.

- [ ] **Step 1: Write failing tests.**
  - `submit.spec.ts`: `student submits on time, sees "Submitted · On time" and downloads own file`; `student submits after the deadline and sees "Submitted · Late"` (seed due −1 h); `replacing before the deadline keeps one row at revision 2`; `wrong type and over-size files are refused in the page` (`.txt` → the type copy; `5242881` bytes → `… limit is 5 MB.`); `deadline passes while the page is open: the upload is refused with the on-time message and the first submission is unchanged` (submit on time, move `due_at` to the past via admin without reloading, upload again → the alert shows the `ontime` copy, and admin sees revision 1) (Review Focus 3).
  - `upload-proof.spec.ts`: add `student uploads a ~5 MB notebook through the site and it is finalized` (`5*1024*1024 - 1024` bytes as `test-results/t_hw.ipynb` → `Submitted · On time`, admin submission revision 1 with matching `size_bytes`; tracked with `trackFolder('submissions', assignmentId)`).
- [ ] **Step 2:** `npm run test:e2e -- submit upload-proof` → the new tests FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm run test:e2e -- submit upload-proof` → PASS.
- [ ] **Step 5: Commit** `feat: student upload and finalize with on-time, late and replace rules`

---

### Task 10: Student home with the pending banner

**Files:**
- Create: `src/lib/homework/pending.ts`, `src/components/PendingCard.tsx`
- Modify: `src/app/(student)/page.tsx`
- Test: `tests/unit/pending.test.ts`, `tests/e2e/home.spec.ts`

**Interfaces:**
- Consumes: `listMyItems`, `dueLabel`, `statusLabel`, `<DownloadButton>`, `listQuestionFiles`.
- Produces: `pendingBanner(items: StudentItem[]): { count: number; text: string; items: StudentItem[] }`. It keeps `kind = 'homework'` with `actionState` in (`pending`, `missed`). Order: pending by `effectiveDueAt` ascending, then missed by `effectiveDueAt` descending (the §6.1 order). Text (exact): N ≥ 2 → `⚠ You have N pending homeworks`; 1 → `⚠ You have 1 pending homework`; 0 → `✓ You're all caught up.`
- Home `/`: `Welcome, {display_name}`, then the banner as the **first** element of `<main>` after the welcome line (`role="status"`), then the heading `Pending` and one `<PendingCard>` per item: title, `dueLabel` (missed prefixed `LATE, `), `Download` (first question file; omitted if none) and `Upload` (link to `/homework/{id}#your-work`). Progress, upcoming test and recently marked sections arrive in Phases 3–4.

- [ ] **Step 1: Write failing tests.**
  - `pending.test.ts`: `counts pending and missed homework only` (`done`, `excused`, `hidden`, `upcoming` and any `test` excluded); `orders pending soonest first, then missed most recent first`; the three text forms exactly.
  - `home.spec.ts`: `home shows the banner first with the count and the list` (seed 1 pending + 1 missed + 1 submitted → `⚠ You have 2 pending homeworks`; the cards appear in order with `Upload` on both and `Download` on the one with a file); `submitting removes it from the banner` (→ `⚠ You have 1 pending homework`); `a student with nothing to do sees "✓ You're all caught up."`.
- [ ] **Step 2:** `npm test -- pending` and `npm run test:e2e -- home` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Both → PASS.
- [ ] **Step 5: Commit** `feat: student home with pending homework banner`

---

### Task 11: Deploy, upload proof on the live site, README

**Files:**
- Modify: `README.md`, `supabase/project-settings.md`
- Test: every Phase 2 e2e spec against `BASE_URL=https://codeclass-tuition.netlify.app`

- [ ] **Step 1:** Full local run: `npm run lint && npm test && npm run test:db && npm run test:api && npm run test:e2e` → all PASS. `npm run build` → succeeds.
- [ ] **Step 2:** Deploy once (production deploy 1 of at most 2): the controller pushes and merges the Phase 2 branch so Netlify builds `main`. Migrations 000001–000004 were already applied to `codeclass-dev` by Tasks 1, 3, 5 and 7. Confirm with `npx supabase migration list --db-url "$DATABASE_URL"`, which should list all eleven.
- [ ] **Step 3: The deferred Phase 1 proof.** `BASE_URL=https://codeclass-tuition.netlify.app npm run test:e2e -- upload-proof` → both tests PASS (25 MB teacher lecture through TUS, 5 MB student notebook finalized). Then run `BASE_URL=… npm run test:e2e -- lectures homework-teacher homework-student submit home login must-change` → PASS. Re-check `curl -sI https://codeclass-tuition.netlify.app/` still shows the 307 to `/login` with `X-Frame-Options`, `Content-Security-Policy` and `Referrer-Policy`.
- [ ] **Step 4:** Netlify **Usage**: record this deploy's credits under *Running costs* in the README.
- [ ] **Step 5: README** (written for the teacher): update "Phase 2 (current) includes"; *Upload a lecture*; *Create and schedule homework* (blank "show from" publishes now; everyone is ticked, so untick to exclude; new students only get work created after they join); *Edit homework after it's published* (the §4.8 table in plain words, with the question-replace warning); *UK time and clock changes* (times are UK; BD time shown in grey; the March gap refused, the October hour asks BST or GMT); *What students see* (pending banner, on time / late / missed, replacing until marked, on-time work locked after the deadline); *Upload proof* (date and result of Step 3). In `project-settings.md`: note `replaced_files.bucket`, and that a project restore needs migrations 20261025000001–000004.
- [ ] **Step 6: Commit** `docs: Phase 2 README and deployed upload proof`

---

## Done when

- Every suite passes locally, and the Phase 2 e2e specs, including `upload-proof`, pass against `https://codeclass-tuition.netlify.app`.
- With `t_` accounts on the live site, the teacher can upload a lecture, create a scheduled homework with a question file, edit it within the §4.8 rules and delete it. A student sees it appear at the "show from" time, downloads it, submits on time or late, sees missed work, and sees `⚠ You have N pending homeworks` first on the home page.
- Carried (c) and (f) are done, and (b) is done early. Carried (a) is recorded as Phase 5 work (`set_exception`), and `unlock_solution_for_all` as Phase 3 work.
- No real student data exists anywhere.
