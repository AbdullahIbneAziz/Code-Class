# Requirements carried into later phases

Found in the final Phase 0-1 review. Each must be done in the phase named.

- (a) **Phase 2, set_exception:** an override must never open before the item's `visible_from` (otherwise a student could upload to an item they can't see). Enforce it in `set_exception`, or add `now() >= visible_from` to `can_upload_now` and `can_read_solution`.
- (b) **Phase 3, update_assignment:** lock `max_marks` once any mark exists (§4.8). The DB trigger doesn't fire when `max_marks` is lowered.
- (c) **Phase 2:** the `assignment_students` student SELECT policy should also require `can_see_assignment(assignment_id)` once `set_exception` lands.
- (d) **Before Phase 6:** add a refuse-if-production guard for the api/e2e suites (check the project ref) and a sweep of `t_*` users.
- (e) **Phase 5:** make the storage policy migrations replay-safe for restore (§14.4): use `drop policy if exists`, and document applying 000004 then 000005.
- (f) **First Phase 2 change:** restrict who may import `src/lib/accounts/admin-client.ts` in the boundary test, and add `import 'server-only'` there.
- (g) The `student_progress` view has no row for a student with zero items, so the UI must treat a missing row as zeros.
- **Phase 3, save_mark:** lock the assignment row FOR SHARE (or stronger) before the assignment_students/submission rows, so it serializes with update_assignment's max_marks lock (update/set_students now take FOR NO KEY UPDATE; a KEY SHARE no longer waits). Task 7 finalize_submission must lock the assignment FOR KEY SHARE before its assignment_students row.
