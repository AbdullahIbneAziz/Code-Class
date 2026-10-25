-- Phase 2 Task 5: homework write functions and the student_items view
-- (ARCHITECTURE 4.7, 4.8, 9.2, 9.3, 9.4).
-- Time-sensitive writes take row locks FIRST (assignment, then its assignment_students by student_id),
-- THEN read clock_timestamp() once and use it for every check.

-- Pure comparison helper: client round trips (JS Date) cut microseconds, so "unchanged" means equal to the ms.
create function public.same_instant(a timestamptz, b timestamptz) returns boolean
language sql immutable
set search_path = ''
as $$
  select date_trunc('milliseconds', a) = date_trunc('milliseconds', b);
$$;
revoke execute on function public.same_instant(timestamptz, timestamptz) from public, anon, authenticated;

-- Validates a title; returns the trimmed value.
create function public.check_title(p_title text) returns text
language plpgsql immutable
set search_path = ''
as $$
declare
  v text := btrim(coalesce(p_title, ''));
begin
  if v = '' then
    raise exception 'Please enter a title.' using errcode = 'P0001';
  end if;
  if length(v) > 200 then
    raise exception 'The title is too long (200 characters at most).' using errcode = 'P0001';
  end if;
  return v;
end;
$$;
revoke execute on function public.check_title(text) from public, anon, authenticated;

-- Raises 'inactive' unless every id is an active student. Takes a share lock so a student can't be
-- deactivated mid-call.
create function public.check_active_students(p_ids uuid[]) returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_ok int;
begin
  select count(*) into v_ok from (
    select p.id from public.profiles p
    where p.id = any(p_ids) and p.role = 'student' and p.is_active
    order by p.id
    for share
  ) x;
  if v_ok <> (select count(distinct i) from unnest(p_ids) i) then
    raise exception 'Only active students can be given work.' using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function public.check_active_students(uuid[]) from public, anon, authenticated;

create function public.create_assignment(
  p_kind text, p_title text, p_instructions text, p_max_marks numeric,
  p_visible_from timestamptz, p_opens_at timestamptz, p_due_at timestamptz, p_student_ids uuid[]
) returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_title text;
  v_instr text := nullif(btrim(coalesce(p_instructions, '')), '');
  v_visible timestamptz;
  v_opens timestamptz;
  v_id uuid;
begin
  if not (select public.is_teacher()) then
    raise exception 'Teacher access required.' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('homework', 'test') then
    raise exception 'Invalid kind.' using errcode = '22023';
  end if;
  v_title := public.check_title(p_title);
  if p_max_marks is null or p_max_marks <= 0 then
    raise exception 'The maximum mark must be more than 0.' using errcode = 'P0001';
  end if;
  v_visible := coalesce(p_visible_from, clock_timestamp());
  v_opens := case p_kind when 'homework' then v_visible else p_opens_at end;
  if v_opens is null or p_due_at is null or p_due_at <= v_opens or v_visible > v_opens then
    raise exception 'The deadline must be after the ''show from'' time.' using errcode = 'P0001';
  end if;
  if p_due_at <= clock_timestamp() then
    raise exception 'The deadline must be in the future.' using errcode = 'P0001';
  end if;
  if p_student_ids is null or cardinality(p_student_ids) = 0 then
    raise exception 'Choose at least one student.' using errcode = 'P0001';
  end if;
  perform public.check_active_students(p_student_ids);
  insert into public.assignments (kind, title, instructions, max_marks, visible_from, opens_at, due_at)
    values (p_kind, v_title, v_instr, p_max_marks, v_visible, v_opens, p_due_at)
    returning id into v_id;
  insert into public.assignment_students (assignment_id, student_id)
    select v_id, i from (select distinct unnest(p_student_ids) as i) d;
  return v_id;
end;
$$;

create function public.update_assignment(
  p_assignment_id uuid, p_title text, p_instructions text, p_max_marks numeric,
  p_visible_from timestamptz, p_opens_at timestamptz, p_due_at timestamptz
) returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  a public.assignments%rowtype;
  t timestamptz;
  v_submitted boolean;
  v_marked boolean;
  v_title text;
  v_instr text := nullif(btrim(coalesce(p_instructions, '')), '');
  n_visible timestamptz;
  n_opens timestamptz;
  n_due timestamptz;
  n_max numeric;
  v_vis_changed boolean;
  v_opens_changed boolean;
  v_due_changed boolean;
