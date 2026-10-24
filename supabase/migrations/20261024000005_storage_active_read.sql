-- Section 11.2: a student reads own submissions only while active (deactivated = anonymous).
drop policy submissions_student_select on storage.objects;

create policy submissions_student_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'submissions'
    and (select public.is_active_student())
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
