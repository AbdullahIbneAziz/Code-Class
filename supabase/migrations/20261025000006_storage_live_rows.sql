-- Students may only read objects that are still attached to a live row.
-- Replaced, deleted or never-attached objects stay in storage until the
-- Phase 5 clean-up, but are no longer readable by students.
-- The EXISTS runs as the requesting user; lecture_files / assignment_files RLS
-- grants students the same visibility as these policies, so no helper is needed.

drop policy if exists lectures_student_select on storage.objects;
create policy lectures_student_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'lectures'
    and (select public.is_active_student())
    and exists (select 1 from public.lecture_files f where f.object_path = name)
  );

drop policy if exists questions_student_select on storage.objects;
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
    and exists (
      select 1 from public.assignment_files f
      where f.object_path = name and f.purpose = 'question'
    )
  );
