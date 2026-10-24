-- touch_last_seen: only update active users.
create or replace function public.touch_last_seen() returns void
language sql volatile security definer
set search_path = ''
as $$
  update public.profiles
  set last_seen_at = now()
  where id = (select auth.uid())
    and is_active
    and (last_seen_at is null or last_seen_at < now() - interval '5 minutes');
$$;

revoke execute on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;
