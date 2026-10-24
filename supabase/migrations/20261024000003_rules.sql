-- Read-side rule functions, status views and last-seen (ARCHITECTURE sections 4.2-4.9, 9.2, 9.3).
-- CREATE OR REPLACE keeps owner and ACL of the Task 5 stubs.

create or replace function public.can_see_assignment(p_assignment_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select (select public.is_teacher())
    or exists (
      select 1
      from public.assignment_students s
      join public.assignments a on a.id = s.assignment_id
      where s.assignment_id = p_assignment_id
        and s.student_id = (select auth.uid())
        and (select public.is_active_student())
        and now() >= a.visible_from
    );
$$;

create or replace function public.can_read_question(p_assignment_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select (select public.is_teacher())
    or exists (
      select 1
      from public.assignment_students s
      join public.assignments a on a.id = s.assignment_id
      where s.assignment_id = p_assignment_id
        and s.student_id = (select auth.uid())
        and (select public.is_active_student())
        and now() >= a.visible_from
        and now() >= coalesce(s.opens_at_override, a.opens_at)
    );
$$;

-- Section 4.4: solution file exists AND own deadline passed AND (submitted OR unlocked for all OR excused).
create or replace function public.can_read_solution(p_assignment_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select (select public.is_teacher())
    or exists (
      select 1
      from public.assignment_students s
      join public.assignments a on a.id = s.assignment_id
      where s.assignment_id = p_assignment_id
        and s.student_id = (select auth.uid())
        and (select public.is_active_student())
        and now() >= coalesce(s.due_at_override, a.due_at)
        and exists (
          select 1 from public.assignment_files f
          where f.assignment_id = a.id and f.purpose = 'solution'
        )
        and (
          a.solution_unlocked_for_all
          or s.excused
          or exists (
            select 1 from public.submissions sub
            where sub.assignment_id = a.id and sub.student_id = s.student_id
          )
        )
    );
$$;

create function public.can_upload_now(p_assignment_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assignment_students s
    join public.assignments a on a.id = s.assignment_id
    where s.assignment_id = p_assignment_id
      and s.student_id = (select auth.uid())
      and (select public.is_active_student())
      and not s.excused
      and now() >= coalesce(s.opens_at_override, a.opens_at)
      and (a.kind <> 'test' or now() < coalesce(s.due_at_override, a.due_at))
  );
$$;

create function public.touch_last_seen() returns void
language sql volatile security definer
set search_path = ''
as $$
  update public.profiles
  set last_seen_at = now()
  where id = (select auth.uid())
    and (last_seen_at is null or last_seen_at < now() - interval '5 minutes');
$$;

revoke execute on function public.can_upload_now(uuid), public.touch_last_seen() from public, anon;
grant execute on function public.can_upload_now(uuid), public.touch_last_seen() to authenticated;

-- Facts: one row per assignment_students row (section 9.2). score_pct is the ratio mark / max_marks.
create view public.student_assignment_facts
with (security_invoker = true)
as
select
  s.assignment_id,
  s.student_id,
  a.kind,
  coalesce(s.opens_at_override, a.opens_at) as effective_opens_at,
  coalesce(s.due_at_override, a.due_at) as effective_due_at,
  (now() >= a.visible_from) as is_visible,
  s.excused as is_excused,
  (sub.id is not null) as has_submission,
  (sub.id is not null and sub.submitted_at >= coalesce(s.due_at_override, a.due_at)) as is_late,
  (sub.mark is not null) as is_marked,
  (sub.mark / a.max_marks) as score_pct,
  case
    when s.excused then 'excused'
    when now() < a.visible_from then 'hidden'
    when sub.id is not null then 'done'
    when a.kind = 'test' and now() < coalesce(s.opens_at_override, a.opens_at) then 'upcoming'
    when now() < coalesce(s.due_at_override, a.due_at) then 'pending'
    else 'missed'
  end as action_state
from public.assignment_students s
join public.assignments a on a.id = s.assignment_id
left join public.submissions sub
  on sub.assignment_id = s.assignment_id and sub.student_id = s.student_id;

-- Progress (section 4.9), built from facts only. Averages are 0-100, 2 decimals, null if nothing to average.
create view public.student_progress
with (security_invoker = true)
as
with f as (
  select
    student_id,
    kind,
    has_submission,
    is_late,
    is_marked,
    score_pct,
    (is_visible and not has_submission and now() >= effective_due_at) as is_missed,
    (is_visible and not has_submission and now() < effective_due_at) as is_pending
  from public.student_assignment_facts
  where not is_excused
)
select
  student_id,
  count(*) filter (where has_submission)::int as submitted,
  count(*) filter (where is_late)::int as late,
  count(*) filter (where is_missed)::int as missed,
  count(*) filter (where is_pending)::int as pending,
  round(avg(case when is_marked then score_pct when is_missed then 0 end)
    filter (where kind = 'homework') * 100, 2) as hw_avg_pct,
  round(avg(case when is_marked then score_pct when is_missed then 0 end)
    filter (where kind = 'test') * 100, 2) as test_avg_pct
from f
group by student_id;

revoke all on public.student_assignment_facts, public.student_progress from public, anon, authenticated;
grant select on public.student_assignment_facts, public.student_progress to authenticated;