begin
  if not (select public.is_teacher()) then
    raise exception 'Teacher access required.' using errcode = '42501';
  end if;
  -- Locks first: the assignment, then every assignment_students row in student_id order.
  select * into a from public.assignments where id = p_assignment_id for update;
  if not found then
    raise exception 'That item no longer exists.' using errcode = 'P0001';
  end if;
  perform 1 from public.assignment_students where assignment_id = p_assignment_id order by student_id for update;
  -- Then the clock, once.
  t := clock_timestamp();

  v_title := public.check_title(p_title);
  if p_max_marks is null or p_max_marks <= 0 then
    raise exception 'The maximum mark must be more than 0.' using errcode = 'P0001';
  end if;
  v_submitted := exists (select 1 from public.submissions where assignment_id = p_assignment_id);
  v_marked := exists (select 1 from public.submissions where assignment_id = p_assignment_id and mark is not null);

  -- max_marks: locked once any mark exists (carried requirement b).
  n_max := p_max_marks;
  if n_max <> a.max_marks and v_marked then
    raise exception 'The maximum mark is locked because marking has started.' using errcode = 'P0001';
  end if;

  -- A null time means "unchanged".
  n_visible := coalesce(p_visible_from, a.visible_from);
  n_opens := coalesce(p_opens_at, a.opens_at);
  n_due := coalesce(p_due_at, a.due_at);
  v_vis_changed := not public.same_instant(n_visible, a.visible_from);
  v_opens_changed := a.kind = 'test' and not public.same_instant(n_opens, a.opens_at);
  v_due_changed := not public.same_instant(n_due, a.due_at);
  if not v_vis_changed then n_visible := a.visible_from; end if;
  if not v_due_changed then n_due := a.due_at; end if;

  if a.kind = 'homework' then
    if v_vis_changed and t >= a.visible_from then
      raise exception 'The ''show from'' time is locked because students can already see this.' using errcode = 'P0001';
    end if;
    n_opens := n_visible;
    if v_due_changed and n_due < a.due_at then
      if v_submitted then
        raise exception 'You can''t move the deadline earlier after someone has submitted. Use a per-student exception instead.' using errcode = 'P0001';
      end if;
      if n_due <= t then
        raise exception 'The new deadline can''t be in the past.' using errcode = 'P0001';
      end if;
    end if;
  else
    if not v_opens_changed then n_opens := a.opens_at; end if;
    if t >= a.due_at then
      if v_vis_changed or v_opens_changed or v_due_changed then
        raise exception 'This test has finished, so its times are locked.' using errcode = 'P0001';
      end if;
    elsif t >= a.opens_at then
      if v_vis_changed or v_opens_changed or (v_due_changed and n_due <= a.due_at) then
        raise exception 'Only the end time can be extended while the test is running.' using errcode = 'P0001';
      end if;
    else
      if v_vis_changed and t >= a.visible_from then
        raise exception 'The ''show from'' time is locked because students can already see this.' using errcode = 'P0001';
      end if;
    end if;
  end if;

  if not (n_visible <= n_opens and n_opens < n_due) then
    raise exception 'The deadline must be after the ''show from'' time.' using errcode = 'P0001';
  end if;

  update public.assignments
    set title = v_title, instructions = v_instr, max_marks = n_max,
        visible_from = n_visible, opens_at = n_opens, due_at = n_due
    where id = p_assignment_id;
end;
$$;

create function public.delete_assignment(p_assignment_id uuid) returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  t timestamptz;
begin
  if not (select public.is_teacher()) then
    raise exception 'Teacher access required.' using errcode = '42501';
  end if;
  -- Parent first, so a concurrent replace_file/attach_file can't orphan an object.
  perform 1 from public.assignments where id = p_assignment_id for update;
  if not found then
    raise exception 'That item no longer exists.' using errcode = 'P0001';
  end if;
  perform 1 from public.assignment_students where assignment_id = p_assignment_id order by student_id for update;
  t := clock_timestamp();
  if exists (select 1 from public.submissions where assignment_id = p_assignment_id) then
    raise exception 'This homework can''t be deleted because someone has submitted.' using errcode = 'P0001';
  end if;
  insert into public.replaced_files (bucket, object_path, replaced_at)
    select case purpose when 'solution' then 'solutions' else 'questions' end, object_path, t
    from public.assignment_files where assignment_id = p_assignment_id
    on conflict do nothing;
  delete from public.assignments where id = p_assignment_id;
end;
$$;

create function public.set_assignment_students(p_assignment_id uuid, p_student_ids uuid[]) returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  t timestamptz;
  v_new uuid[];
  v_name text;
