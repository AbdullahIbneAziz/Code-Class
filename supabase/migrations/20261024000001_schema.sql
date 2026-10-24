-- CodeClass schema (ARCHITECTURE section 9.1). Tables and constraints only.
-- RLS, grants, rule functions and views are added in later migrations.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('teacher', 'student')),
  username text unique,
  display_name text not null,
  is_active boolean not null default true,
  must_change_password boolean not null default true,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table public.lectures (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  created_at timestamptz not null default now()
);

create table public.lecture_files (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures (id) on delete cascade,
  original_name text not null,
  object_path text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now()
);
create index lecture_files_lecture_id_idx on public.lecture_files (lecture_id);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('homework', 'test')),
  title text not null,
  instructions text,
  max_marks numeric not null check (max_marks > 0),
  visible_from timestamptz not null,
  opens_at timestamptz not null,
  due_at timestamptz not null,
  solution_unlocked_for_all boolean not null default false,
  created_at timestamptz not null default now(),
  constraint assignments_time_order check (visible_from <= opens_at and opens_at < due_at)
);

create table public.assignment_files (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  purpose text not null check (purpose in ('question', 'solution')),
  original_name text not null,
  object_path text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now()
);
create index assignment_files_assignment_id_idx on public.assignment_files (assignment_id);

create table public.assignment_students (
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  opens_at_override timestamptz,
  due_at_override timestamptz,
  excused boolean not null default false,
  primary key (assignment_id, student_id),
  constraint assignment_students_override_order check (
    opens_at_override is null or due_at_override is null or opens_at_override < due_at_override
  )
);
create index assignment_students_student_id_idx on public.assignment_students (student_id);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  original_name text not null,
  object_path text not null,
  size_bytes bigint not null,
  submitted_at timestamptz not null,
  revision integer not null default 1,
  mark numeric check (mark >= 0),
  feedback text,
  marked_at timestamptz,
  unique (assignment_id, student_id)
);
create index submissions_student_id_idx on public.submissions (student_id);

create table public.replaced_files (
  object_path text primary key,
  replaced_at timestamptz not null default now()
);

create table public.app_meta (
  key text primary key,
  value text
);

-- mark <= assignments.max_marks (cross-table, so a trigger rather than CHECK)
create function public.submissions_mark_le_max() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_max numeric;
begin
  if new.mark is null then
    return new;
  end if;
  select max_marks into v_max from public.assignments where id = new.assignment_id;
  if new.mark > v_max then
    raise exception 'mark exceeds max_marks' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger submissions_mark_le_max
before insert or update of mark, assignment_id on public.submissions
for each row execute function public.submissions_mark_le_max();
