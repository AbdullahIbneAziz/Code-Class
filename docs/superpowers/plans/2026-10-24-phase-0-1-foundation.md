# CodeClass Phase 0 + Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove username login on Supabase (Phase 0), then build the foundation (Phase 1): the full database with constraints, read-side rule functions and access rules, storage buckets and policies, username login with forced password change, teacher account management, and a first Netlify deployment.

**Architecture:** Next.js (App Router, TypeScript) on Netlify. Supabase (London) provides Auth, Postgres and Storage. Every rule lives in the database (RLS, `SECURITY DEFINER` functions, storage policies). The app uses a user-scoped Supabase client for everything except account administration, which uses an admin client confined to an allowlist of files.

**Tech Stack:** Node 22 LTS, Next.js (latest stable via `create-next-app@latest`), TypeScript, Tailwind CSS, `@supabase/supabase-js` v2, `@supabase/ssr`, Vitest, `pg` (DB tests), Playwright (e2e), `tsx` (scripts), Supabase CLI via `npx supabase` (migrations), Netlify.

**Spec:** [ARCHITECTURE.md](../../../ARCHITECTURE.md) (v2.2, approved 24 Oct 2026). Section numbers below (§) refer to it.

**Carried requirements:** [Requirements carried into later phases](../carried-requirements.md).

**Scope:** Phases 0 and 1 only (§16). Phases 2–6 get their own plans after this one ships, so they can use what Phase 0/1 teach us. Write functions that belong to later features (`finalize_submission`, `save_mark`, `create_assignment`, `update_assignment`, `set_exception`, `attach_file`, …) are **not** in this plan. Their tables are.

**Deviation from §16 (recorded):** §16 says Phase 1 proves 5 MB / 25 MB uploads "through the deployed site". Since v2, file bytes never pass through Netlify (§8.1), so Phase 1 proves the upload path with storage-policy integration tests against Supabase (Task 6). The browser-on-deployed-site upload proof moves to the first upload task of Phase 2, when an upload UI exists.

## Global Constraints

- Supabase region: **London (eu-west-2)**. Free plan only. Two projects at most: `codeclass-dev` (Phase 0, development and tests) and `codeclass-prod` (created in Phase 6).
- Supabase Auth settings: **Allow new users to sign up = OFF**, **Confirm email = OFF**, **Secure password change = OFF**, **no custom SMTP**, ever.
- Login address = `` `${username}@${NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN}` ``, with `NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN` defaulting to `email.com`. Usernames: lowercase, `^[a-z][a-z0-9_]{2,19}$`.
- App code must never call `auth.signUp`, `auth.resetPasswordForEmail`, `auth.signInWithOtp`, or `auth.updateUser({ email })`.
- Login error copy, exactly: **"Username or password is incorrect"**.
- Password rule: at least **8** characters, and not equal to the current/temporary password.
- Initial accounts: teacher `miraz`; the real student usernames are chosen by the teacher in Phase 6 and must never be written into this public repo (placeholders: `student1`, `student2`). Real accounts are created only in Phase 6. Use `t_`-prefixed test accounts until then.
- All times stored as `timestamptz`; deadline checks use `clock_timestamp()` read **after** taking a lock (§9.4); reads may use `now()`.
- Tables `assignments`, `assignment_files`, `assignment_students`, `submissions`, `lectures`, `lecture_files`, `replaced_files`, `app_meta`, `profiles`: **no `INSERT`/`UPDATE`/`DELETE` grant** to `anon` or `authenticated`. `SELECT` to `authenticated` only, filtered by RLS.
- Every function: `SET search_path = ''`, `REVOKE EXECUTE ... FROM public, anon`, `GRANT EXECUTE ... TO authenticated` (or `service_role` only where stated).
- Views use `WITH (security_invoker = true)`.
- Buckets `lectures`, `questions`, `solutions`, `submissions`: all private. Student uploads `.ipynb`/`.py` ≤ **5 MB**; teacher uploads ≤ **25 MB**; types per §10.1. No `UPDATE`/`DELETE` storage policies for anyone.
- Signed download URLs expire after **60** seconds.
- The admin client (`src/lib/supabase/admin.ts`) may be imported only by: `src/lib/accounts/*.ts`, `src/actions/account.ts`, `scripts/*.ts`, `tests/**`.
- UI: English only, product name **CodeClass**, light and dark theme.
- Secrets live only in `.env.local` (git-ignored) and Netlify environment variables. `.env.example` lists names only.

## Review Focus

1. **Usernames typed with capitals or spaces** (`"Student1 "`): expected to log in as `student1`. Test in Task 2 (`normalizeUsername`) and Task 9 (e2e login with `" T_Student "`).
2. **A user with `must_change_password` typing a deep URL** (`/teacher/students`, `/`): expected to be redirected to `/account/new-password` every time. Test in Task 8.
3. **A deactivated student with a still-open session**: expected to get no rows from any table and no files, straight away. Test in Task 5 (DB) and Task 10 (API session).
4. **The teacher creating a duplicate username, or one that differs only by case** (`Student2` vs `student2`): expected to be refused with "That username is already taken", leaving no half-created Auth user behind. Test in Task 10.
5. **Changing password with the wrong current password, or "changing" to the same password**: expected to be refused with a clear message, with the flag unchanged. Test in Task 11.