begin
  if not (select public.is_teacher()) then
    raise exception 'Teacher access required.' using errcode = '42501';
  end if;
  perform 1 from public.assignments where id = p_assignment_id for update;
  if not found then
    raise exception 'That item no longer exists.' using errcode = 'P0001';
  end if;
  perform 1 from public.assignment_students where assignment_id = p_assignment_id order by student_id for update;
  t := clock_timestamp();
  if p_student_ids is null or cardinality(p_student_ids) = 0 then
    raise exception 'Choose at least one student.' using errcode = 'P0001';
  end if;
  select array_agg(i) into v_new
    from (select distinct unnest(p_student_ids) as i) d
    where not exists (select 1 from public.assignment_students s where s.assignment_id = p_assignment_id and s.student_id = d.i);
  if v_new is not null then
    perform public.check_active_students(v_new);
  end if;
  select p.display_name into v_name
    from public.assignment_students s
    join public.profiles p on p.id = s.student_id
    where s.assignment_id = p_assignment_id
      and s.student_id <> all (p_student_ids)
      and exists (select 1 from public.submissions sub where sub.assignment_id = s.assignment_id and sub.student_id = s.student_id)
    order by p.display_name
    limit 1;
  if v_name is not null then
    raise exception '% has submitted, so they can''t be removed. Excuse them instead.', v_name using errcode = 'P0001';
  end if;
  delete from public.assignment_students
    where assignment_id = p_assignment_id and student_id <> all (p_student_ids);
  if v_new is not null then
    insert into public.assignment_students (assignment_id, student_id)
      select p_assignment_id, i from unnest(v_new) i;
  end if;
end;
$$;

-- Carried from the Task 3 review: replace_file locks the PARENT (lecture or assignment) before the file row.
create or replace function public.replace_file(p_target text, p_file_id uuid, p_object_path text, p_original_name text) returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_bucket text;
  v_parent uuid;
  v_old text;
  v_size bigint;
  v_name text;
begin
  if not (select public.is_teacher()) then
    raise exception 'Teacher access required.' using errcode = '42501';
  end if;
  v_bucket := case p_target when 'lecture' then 'lectures' when 'question' then 'questions' when 'solution' then 'solutions' end;
  if v_bucket is null then
    raise exception 'That item no longer exists.' using errcode = 'P0001';
  end if;
  -- 1. find the parent without locking, 2. lock the parent, 3. lock and re-read the file row.
  if p_target = 'lecture' then
    select lecture_id into v_parent from public.lecture_files where id = p_file_id;
  else
    select assignment_id into v_parent from public.assignment_files where id = p_file_id and purpose = p_target;
  end if;
  if not found then
    raise exception 'That item no longer exists.' using errcode = 'P0001';
  end if;
  if p_target = 'lecture' then
    perform 1 from public.lectures where id = v_parent for update;
  else
    perform 1 from public.assignments where id = v_parent for update;
  end if;
  if not found then
    raise exception 'That item no longer exists.' using errcode = 'P0001';
  end if;
  if p_target = 'lecture' then
    select object_path into v_old from public.lecture_files where id = p_file_id and lecture_id = v_parent for update;
  else
    select object_path into v_old from public.assignment_files
      where id = p_file_id and purpose = p_target and assignment_id = v_parent for update;
  end if;
  if not found then
    raise exception 'That item no longer exists.' using errcode = 'P0001';
  end if;
  v_size := public.check_file_object(v_bucket, v_parent, p_object_path);
  v_name := public.clean_file_name(p_original_name);
  if p_target = 'lecture' then
    update public.lecture_files
      set object_path = p_object_path, original_name = v_name, size_bytes = v_size, created_at = now()
      where id = p_file_id;
  else
    update public.assignment_files
      set object_path = p_object_path, original_name = v_name, size_bytes = v_size, created_at = now()
      where id = p_file_id;
  end if;
  insert into public.replaced_files (bucket, object_path) values (v_bucket, v_old) on conflict do nothing;
end;
$$;

revoke execute on function
  public.create_assignment(text, text, text, numeric, timestamptz, timestamptz, timestamptz, uuid[]),
  public.update_assignment(uuid, text, text, numeric, timestamptz, timestamptz, timestamptz),
  public.delete_assignment(uuid),
  public.set_assignment_students(uuid, uuid[])
from public, anon;
grant execute on function
  public.create_assignment(text, text, text, numeric, timestamptz, timestamptz, timestamptz, uuid[]),
  public.update_assignment(uuid, text, text, numeric, timestamptz, timestamptz, timestamptz),
  public.delete_assignment(uuid),
  public.set_assignment_students(uuid, uuid[])
to authenticated;

-- One row per (student, item) with the facts plus display columns (9.2). RLS of the base tables applies.
create view public.student_items
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
  sub.revision
from public.student_assignment_facts f
join public.assignments a on a.id = f.assignment_id
join public.profiles p on p.id = f.student_id
left join public.submissions sub
  on sub.assignment_id = f.assignment_id and sub.student_id = f.student_id;

revoke all on public.student_items from public, anon, authenticated;
grant select on public.student_items to authenticated;
