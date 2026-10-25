-- Teacher decision 26 Oct 2026 (ARCHITECTURE 4.5): once a student's own deadline has passed, any existing
-- upload (on time or late) can't be replaced. Only the replacement rule changes; everything else is as in 20261025000005.
-- Lock order everywhere: assignment, then assignment_students, then clock_timestamp().
-- finalize takes the assignment FOR KEY SHARE (compatible with update_assignment's NO KEY UPDATE,
-- conflicts only with delete_assignment's FOR UPDATE), then its own assignment_students row FOR UPDATE.
-- Stored original_name always ends with the object path's extension (case-insensitive compare);
-- if the cleaned name has a different extension, the path extension is APPENDED
-- (homework.exe + .py object -> homework.exe.py), then the name is cleaned again to stay within 120 chars.
create or replace function public.finalize_submission(p_assignment_id uuid, p_object_path text, p_original_name text)
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  s public.assignment_students%rowtype;
  a public.assignments%rowtype;
  cur public.submissions%rowtype;
  t timestamptz;
  v_opens timestamptz;
  v_due timestamptz;
  v_ext text;
  v_size bigint;
  v_name text;
  v_id uuid;
  v_assigned boolean;
begin
  if v_uid is null or not (select public.is_active_student()) then
    raise exception 'Your account is not active.' using errcode = 'P0001';
  end if;

  -- Locks first: the assignment (key share), then this student's assignment_students row.
  perform 1 from public.assignments where id = p_assignment_id for key share;
  if not found then
    raise exception 'That item no longer exists.' using errcode = 'P0001';
  end if;
  select * into s from public.assignment_students
    where assignment_id = p_assignment_id and student_id = v_uid for update;
  v_assigned := found;
  -- Then the clock, once. Everything below uses t.
  t := clock_timestamp();

  if not (select public.is_active_student()) then
    raise exception 'Your account is not active.' using errcode = 'P0001';
  end if;
  if not v_assigned or s.excused then
    raise exception 'This isn''t assigned to you.' using errcode = 'P0001';
  end if;

  -- Read after the lock so a concurrent update_assignment that committed is visible.
  select * into a from public.assignments where id = p_assignment_id;

  if p_object_path is null
     or p_object_path !~ ('^' || p_assignment_id::text || '/' || v_uid::text
                          || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(ipynb|py)$') then
    raise exception 'That upload wasn''t found. Please try again.' using errcode = 'P0001';
  end if;
  select (o.metadata->>'size')::bigint into v_size
    from storage.objects o
    where o.bucket_id = 'submissions' and o.name = p_object_path and o.owner_id = v_uid::text;
  if not found or v_size is null
     or exists (select 1 from public.replaced_files where bucket = 'submissions' and object_path = p_object_path) then
    raise exception 'That upload wasn''t found. Please try again.' using errcode = 'P0001';
  end if;

  select * into cur from public.submissions where assignment_id = p_assignment_id and student_id = v_uid;
  if found and cur.object_path = p_object_path then
    return cur.id;
  end if;

  v_opens := coalesce(s.opens_at_override, a.opens_at);
  v_due := coalesce(s.due_at_override, a.due_at);
  if t < v_opens then
    raise exception 'This isn''t open yet.' using errcode = 'P0001';
  end if;
  if a.kind = 'test' and t >= v_due then
    raise exception 'The test has closed. Uploads that finish after the end time are not accepted.' using errcode = 'P0001';
  end if;
  if cur.id is not null then
    if cur.mark is not null or cur.marked_at is not null then
      raise exception 'This has already been marked, so it can''t be replaced.' using errcode = 'P0001';
    end if;
    if t >= v_due then
      if cur.submitted_at < v_due then
        raise exception 'Your on-time submission can''t be replaced after the deadline.' using errcode = 'P0001';
      end if;
      raise exception 'This was uploaded after the deadline, so it can''t be replaced.' using errcode = 'P0001';
    end if;
  end if;

  -- Stored name: cleaned, and forced to end with the path extension.
  v_ext := substring(p_object_path from '\.([a-z]+)$');
  v_name := public.clean_file_name(p_original_name);
  if lower(coalesce(substring(v_name from '\.([^.]*)$'), '')) <> v_ext then
    v_name := public.clean_file_name(v_name || '.' || v_ext);
  end if;

  if cur.id is null then
    insert into public.submissions (assignment_id, student_id, original_name, object_path, size_bytes, submitted_at, revision)
      values (p_assignment_id, v_uid, v_name, p_object_path, v_size, t, 1)
      returning id into v_id;
  else
    update public.submissions
      set object_path = p_object_path, original_name = v_name, size_bytes = v_size, submitted_at = t,
          revision = cur.revision + 1, mark = null, feedback = null, marked_at = null
      where id = cur.id;
    v_id := cur.id;
    insert into public.replaced_files (bucket, object_path, replaced_at)
      values ('submissions', cur.object_path, t) on conflict do nothing;
  end if;
  return v_id;
end;
$$;

revoke execute on function public.finalize_submission(uuid, text, text) from public, anon;
grant execute on function public.finalize_submission(uuid, text, text) to authenticated;
