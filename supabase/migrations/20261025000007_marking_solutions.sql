-- Phase 3 Task 1: marking (save_mark), unlock_solution_for_all, live-row solution reads, student_items columns.
-- Lock order everywhere: assignment, then assignment_students, then submissions, then clock_timestamp() once.
-- save_mark takes the assignment FOR SHARE: it conflicts with update_assignment / set_assignment_students /
-- unlock_solution_for_all (NO KEY UPDATE) and delete_assignment (UPDATE), but not with finalize_submission's
-- KEY SHARE, which then serialises with save_mark on the assignment_students row.

create function public.save_mark(p_submission_id uuid, p_expected_revision integer, p_mark numeric, p_feedback text)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_a uuid;
  v_s uuid;
  a public.assignments%rowtype;
  s public.assignment_students%rowtype;
  cur public.submissions%rowtype;
  t timestamptz;
begin
  if not (select public.is_teacher()) then
    raise exception 'Teacher access required.' using errcode = '42501';
  end if;

  -- These keys never change, so reading them without a lock is safe.
  select assignment_id, student_id into v_a, v_s from public.submissions where id = p_submission_id;
  if not found then
    raise exception 'That item no longer exists.' using errcode = 'P0001';
  end if;

  perform 1 from public.assignments where id = v_a for share;
  if not found then
    raise exception 'That item no longer exists.' using errcode = 'P0001';
  end if;
  select * into s from public.assignment_students where assignment_id = v_a and student_id = v_s for update;
  if not found then
    raise exception 'That item no longer exists.' using errcode = 'P0001';
  end if;
  select * into cur from public.submissions where id = p_submission_id for update;
  if not found then
    raise exception 'That item no longer exists.' using errcode = 'P0001';
  end if;
  -- Then the clock, once.
  t := clock_timestamp();

  -- Read after the locks so concurrent committed changes are visible.
  select * into a from public.assignments where id = v_a;

  if p_expected_revision is distinct from cur.revision then
    raise exception 'This student uploaded a new version. Please download it again.' using errcode = 'P0001';
  end if;
  if p_mark is null then
    raise exception 'Please enter a mark.' using errcode = 'P0001';
  end if;
  if p_mark < 0 or p_mark > a.max_marks then
    raise exception 'The mark must be between 0 and %.', trim_scale(a.max_marks)::text using errcode = 'P0001';
  end if;
  if length(btrim(p_feedback)) > 2000 then
    raise exception 'The comment is too long (2000 characters at most).' using errcode = 'P0001';
  end if;
  if a.kind = 'test' and t < coalesce(s.due_at_override, a.due_at) then
    raise exception 'This test is still running. Mark it after it ends.' using errcode = 'P0001';
  end if;

  update public.submissions
    set mark = p_mark,
        feedback = nullif(btrim(coalesce(p_feedback, '')), ''),
        marked_at = t
    where id = p_submission_id;
end;
$$;

revoke execute on function public.save_mark(uuid, integer, numeric, text) from public, anon;
grant execute on function public.save_mark(uuid, integer, numeric, text) to authenticated;

create function public.unlock_solution_for_all(p_assignment_id uuid) returns void
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  if not (select public.is_teacher()) then
    raise exception 'Teacher access required.' using errcode = '42501';
  end if;
  perform 1 from public.assignments where id = p_assignment_id for no key update;
  if not found then
    raise exception 'That item no longer exists.' using errcode = 'P0001';
  end if;
  update public.assignments set solution_unlocked_for_all = true where id = p_assignment_id;
end;
$$;

revoke execute on function public.unlock_solution_for_all(uuid) from public, anon;
grant execute on function public.unlock_solution_for_all(uuid) to authenticated;

-- Students may only read solution objects that are still attached to a live row.
drop policy if exists solutions_student_select on storage.objects;
create policy solutions_student_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'solutions'
    and case
      when (storage.foldername(name))[1]
        ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (select public.can_read_solution(((storage.foldername(name))[1])::uuid))
      else false
    end
    and exists (
      select 1 from public.assignment_files f
      where f.object_path = name and f.purpose = 'solution'
    )
  );

-- student_items: existing columns unchanged and in order, new ones appended.
create or replace view public.student_items
with (security_invoker = true)
as
select
  f.assignment_id,
  f.student_id,
  p.display_name as student_name,
  a.kind,
  a.title,
  a.instructions,
  a.max_marks,
  a.visible_from,
  f.effective_opens_at,
  f.effective_due_at,
  f.action_state,
  f.is_excused,
  f.has_submission,
  f.is_late,
  f.is_marked,
  sub.submitted_at,
  sub.original_name as submission_name,
  sub.object_path as submission_path,
  sub.revision,
  sub.id as submission_id,
  sub.mark,
  sub.feedback,
  sub.marked_at,
  f.score_pct,
  a.solution_unlocked_for_all,
  p.is_active as student_is_active
from public.student_assignment_facts f
join public.assignments a on a.id = f.assignment_id
join public.profiles p on p.id = f.student_id
left join public.submissions sub
  on sub.assignment_id = f.assignment_id and sub.student_id = f.student_id;

revoke all on public.student_items from public, anon, authenticated;
grant select on public.student_items to authenticated;