---

## File map

```
.env.example                     names of all settings
.gitignore                       .env*, .superpowers/, .remember/, node_modules, .next, test-results
netlify.toml
package.json                     scripts: dev, build, lint, test, test:db, test:e2e, db:push, phase0, create-teacher
playwright.config.ts
vitest.config.ts
README.md                        setup + teacher how-tos (grows each phase)
supabase/
  config.toml                    from `npx supabase init`
  migrations/
    20261024000001_schema.sql            tables, constraints, triggers (§9.1)
    20261024000002_access.sql            helper fns, grants, RLS (§11.1)
    20261024000003_rules.sql             can_* fns, views (§9.2, §9.3), touch_last_seen
    20261024000004_storage.sql           buckets + storage.objects policies (§10, §11.2)
  project-settings.md            dashboard-only settings (§14.1 item 7)
scripts/
  phase0-login-proof.ts
  create-teacher.ts
src/
  lib/
    config.ts                    reads env (NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN etc.)
    auth/username.ts             normalizeUsername, isValidUsername, usernameToEmail
    auth/password.ts             validateNewPassword
    supabase/browser.ts          createBrowserSupabase()
    supabase/server.ts           createServerSupabase()
    supabase/admin.ts            createAdminSupabase()  (server-only)
    accounts/students.ts         createStudent, resetStudentPassword, renameStudent, setStudentActive
    accounts/guard.ts            requireTeacher(userClient)
  actions/
    account.ts                   changePassword (server action)
    teacher-students.ts          server actions wrapping lib/accounts/students.ts
  middleware.ts                  session refresh, auth + role + must-change redirects, touch_last_seen
  app/
    layout.tsx, globals.css
    login/page.tsx, login/LoginForm.tsx
    account/page.tsx, account/new-password/page.tsx, account/PasswordForm.tsx
    (student)/page.tsx           student home placeholder
    teacher/layout.tsx, teacher/page.tsx, teacher/students/page.tsx
    auth/signout/route.ts
tests/
  unit/username.test.ts, unit/password.test.ts, unit/forbidden-calls.test.ts, unit/admin-boundary.test.ts
  db/helpers.ts, db/schema.test.ts, db/access.test.ts, db/rules.test.ts
  api/helpers.ts, api/storage.test.ts, api/accounts.test.ts, api/password.test.ts
  e2e/login.spec.ts, e2e/must-change.spec.ts, e2e/students.spec.ts
```

---

### Task 0: Teacher setup (manual, done by the teacher with the agent's guidance)

**Files:** none (produces `.env.local` values)

- [ ] **Step 1:** The teacher creates a free Supabase account and a project named `codeclass-dev`, region **London (eu-west-2)**, with a strong database password saved in their password manager.
- [ ] **Step 2:** In **Authentication → Sign In / Providers**: Email provider ON; **Allow new users to sign up OFF**; **Confirm email OFF**; **Secure password change OFF**. In **Authentication → Emails → SMTP**: leave the built-in mailer (no custom SMTP).
- [ ] **Step 3:** Copy into `I:\Programming Platform\.env.local` (never committed): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key), `SUPABASE_SERVICE_ROLE_KEY` (secret key), `DATABASE_URL` (Session pooler connection string), `NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN=email.com`.
- [ ] **Step 4:** The teacher creates a free GitHub account (if needed) and an empty **private** repository `codeclass`, and a free Netlify account. These are used in Task 12.

Verification: the agent runs `node -e "require('dotenv').config({path:'.env.local'}); console.log(['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','DATABASE_URL','NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN'].map(k=>k+':'+(process.env[k]?'set':'MISSING')).join('\n'))"` after Task 1 installs `dotenv`. Expected: all five `set`.

---

### Task 1: Project scaffold, tooling and Phase 0 login proof

Phase 0 runs here because it needs only the scaffold and `supabase-js`. **If the proof fails, stop the plan and report to the teacher** (§2.1 fallback).

**Files:**
- Create: whole scaffold (via `create-next-app`), `.gitignore`, `.env.example`, `vitest.config.ts`, `playwright.config.ts`, `supabase/config.toml`, `scripts/phase0-login-proof.ts`, `README.md`
- Test: `scripts/phase0-login-proof.ts` (is the test)

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `lint`, `test` (Vitest unit), `test:db` (Vitest `tests/db`), `test:api` (Vitest `tests/api`), `test:e2e` (Playwright), `db:push` (`supabase db push --db-url "$DATABASE_URL"`), `phase0`, `create-teacher`.

