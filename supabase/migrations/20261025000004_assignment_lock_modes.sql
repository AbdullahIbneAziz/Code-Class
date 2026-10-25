-- Phase 2 Task 5 fix: update_assignment and set_assignment_students lock the assignment FOR NO KEY UPDATE,
-- so finalize_submission's FK check (FOR KEY SHARE on the assignment) can't deadlock with them.
-- delete_assignment keeps FOR UPDATE (it removes the row). Lock order is unchanged:
-- assignment, then assignment_students by student_id, then clock_timestamp().

create or replace function public.update_assignment(
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
  select * into a from public.assignments where id = p_assignment_id for no key update;
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

create or replace function public.set_assignment_students(p_assignment_id uuid, p_student_ids uuid[]) returns void
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
  perform 1 from public.assignments where id = p_assignment_id for no key update;
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
