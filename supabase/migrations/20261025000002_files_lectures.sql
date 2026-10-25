-- Phase 2 Task 3: file-row and lecture functions (ARCHITECTURE 9.3, 10.2, 10.4).

-- replaced_files is keyed by (bucket, object_path). It is empty (nothing wrote to it in Phase 1).
do $$
begin
  if exists (select 1 from public.replaced_files) then
    raise exception 'replaced_files is not empty; cannot add bucket column';
  end if;
end $$;

alter table public.replaced_files
  add column bucket text not null
  check (bucket in ('lectures', 'questions', 'solutions', 'submissions'));
alter table public.replaced_files drop constraint replaced_files_pkey;
alter table public.replaced_files add primary key (bucket, object_path);

create unique index lecture_files_object_path_key on public.lecture_files (object_path);
create unique index assignment_files_object_path_key on public.assignment_files (object_path);
create unique index submissions_object_path_key on public.submissions (object_path);

-- Pure helper; granted to nobody (called from SECURITY DEFINER functions owned by postgres).
create function public.clean_file_name(p_name text) returns text
language plpgsql immutable
set search_path = ''
as $$
declare
  x text;
  ext text;
begin
  x := regexp_replace(coalesce(p_name, ''), '[\x01-\x1f\x7f/\\:*?"<>|]', '', 'g');
  x := regexp_replace(x, '^[\s.]+', '');
  x := regexp_replace(x, '\s+$', '');
  if x = '' then
    return 'file';
  end if;
  if length(x) > 120 then
    ext := substring(x from '\.[^.]*$');
    if ext is null or length(ext) >= 120 then
      x := left(x, 120);
    else
      x := left(left(x, length(x) - length(ext)), 120 - length(ext)) || ext;
    end if;
  end if;
  return x;
end;
$$;
revoke execute on function public.clean_file_name(text) from public, anon, authenticated;

create function public.create_lecture(p_title text, p_description text) returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_desc text := nullif(btrim(coalesce(p_description, '')), '');
  v_id uuid;
begin
  if not (select public.is_teacher()) then
    raise exception 'Teacher access required.' using errcode = '42501';
  end if;
  if v_title = '' then
    raise exception 'Please enter a title.' using errcode = 'P0001';
  end if;
  if length(v_title) > 200 then
    raise exception 'The title is too long (200 characters at most).' using errcode = 'P0001';
  end if;
  insert into public.lectures (title, description) values (v_title, v_desc) returning id into v_id;
  return v_id;
end;
$$;

create function public.update_lecture(p_lecture_id uuid, p_title text, p_description text) returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_desc text := nullif(btrim(coalesce(p_description, '')), '');
begin
  if not (select public.is_teacher()) then
    raise exception 'Teacher access required.' using errcode = '42501';
  end if;
  if v_title = '' then
    raise exception 'Please enter a title.' using errcode = 'P0001';
  end if;
  if length(v_title) > 200 then
    raise exception 'The title is too long (200 characters at most).' using errcode = 'P0001';
  end if;
  update public.lectures set title = v_title, description = v_desc where id = p_lecture_id;
  if not found then
    raise exception 'That item no longer exists.' using errcode = 'P0001';
  end if;
end;
$$;

create function public.delete_lecture(p_lecture_id uuid) returns void
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  if not (select public.is_teacher()) then
    raise exception 'Teacher access required.' using errcode = '42501';
  end if;
  perform 1 from public.lectures where id = p_lecture_id for update;
  if not found then
    raise exception 'That item no longer exists.' using errcode = 'P0001';
  end if;
  insert into public.replaced_files (bucket, object_path)
    select 'lectures', object_path from public.lecture_files where lecture_id = p_lecture_id
    on conflict do nothing;
  delete from public.lectures where id = p_lecture_id;
end;
$$;

-- Internal: validates a storage object for a parent folder and returns its size.
-- Raises 'upload' / 'attached'. Granted to nobody (called from the functions below).
create function public.check_file_object(p_bucket text, p_parent_id uuid, p_object_path text)
returns bigint
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_size bigint;
begin
  if p_object_path is null
     or p_object_path !~ ('^' || p_parent_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,10}$') then
    raise exception 'That upload wasn''t found. Please try again.' using errcode = 'P0001';
  end if;
  select (o.metadata->>'size')::bigint into v_size
  from storage.objects o
  where o.bucket_id = p_bucket and o.name = p_object_path;
  if not found or v_size is null then
    raise exception 'That upload wasn''t found. Please try again.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.lecture_files where object_path = p_object_path)
     or exists (select 1 from public.assignment_files where object_path = p_object_path)
     or exists (select 1 from public.submissions where object_path = p_object_path)
     or exists (select 1 from public.replaced_files where bucket = p_bucket and object_path = p_object_path) then
    raise exception 'That file is already attached.' using errcode = 'P0001';
  end if;
  return v_size;
end;
$$;
revoke execute on function public.check_file_object(text, uuid, text) from public, anon, authenticated;

create function public.attach_file(p_target text, p_parent_id uuid, p_object_path text, p_original_name text) returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_bucket text;
  v_size bigint;
  v_id uuid;
  v_name text;
begin
  if not (select public.is_teacher()) then
    raise exception 'Teacher access required.' using errcode = '42501';
  end if;
  v_bucket := case p_target when 'lecture' then 'lectures' when 'question' then 'questions' when 'solution' then 'solutions' end;
  if v_bucket is null then
    raise exception 'That item no longer exists.' using errcode = 'P0001';
  end if;
  if p_target = 'lecture' then
    perform 1 from public.lectures where id = p_parent_id for update;
  else
    perform 1 from public.assignments where id = p_parent_id for update;
  end if;
  if not found then
    raise exception 'That item no longer exists.' using errcode = 'P0001';
  end if;
  v_size := public.check_file_object(v_bucket, p_parent_id, p_object_path);
  v_name := public.clean_file_name(p_original_name);
  if p_target = 'lecture' then
    insert into public.lecture_files (lecture_id, original_name, object_path, size_bytes)
      values (p_parent_id, v_name, p_object_path, v_size) returning id into v_id;
  else
    insert into public.assignment_files (assignment_id, purpose, original_name, object_path, size_bytes)
      values (p_parent_id, p_target, v_name, p_object_path, v_size) returning id into v_id;
  end if;
  return v_id;
end;
$$;

create function public.replace_file(p_target text, p_file_id uuid, p_object_path text, p_original_name text) returns void
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
  if p_target = 'lecture' then
    select lecture_id, object_path into v_parent, v_old
    from public.lecture_files where id = p_file_id for update;
  else
    select assignment_id, object_path into v_parent, v_old
    from public.assignment_files where id = p_file_id and purpose = p_target for update;
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
  public.create_lecture(text, text),
  public.update_lecture(uuid, text, text),
  public.delete_lecture(uuid),
  public.attach_file(text, uuid, text, text),
  public.replace_file(text, uuid, text, text)
from public, anon;
grant execute on function
  public.create_lecture(text, text),
  public.update_lecture(uuid, text, text),
  public.delete_lecture(uuid),
  public.attach_file(text, uuid, text, text),
  public.replace_file(text, uuid, text, text)
to authenticated;
