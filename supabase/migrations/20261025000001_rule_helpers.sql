-- Phase 2 carry-overs: single source for assignment visibility (ARCHITECTURE 8.1).

create or replace function public.can_read_question(p_assignment_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.can_see_assignment(p_assignment_id)
    and (
      (select public.is_teacher())
      or exists (
        select 1
        from public.assignment_students s
        join public.assignments a on a.id = s.assignment_id
        where s.assignment_id = p_assignment_id
          and s.student_id = (select auth.uid())
          and now() >= coalesce(s.opens_at_override, a.opens_at)
      )
    );
$$;

drop policy assignment_students_select on public.assignment_students;
create policy assignment_students_select on public.assignment_students for select to authenticated
  using (
    (student_id = (select auth.uid()) and (select public.is_active_student()) and public.can_see_assignment(assignment_id))
    or (select public.is_teacher())
  );
