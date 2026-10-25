# Requirements carried into later phases

Found in the final Phase 0-1 review. Each must be done in the phase named.

- (a) **Phase 5 (plan Decision 10), set_exception:** an override must never open before the item's `visible_from` (otherwise a student could upload to an item they can't see). Enforce it in `set_exception`, or add `now() >= visible_from` to `can_upload_now` and `can_read_solution`.
- (b) **DONE in Phase 2 (update_assignment, migration 20261025000003_assignments.sql):** lock `max_marks` once any mark exists (§4.8). The DB trigger doesn't fire when `max_marks` is lowered.
- (c) **DONE in Phase 2 (migration 20261025000001_rule_helpers.sql):** the `assignment_students` student SELECT policy should also require `can_see_assignment(assignment_id)` once `set_exception` lands.
- (d) **Before Phase 6:** add a refuse-if-production guard for the api/e2e suites (check the project ref) and a sweep of `t_*` users.
- (e) **Phase 5:** make the storage policy migrations replay-safe for restore (§14.4): use `drop policy if exists`, and document applying 000004 then 000005.
- (f) **DONE in Phase 2 (tests/unit/admin-boundary.test.ts and src/lib/accounts/admin-client.ts):** restrict who may import `src/lib/accounts/admin-client.ts` in the boundary test, and add `import 'server-only'` there.
- (g) The `student_progress` view has no row for a student with zero items, so the UI must treat a missing row as zeros.
- (h) **Phase 3, save_mark:** lock the assignment row FOR SHARE (or stronger) and the assignment_students row FOR UPDATE before touching submissions, so it serializes with update_assignment's max_marks lock (update/set_students now take FOR NO KEY UPDATE; a KEY SHARE no longer waits). Task 7 finalize_submission must lock the assignment FOR KEY SHARE before its assignment_students row.
- (i) **Before the first real student account:** run the api/e2e/committed-db test suites against a separate Supabase project, not the one the live site uses (codeclass-dev is both today), and add the t_* sweep from (d).
- (j) **Phase 4:** attach_file and replace_file lock the assignment FOR UPDATE, which briefly blocks students' finalize (KEY SHARE). Switch them to FOR NO KEY UPDATE. Switch the standard-upload error mapping from `statusCode` to `status`.
- (k) **Phase 5:** always upload with content type `application/octet-stream` and set bucket `allowed_mime_types`; tighten `can_upload_now` or rely on clean-up so post-lock uploads don't pile up orphans; `solutions_student_select` needs the same live-row check as I1 (migration 20261025000006 did lectures and questions).