- [ ] **Step 1:** `npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm` (keep the existing `ARCHITECTURE.md`, `docs/`; move them aside if the tool refuses a non-empty folder, then move them back). `git init`, set the default branch to `main`.
- [ ] **Step 2:** Install: `@supabase/supabase-js @supabase/ssr server-only` and dev: `vitest pg @types/pg tsx dotenv @playwright/test supabase`. `npx playwright install chromium`. `npx supabase init`.
- [ ] **Step 3:** `.gitignore` adds `.env*` (except `.env.example`), `.superpowers/`, `.remember/`, `test-results/`, `playwright-report/`. `.env.example` lists the five names from Task 0 Step 3 with empty values.
- [ ] **Step 4: Write `scripts/phase0-login-proof.ts`.** Using the admin client and a separate anon client (`persistSession: false`), with username `t_p0_<random6>`:
  1. `admin.auth.admin.createUser({ email, password: 'Temp-pass-1', email_confirm: true })` → no error.
  2. anon `signInWithPassword` → session returned.
  3. anon `auth.signUp({ email: 't_p0_signup_<r>@email.com', password: 'Whatever-123' })` → **error** (sign-ups disabled). (Only this proof script may call `signUp`; Task 3's forbidden-calls test excludes `scripts/phase0-login-proof.ts`.)
  4. Rename: `admin.auth.admin.updateUserById(id, { email: newEmail, email_confirm: true })` → sign in with `newEmail` succeeds, old email fails.
  5. Reset: `updateUserById(id, { password: 'Temp-pass-2' })` → sign in with the new password succeeds, old fails.
  6. User-session `updateUser({ password: 'Own-pass-3' })` → sign in with `Own-pass-3` succeeds (proves "secure password change" is off).
  7. Cleanup: `admin.auth.admin.deleteUser(id)` (also delete any user created in 3 if it was created).
  Print `PASS <step>` / `FAIL <step>: <error>` per step, and exit 1 on any failure.
- [ ] **Step 5: Run** `npm run phase0`. Expected: `PASS` for steps 1–7, exit 0. If step 1 fails with `email_address_invalid`, **stop and report** (fallback: a domain the teacher controls, §2.1).
- [ ] **Step 6:** `npm run build` and `npm run lint` → both succeed. Add a trivial `tests/unit/sanity.test.ts` (`expect(1+1).toBe(2)`) and run `npm test` → PASS.
- [ ] **Step 7: Commit** `chore: scaffold Next.js app and prove username login on Supabase (Phase 0)`.

---

### Task 2: Username and password helpers

**Files:**
- Create: `src/lib/config.ts`, `src/lib/auth/username.ts`, `src/lib/auth/password.ts`
- Test: `tests/unit/username.test.ts`, `tests/unit/password.test.ts`

**Interfaces:**
- Produces:
  - `getLoginEmailDomain(): string` (env `NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN`, default `'email.com'`)
  - `normalizeUsername(raw: string): string` (trim, lowercase)
  - `isValidUsername(u: string): boolean` (regex `^[a-z][a-z0-9_]{2,19}$`, applied after normalizing)
  - `usernameToEmail(raw: string): string` → `` `${normalizeUsername(raw)}@${getLoginEmailDomain()}` ``
  - `validateNewPassword(newPw: string, confirm: string, currentPw: string): { ok: true } | { ok: false; message: string }`

- [ ] **Step 1: Write failing tests.**
  - `normalizeUsername(' Student1 ')` → `'student1'`
  - `isValidUsername('student2')` true; `'ab'` false; `'1abc'` false; `'a-b-c'` false; `'a'.repeat(21)` false
  - `usernameToEmail(' Miraz')` → `'miraz@email.com'`; with `NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN='example.org'` → `'miraz@example.org'`
  - `validateNewPassword('short', 'short', 'x')` → message `'Password must be at least 8 characters.'`
  - `validateNewPassword('abcdefgh', 'abcdefgX', 'x')` → `'The two new passwords don't match.'`
  - `validateNewPassword('Temp-pass-1', 'Temp-pass-1', 'Temp-pass-1')` → `'Choose a password different from your current one.'`
  - valid → `{ ok: true }`
- [ ] **Step 2:** `npm test` → FAIL (modules missing).
- [ ] **Step 3:** Implement the functions with the signatures above.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: username-to-login-email mapping and password rules`.

---

### Task 3: Supabase clients and code-boundary tests

**Files:**
- Create: `src/lib/supabase/browser.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`
- Test: `tests/unit/admin-boundary.test.ts`, `tests/unit/forbidden-calls.test.ts`

**Interfaces:**
- Produces:
  - `createBrowserSupabase(): SupabaseClient` (`@supabase/ssr` `createBrowserClient`)
  - `createServerSupabase(): Promise<SupabaseClient>` (`createServerClient` with Next `cookies()`)
  - `createAdminSupabase(): SupabaseClient` (service-role key, `auth: { persistSession: false, autoRefreshToken: false }`, file starts with `import 'server-only'`)

- [ ] **Step 1: Write failing tests.**
  - `admin-boundary`: walk `src/**/*.{ts,tsx}`. Any file importing `@/lib/supabase/admin` (or a relative path to it) must match the allowlist in Global Constraints. Assert the violations list is `[]`. Also assert `src/lib/supabase/admin.ts` contains `import 'server-only'`.
  - `forbidden-calls`: walk `src/**` and `scripts/**` except `scripts/phase0-login-proof.ts`. Assert no match for `/\.(signUp|resetPasswordForEmail|signInWithOtp)\s*\(/` or `/updateUser\(\s*\{[^}]*\bemail\b/`.
- [ ] **Step 2:** Run `npm test`. Expected: admin-boundary FAIL (file missing). forbidden-calls passes trivially, which is fine.
- [ ] **Step 3:** Implement the three client factories.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: Supabase client factories with admin-key import boundary`.

---

### Task 4: Database schema and constraints

**Files:**
- Create: `supabase/migrations/20261024000001_schema.sql`, `tests/db/helpers.ts`
- Test: `tests/db/schema.test.ts`

**Interfaces:**
- Produces: all tables in §9.1, exactly as named there, including `profiles.must_change_password boolean not null default true`, `profiles.joined_at timestamptz not null default now()`, `submissions.revision integer not null default 1`, `assignment_students.excused boolean not null default false`, and `app_meta(key text primary key, value text)`. Enums are `text` with `CHECK` (`role in ('teacher','student')`, `kind in ('homework','test')`, `purpose in ('question','solution')`).
- Produces (`tests/db/helpers.ts`):
  - `withTx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T>` (BEGIN … ROLLBACK, always)
  - `actAs(c, userId: string | null): Promise<void>` → `set local role authenticated` (or `anon` when null) plus `select set_config('request.jwt.claims', json_build_object('sub', userId, 'role', 'authenticated')::text, true)`
  - `seedUser(c, { role, username, isActive? }): Promise<string>` → inserts into `auth.users` (id, email, aud `'authenticated'`, role `'authenticated'`) and `public.profiles` as `postgres`; returns the id
  - `seedAssignment(c, partial): Promise<string>` and `assign(c, assignmentId, studentId, overrides?)`

Constraints (§4.8): `max_marks > 0`; `mark >= 0`; trigger `submissions_mark_le_max` raises when `mark > assignments.max_marks`; `assignments_time_order CHECK (visible_from <= opens_at AND opens_at < due_at)` (homework rows set `opens_at = visible_from`); `assignment_students_override_order CHECK (opens_at_override IS NULL OR due_at_override IS NULL OR opens_at_override < due_at_override)`; `profiles.username` unique; `submissions UNIQUE (assignment_id, student_id)`; FKs `ON DELETE CASCADE` from child rows to `assignments`/`lectures`, and `profiles.id → auth.users(id) ON DELETE CASCADE`.

- [ ] **Step 1: Write failing tests** in `tests/db/schema.test.ts` (each in `withTx`, as `postgres`):
  - `rejects max_marks of 0`: insert assignment with `max_marks = 0` → error code `23514`
  - `rejects opens_at after due_at` → `23514`
  - `rejects mark above max_marks`: max 10, mark 11 → raises (message contains `mark exceeds max_marks`)
  - `accepts mark equal to max_marks`
  - `rejects override window in wrong order` → `23514`
  - `rejects duplicate submission for same student and item` → `23505`
  - `rejects duplicate username` → `23505`
- [ ] **Step 2:** `npm run test:db` → FAIL (tables missing).
- [ ] **Step 3:** Write the migration. Apply it with `npm run db:push`. (If `supabase db push` asks for Docker, apply it with `psql "$DATABASE_URL" -f <file>` instead and note this in the README.)
- [ ] **Step 4:** `npm run test:db` → PASS.
- [ ] **Step 5: Commit** `feat(db): schema, constraints and DB test harness`.

---

### Task 5: Grants, helper functions and Row Level Security

**Files:**
- Create: `supabase/migrations/20261024000002_access.sql`
- Test: `tests/db/access.test.ts`

**Interfaces:**
- Produces:
  - `public.is_teacher() returns boolean`: true iff `auth.uid()` has a profile with `role = 'teacher' AND is_active`
  - `public.is_active_student() returns boolean`
  - Both `SECURITY DEFINER`, `STABLE`, `SET search_path = ''`, execute granted to `authenticated` only.
  - RLS enabled on every table in §9.1. `SELECT` policies exactly per §11.1. For `assignments`/`assignment_files` student visibility, policies call `public.can_see_assignment(id)` / `can_read_question` / `can_read_solution` from Task 6. In this migration, create them as stub functions returning `false`, and Task 6 replaces them with `CREATE OR REPLACE`.
  - `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated; GRANT SELECT ON <each table> TO authenticated;` plus `ALTER DEFAULT PRIVILEGES` so future tables are not auto-granted.

- [ ] **Step 1: Write failing tests** (`withTx` plus `actAs`):
  - `anon sees no rows in any table`: for each table, `select count(*)` as anon → permission error or 0
  - `student sees only own profile`: seed teacher, A, B; as A, `select id from profiles` → `[A]`
  - `teacher sees all profiles` → 3 rows
  - `student sees only own assignment_students rows`
  - `deactivated student sees nothing`: A `is_active = false`; as A, profiles/assignment_students/submissions → 0 rows (Review Focus 3)
  - `teacher cannot insert into assignments directly`: as teacher, `insert into assignments …` → error `42501`
  - `teacher cannot update or delete submissions directly` → `42501`
  - `student cannot update own profile` (e.g. set `role = 'teacher'`) → `42501`
  - `anon cannot execute is_teacher` → `42501`
- [ ] **Step 2:** `npm run test:db` → new tests FAIL.
- [ ] **Step 3:** Write the migration. `npm run db:push`.
- [ ] **Step 4:** `npm run test:db` → all PASS.
- [ ] **Step 5: Commit** `feat(db): grants, role helpers and row level security`.

---

### Task 6: Read-side rule functions, status views and last-seen

**Files:**
- Create: `supabase/migrations/20261024000003_rules.sql`
- Test: `tests/db/rules.test.ts`

**Interfaces:**
- Produces (all `STABLE`, `SET search_path = ''`, execute to `authenticated`):
  - `can_see_assignment(p_assignment uuid) returns boolean`: teacher, or (active student, assigned, `now() >= visible_from`)
  - `can_read_question(p_assignment uuid) returns boolean`: teacher, or (`can_see_assignment` and `now() >= effective_opens_at`)
  - `can_read_solution(p_assignment uuid) returns boolean`: teacher, or §4.4 exactly: solution row exists AND `now() >= effective_due_at` AND (has submission OR `solution_unlocked_for_all` OR excused)
  - `can_upload_now(p_assignment uuid) returns boolean`: active student, assigned, not excused, `now() >= effective_opens_at`, and for `kind='test'` `now() < effective_due_at`. (Used only by the storage insert policy. `finalize_submission` in Phase 2 re-checks with `clock_timestamp()`.)
  - View `student_assignment_facts` (`security_invoker = true`) with columns exactly per §9.2: `assignment_id, student_id, kind, effective_opens_at, effective_due_at, is_visible, is_excused, has_submission, is_late, is_marked, score_pct, action_state`. `action_state` in that order of precedence: `excused` → `hidden` → `done` (has_submission) → `upcoming` (test, before open) → `pending` → `missed`.
  - View `student_progress` (`security_invoker = true`): one row per student with `submitted, late, missed, pending, hw_avg_pct, test_avg_pct`, computed from facts per §4.9 (excluding excused; averages over marked plus missed-as-0; `null` when there's nothing to average).
  - `touch_last_seen() returns void`, `SECURITY DEFINER`: `update profiles set last_seen_at = now() where id = auth.uid() and (last_seen_at is null or last_seen_at < now() - interval '5 minutes')`.

- [ ] **Step 1: Write failing tests** (times relative to `now()`; fixtures via `seedAssignment`/`assign`):
  - `homework hidden before visible_from`: as student, `can_see_assignment` false, facts `action_state='hidden'`
  - `pending then missed`: due in +1h → `pending`; due −1h, no submission → `missed`
  - `late submission counts in submitted and late, and stays after marking` (§4.9): submitted after due, then `mark` set → progress `submitted=1, late=1`; facts `is_late=true, is_marked=true`
  - `extension turns late into on time`: `due_at_override` after `submitted_at` → `is_late=false`
  - `excused item excluded from counts and averages`
  - `missed counts as 0 in hw average`: one marked 8/10 plus one missed → `hw_avg_pct = 40`
  - `test questions locked before start, open during`: `can_read_question` false before `opens_at`, true after
  - `can_upload_now false after test end, true for homework after due`
  - `solution rule matrix` (§4.4): for {before / after the student's due} × {submitted / not} × {unlocked_for_all / not} × {excused / not}, assert `can_read_solution` equals `after_due AND (submitted OR unlocked OR excused)`. Include the case "unlocked_for_all but the student has an extension and it's before their due" → false.
  - `student cannot read another student's facts or progress`
  - `touch_last_seen updates at most every 5 minutes`
- [ ] **Step 2:** `npm run test:db` → FAIL.
- [ ] **Step 3:** Write the migration (replacing Task 5's stubs). `npm run db:push`.
- [ ] **Step 4:** `npm run test:db` → all PASS.
- [ ] **Step 5: Commit** `feat(db): rule functions and status/progress views`.

---

### Task 7: Storage buckets and policies

**Files:**
- Create: `supabase/migrations/20261024000004_storage.sql`, `supabase/project-settings.md`, `tests/api/helpers.ts`
- Test: `tests/api/storage.test.ts`

**Interfaces:**
- Produces: buckets `lectures`, `questions`, `solutions` (`public=false`, `file_size_limit = 26214400`) and `submissions` (`public=false`, `file_size_limit = 5242880`). Policies on `storage.objects` per §11.2. Path checks use `storage.foldername(name)` and `storage.extension(name)`. `submissions` insert requires `(storage.foldername(name))[2] = auth.uid()::text`, `can_upload_now(((storage.foldername(name))[1])::uuid)`, and extension in (`ipynb`,`py`). Teacher insert on the other three requires `is_teacher()` and an extension per §10.1. **No update or delete policies.**
- Produces (`tests/api/helpers.ts`):
  - `makeTestUser(role: 'teacher'|'student', opts?): Promise<{ id: string; username: string; password: string; client: SupabaseClient }>` (admin `createUser` + profile insert via admin, then signs in an anon client; usernames `t_<role>_<random6>`)
  - `cleanupTestUsers(): Promise<void>` (deletes every Auth user created in this run)
  - `adminSeedAssignment(partial): Promise<string>`, `adminAssign(assignmentId, studentId)`
  - `fileOfSize(bytes: number): Blob`
- `project-settings.md`: lists the Task 0 Step 2 auth settings and the bucket settings above (for §14.1 item 7).

- [ ] **Step 1: Write failing tests** (`afterAll(cleanupTestUsers)`):
  - `student uploads 5 MB .ipynb to own folder of an open homework` → success
  - `student upload over 5 MB is refused` (5 MB + 1 byte)
  - `student upload of .exe is refused`
  - `student cannot upload into another student's folder`
  - `student cannot upload to a closed test` (test with `due_at` in the past)
  - `student cannot overwrite an existing object` (`upsert: true` on same path) → refused
  - `student cannot delete own uploaded object` → refused (or nothing removed: verify via admin list)
  - `student cannot read another student's submission object` (`createSignedUrl` → error)
  - `teacher uploads 25 MB .pdf to lectures` → success (use the TUS resumable endpoint via `tus-js-client` if the standard upload rejects it; add `tus-js-client` as a dependency in that case)
  - `teacher cannot delete a stored object` → refused
  - `anon cannot list or read any bucket`
  - `signed URL expires after 60 seconds`: create one as the owner with `expiresIn: 60`, fetch → 200, wait 65 s, fetch → 400/403 (mark `{ timeout: 90_000 }`)
- [ ] **Step 2:** `npm run test:api -- storage` → FAIL.
- [ ] **Step 3:** Write the migration. `npm run db:push`. If storage policies can't be created through `db push`, apply that file with `psql` as `postgres` and note it in the README.
- [ ] **Step 4:** `npm run test:api -- storage` → all PASS.
- [ ] **Step 5: Commit** `feat(storage): private buckets with size, type and ownership policies`.

---

### Task 8: Middleware (session, role routing, forced password change, last seen)

**Files:**
- Create: `src/middleware.ts`, `src/app/(student)/page.tsx` (placeholder), `src/app/teacher/layout.tsx`, `src/app/teacher/page.tsx` (placeholder), `src/app/auth/signout/route.ts`, `src/app/layout.tsx` (header with "CodeClass", user's display name, Sign out)
- Test: `tests/e2e/must-change.spec.ts`

**Interfaces:**
- Consumes: `createServerClient` pattern from Task 3; `touch_last_seen()` from Task 6.
- Produces: redirect rules, applied in this order on every non-static request:
  1. Not logged in and path ≠ `/login` → `/login`
  2. Logged in and `must_change_password` and path ∉ {`/account/new-password`, `/auth/signout`} → `/account/new-password`
  3. Student and path starts with `/teacher` → `/`
  4. Teacher and path is `/` → `/teacher`
  5. Logged in and path = `/login` → home for the role
  6. Inactive profile (or no profile) → sign out, then `/login`
  - After the checks: `rpc('touch_last_seen')` (fire and forget; errors ignored)
- Placeholder pages: student home shows `Welcome, {display_name}` and the text "Your homework will appear here." Teacher home shows `Teacher dashboard`, a link to `/teacher/students`, and "More coming soon."

- [ ] **Step 1: Write failing e2e tests** (Playwright against `npm run dev`; users from `tests/api/helpers.ts`):
  - `logged-out visitor is sent to /login` for `/`, `/teacher`, `/account`
  - `user with must_change_password is sent to /account/new-password from /, /teacher/students and /account` (Review Focus 2)
  - `student visiting /teacher is sent to /`
  - `teacher visiting / is sent to /teacher`
  - `deactivated user is signed out and sent to /login`
- [ ] **Step 2:** `npm run test:e2e -- must-change` → FAIL.
- [ ] **Step 3:** Implement the middleware and placeholder pages. (The tests log in via the Task 9 page. If Task 9 isn't done yet, the tests set the session cookie programmatically with `@supabase/ssr`. Pick whichever is simpler; do Task 9 first if the order matters.)
- [ ] **Step 4:** `npm run test:e2e -- must-change` → PASS.
- [ ] **Step 5: Commit** `feat: auth middleware with role routing and forced password change`.

---

### Task 9: Login page

**Files:**
- Create: `src/app/login/page.tsx`, `src/app/login/LoginForm.tsx` (client component)
- Test: `tests/e2e/login.spec.ts`

**Interfaces:**
- Consumes: `usernameToEmail`, `createBrowserSupabase`.
- Produces: form fields `username` and `password`, and a "Log in" button. On submit: `signInWithPassword({ email: usernameToEmail(username), password })`. On any error, show exactly **"Username or password is incorrect"**. On success, `router.replace('/')` (the middleware routes from there). There are no "Sign up" or "Forgot password" links. Small help text: *"Forgot your password? Ask your teacher on WhatsApp."*

- [ ] **Step 1: Write failing e2e tests:**
  - `student logs in with username and lands on home showing Welcome`
  - `username with capitals and spaces works` (`" T_Student_x "`) (Review Focus 1)
  - `wrong password shows the generic message`
  - `unknown username shows the same generic message` (identical text)
  - `page has no sign-up or forgot-password link`
  - `sign out returns to /login and / redirects to /login again`
- [ ] **Step 2:** `npm run test:e2e -- login` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm run test:e2e -- login` → PASS.
- [ ] **Step 5: Commit** `feat: username login page`.

---

### Task 10: Teacher account management (create, reset, rename, deactivate)

**Files:**
- Create: `src/lib/accounts/guard.ts`, `src/lib/accounts/students.ts`, `src/actions/teacher-students.ts`, `src/app/teacher/students/page.tsx`, `scripts/create-teacher.ts`, `supabase/migrations/20261024000005_profile_checks.sql` (`CHECK (char_length(display_name) between 1 and 60)`)
- Test: `tests/api/accounts.test.ts`, `tests/e2e/students.spec.ts`

**Interfaces:**
- Consumes: `createAdminSupabase`, `createServerSupabase`, `normalizeUsername`, `isValidUsername`, `usernameToEmail`, `validateNewPassword` (length rule only).
- Produces:
  - `requireTeacher(userClient: SupabaseClient): Promise<{ userId: string }>`: throws `NotTeacherError` unless `rpc('is_teacher')` is true
  - `type AccountResult = { ok: true } | { ok: false; message: string }`
  - `createStudent(admin, input: { username: string; displayName: string; tempPassword: string }): Promise<AccountResult>`: normalize and validate the username (`'Usernames must be 3–20 characters: lowercase letters, numbers or _, starting with a letter.'`). If it's taken: `'That username is already taken.'`. Create the Auth user with `email_confirm: true`, then insert the profile (`role 'student'`, `must_change_password true`). **If the profile insert fails, delete the Auth user** before returning an error.
  - `resetStudentPassword(admin, studentId: string, tempPassword: string): Promise<AccountResult>`: sets the password and `must_change_password = true`
  - `renameStudent(admin, studentId: string, newUsername: string): Promise<AccountResult>`: validate, check uniqueness, update the Auth email (`email_confirm: true`), then `profiles.username`
  - `setStudentActive(admin, studentId: string, active: boolean): Promise<AccountResult>`: `ban_duration: '876000h'` / `'none'` plus `is_active`
  - Server actions in `src/actions/teacher-students.ts` with the same names suffixed `Action`, each calling `requireTeacher` first and then `revalidatePath('/teacher/students')`. They accept `FormData`.
  - `scripts/create-teacher.ts`: `npm run create-teacher -- --username miraz --name "Miraz" --password <temp>` creates the teacher (`role 'teacher'`, `must_change_password true`), and refuses if a teacher already exists.
- Page `/teacher/students`: a table (username, display name, active, last login in UK time via `Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London' })`), a "Add student" form, and per-row Reset password / Rename / Deactivate (or Reactivate). Temporary passwords are shown once after creation or reset, with a "Copy" button and the hint "Send this to the family on WhatsApp."

- [ ] **Step 1: Write failing tests** (`tests/api/accounts.test.ts`, calling the `lib/accounts` functions directly with the admin client):
  - `creates a student who can log in and must change password`
  - `refuses duplicate username, including different case` (`T_dup` after `t_dup`) → `'That username is already taken.'`, and the count of Auth users with that email is unchanged (Review Focus 4)
  - `refuses invalid username` with the exact message
  - `rolls back the Auth user when the profile insert fails` (force failure by pre-inserting a conflicting profile row id via a mocked admin, or by passing `displayName` longer than a `CHECK (char_length(display_name) <= 60)` you add in this task's migration `20261024000005_profile_checks.sql`)
  - `reset sets new password and must_change_password`
  - `rename changes login username; old username no longer logs in`
  - `deactivate blocks new logins and an existing session's API reads` (existing client → `from('profiles').select()` returns 0 rows) (Review Focus 3); `reactivate restores login`
  - `server actions reject a non-teacher caller` (call the action module's inner function with a student session → `NotTeacherError`)
  - e2e `students.spec.ts`: `teacher adds a student, sees the temp password once, and the student can log in`
- [ ] **Step 2:** Run `npm run test:api -- accounts` and `npm run test:e2e -- students` → FAIL.
- [ ] **Step 3:** Implement the lib functions, actions, page and script.
- [ ] **Step 4:** Both test commands → PASS. `npm test` (admin-boundary) still PASS.
- [ ] **Step 5: Commit** `feat: teacher account management and create-teacher script`.

---

### Task 11: Change password (forced and voluntary)

**Files:**
- Create: `src/actions/account.ts`, `src/app/account/page.tsx`, `src/app/account/new-password/page.tsx`, `src/app/account/PasswordForm.tsx`
- Test: `tests/api/password.test.ts`, extend `tests/e2e/must-change.spec.ts`

**Interfaces:**
- Consumes: `validateNewPassword`, `usernameToEmail`, `createServerSupabase`, `createAdminSupabase`.
- Produces:
  - `changePasswordCore(userClient, admin, input: { currentPassword: string; newPassword: string; confirmPassword: string }): Promise<AccountResult>`, in this order:
    1. `validateNewPassword`
    2. verify the current password with a **fresh** anon client (`persistSession: false`) `signInWithPassword` on the caller's own email (from `userClient.auth.getUser()`). On failure: `'Your current password is incorrect.'`
    3. `userClient.auth.updateUser({ password: newPassword })`
    4. admin `update profiles set must_change_password = false where id = <caller>`
  - `changePasswordAction(prev, formData)`: a server action wrapping the core. On success, redirect to `/` from `/account/new-password`, or show "Password changed." on `/account`.
  - `/account/new-password` heading: **"Choose your new password"** with the text *"This is a temporary password from your teacher. Please choose your own."* `/account` heading: **"My account"**, showing the username, display name and the same form.
- [ ] **Step 1: Write failing tests:**
  - `changes password and clears must_change_password`: new password logs in, old doesn't
  - `wrong current password is refused and the flag is unchanged` (Review Focus 5)
  - `same as current password is refused` (Review Focus 5)
  - `mismatched confirmation is refused`
  - e2e: `first login forces new password, then lands on home; the next login goes straight to home`
  - e2e: `after teacher reset, next login forces new password again`
- [ ] **Step 2:** Run `npm run test:api -- password` and `npm run test:e2e -- must-change` → new tests FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Both → PASS.
- [ ] **Step 5: Commit** `feat: forced and voluntary password change`.

---

### Task 12: First Netlify deployment and README

**Files:**
- Create: `netlify.toml` (`[build] command = "npm run build"`, `publish = ".next"`; Netlify's Next.js runtime is detected automatically)
- Modify: `README.md`
- Test: `tests/e2e/login.spec.ts`, `tests/e2e/must-change.spec.ts` and `tests/e2e/students.spec.ts` run against the deployed URL (`BASE_URL` env in `playwright.config.ts`)

- [ ] **Step 1:** Push `main` to the teacher's private GitHub repo `codeclass` (the teacher authorises `gh`/git credentials). Connect it in Netlify. Set environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (marked secret, scope: Functions/Runtime), `NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN` (not secret; set for build and runtime in all deploy contexts). In Supabase **Authentication → URL Configuration**, set Site URL to the Netlify URL.
- [ ] **Step 2:** Create the dev teacher on `codeclass-dev`: `npm run create-teacher -- --username t_teacher --name "Test Teacher" --password <temp>` (the real `miraz` account goes on `codeclass-prod` in Phase 6).
- [ ] **Step 3: Run** all three e2e specs against the deployed URL: `BASE_URL=https://<site>.netlify.app npm run test:e2e -- login must-change students` → PASS (with `BASE_URL` set, Playwright does not start the local server). Also verify on the deployed site: (a) a response that sets auth cookies (e.g. the login response or a sign-out) carries a `cache-control` header containing `no-store`; (b) the proxy runs on Netlify: a logged-out request to `/` returns a redirect to `/login` (`curl -sI https://<site>.netlify.app/`); `curl -sI https://codeclass-tuition.netlify.app/` shows X-Frame-Options, Content-Security-Policy (frame-ancestors) and Referrer-Policy on the 307 redirect; (c) `Netlify-CDN-Cache-Control` does not cache personalised responses (no public/s-maxage value on authenticated pages). Manually: log in as `t_teacher` on the deployed site, change the password, create a test student, log in as that student in a private window, change the password, and see the student home.
- [ ] **Step 4:** In the Netlify dashboard, check **Usage**: record the credits used by this first deploy in the README's "Running costs" section (§15.2 monitoring baseline).
- [ ] **Step 5: README** sections, written for the teacher: *What this is*; *Settings you need* (names from `.env.example`); *Run it on your computer*; *Create the teacher account*; *Add / reset / rename / deactivate a student*; *I forgot my own password* (supabase.com → Authentication → Users → set password, then log in and you'll be asked to choose a new one); *Supabase project paused* (supabase.com → project → Restore); *Deploying* (keep to about 10 deploys a month, §15.2); *Running costs* (baseline from Step 4).
- [ ] **Step 6: Run** the full suite locally: `npm run lint && npm test && npm run test:db && npm run test:api && npm run test:e2e` → all PASS.
- [ ] **Step 7: Commit and push** `chore: Netlify deployment config and README for Phase 1`.

---

## Done when

- `npm run phase0` passed (Task 1) and its result is recorded in the README.
- All five test suites pass locally, and the login e2e passes against the deployed site.
- The teacher can log in on the live site, is forced to change the temporary password, can create, reset, rename and deactivate test students, and a test student can log in and change their password.
- No real student data exists anywhere yet.
