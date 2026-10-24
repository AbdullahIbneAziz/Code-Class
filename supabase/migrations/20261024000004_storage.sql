-- Private storage buckets and access policies (ARCHITECTURE sections 10.1, 10.5, 11.2).
-- Insert-only for everyone: no UPDATE or DELETE policies exist, so nothing can be overwritten
-- (upsert) or deleted by a user session. Clean-up uses the admin client (section 10.4).
-- Path checks are guarded so a malformed path is denied rather than raising a cast error.
-- Allowed types are enforced here by extension (allowed_mime_types stays null).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('lectures',    'lectures',    false, 26214400, null),
  ('questions',   'questions',   false, 26214400, null),
  ('solutions',   'solutions',   false, 26214400, null),
  ('submissions', 'submissions', false,  5242880, null)
on conflict (id) do update
  set name = excluded.name,
      public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- submissions: {assignment_id}/{student_id}/{uuid}.{ext}
create policy submissions_student_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'submissions'
    and array_length(storage.foldername(name), 1) = 2
    and lower(storage.extension(name)) in ('ipynb', 'py')
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and case
      when (storage.foldername(name))[1]
        ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (select public.can_upload_now(((storage.foldername(name))[1])::uuid))
      else false
    end
  );

create policy submissions_student_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'submissions'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

create policy submissions_teacher_select on storage.objects
  for select to authenticated
  using (bucket_id = 'submissions' and (select public.is_teacher()));

-- lectures: {lecture_id}/{uuid}.{ext}
create policy lectures_teacher_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'lectures'
    and (select public.is_teacher())
    and array_length(storage.foldername(name), 1) = 1
    and lower(storage.extension(name)) in ('ipynb', 'py', 'pdf', 'pptx', 'png', 'jpg')
  );

create policy lectures_teacher_select on storage.objects
  for select to authenticated
  using (bucket_id = 'lectures' and (select public.is_teacher()));

create policy lectures_student_select on storage.objects
  for select to authenticated
  using (bucket_id = 'lectures' and (select public.is_active_student()));

-- questions: {assignment_id}/{uuid}.{ext}
create policy questions_teacher_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'questions'
    and (select public.is_teacher())
    and array_length(storage.foldername(name), 1) = 1
    and lower(storage.extension(name)) in ('ipynb', 'py', 'pdf', 'txt', 'zip')
  );

create policy questions_teacher_select on storage.objects
  for select to authenticated
  using (bucket_id = 'questions' and (select public.is_teacher()));

create policy questions_student_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'questions'
    and case
      when (storage.foldername(name))[1]
        ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (select public.can_read_question(((storage.foldername(name))[1])::uuid))
      else false
    end
  );

-- solutions: {assignment_id}/{uuid}.{ext}
create policy solutions_teacher_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'solutions'
    and (select public.is_teacher())
    and array_length(storage.foldername(name), 1) = 1
    and lower(storage.extension(name)) in ('ipynb', 'py', 'pdf', 'txt', 'zip')
  );

create policy solutions_teacher_select on storage.objects
  for select to authenticated
  using (bucket_id = 'solutions' and (select public.is_teacher()));

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
  );
