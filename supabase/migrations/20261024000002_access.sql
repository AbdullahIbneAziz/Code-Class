-- Grants, role helper functions and row level security (ARCHITECTURE sections 9.3, 11.1).

-- 1. Table grants: SELECT only, authenticated only. No DML for anon/authenticated.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on
  public.profiles,
  public.lectures,
  public.lecture_files,
  public.assignments,
  public.assignment_files,
  public.assignment_students,
  public.submissions,
  public.replaced_files,
  public.app_meta
to authenticated;

-- 2. Functions: nothing executable by default (covers the mark-check trigger function).
revoke execute on all functions in schema public from public, anon, authenticated;

-- 3. Future objects created by the migration role are not auto-granted.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
alter default privileges for role postgres revoke execute on functions from public;

-- 4. Role helpers.
create function public.is_teacher() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'teacher' and p.is_active
  );
$$;

create function public.is_active_student() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'student' and p.is_active
  );
$$;

-- Stubs; replaced by the real rules (same signatures) in the next migration.
create function public.can_see_assignment(p_assignment_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$ select false; $$;

create function public.can_read_question(p_assignment_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$ select false; $$;

create function public.can_read_solution(p_assignment_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$ select false; $$;

revoke execute on function
  public.is_teacher(),
  public.is_active_student(),
  public.can_see_assignment(uuid),
  public.can_read_question(uuid),
  public.can_read_solution(uuid)
from public, anon;

grant execute on function
  public.is_teacher(),
  public.is_active_student(),
  public.can_see_assignment(uuid),
  public.can_read_question(uuid),
  public.can_read_solution(uuid)
to authenticated;

-- 5. RLS: enabled everywhere, SELECT policies only.
alter table public.profiles enable row level security;
alter table public.lectures enable row level security;
alter table public.lecture_files enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_files enable row level security;
alter table public.assignment_students enable row level security;
alter table public.submissions enable row level security;
alter table public.replaced_files enable row level security;
alter table public.app_meta enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using ((id = (select auth.uid()) and (select public.is_active_student())) or (select public.is_teacher()));

create policy lectures_select on public.lectures for select to authenticated
  using ((select public.is_active_student()) or (select public.is_teacher()));

create policy lecture_files_select on public.lecture_files for select to authenticated
  using ((select public.is_active_student()) or (select public.is_teacher()));

create policy assignments_select on public.assignments for select to authenticated
  using (public.can_see_assignment(id) or (select public.is_teacher()));

create policy assignment_files_select on public.assignment_files for select to authenticated
  using (
    (purpose = 'question' and public.can_read_question(assignment_id))
    or (purpose = 'solution' and public.can_read_solution(assignment_id))
    or (select public.is_teacher())
  );

create policy assignment_students_select on public.assignment_students for select to authenticated
  using ((student_id = (select auth.uid()) and (select public.is_active_student())) or (select public.is_teacher()));

create policy submissions_select on public.submissions for select to authenticated
  using ((student_id = (select auth.uid()) and (select public.is_active_student())) or (select public.is_teacher()));

create policy replaced_files_select on public.replaced_files for select to authenticated
  using ((select public.is_teacher()));

create policy app_meta_select on public.app_meta for select to authenticated
  using ((select public.is_teacher()));
