-- Run once AFTER schema.sql. Also works for an existing starter database.
begin;
create table public.guestbook (
  id uuid primary key default gen_random_uuid(),
  nickname text not null check (char_length(trim(nickname)) between 1 and 40),
  website text,
  is_secret boolean not null default false,
  body text,
  reply text,
  encrypted_payload text,
  nonce text,
  password_hash text,
  password_salt text,
  password_iterations integer,
  encryption_version integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guestbook_payload_shape check (
    (is_secret and body is null and reply is null and encrypted_payload is not null
      and nonce is not null and password_hash is not null and password_salt is not null
      and password_iterations is not null and password_iterations >= 600000 and encryption_version is not null and encryption_version=1)
    or (not is_secret and body is not null and encrypted_payload is null
      and nonce is null and password_hash is null and password_salt is null
      and password_iterations is null and encryption_version is null)
  )
);
create index guestbook_created on public.guestbook(created_at desc);
create trigger guestbook_updated before update on public.guestbook for each row execute function public.touch_post();
alter table public.guestbook enable row level security;
revoke all on public.guestbook from anon, authenticated;
grant all on public.guestbook to service_role;
-- No browser policies: only the Edge Function reads/writes this table.

create table public.guestbook_rate_limits (
  limit_key text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 1
);
alter table public.guestbook_rate_limits enable row level security;
revoke all on public.guestbook_rate_limits from anon, authenticated;
grant all on public.guestbook_rate_limits to service_role;
create function public.consume_guestbook_limit(p_key text,p_max integer,p_seconds integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare count_now integer;
begin
  if p_max < 1 or p_seconds < 1 then return false; end if;
  insert into public.guestbook_rate_limits as limits(limit_key,window_start,hits)
  values (p_key,now(),1)
  on conflict (limit_key) do update set
    hits=case when limits.window_start <= now()-make_interval(secs=>p_seconds) then 1 else limits.hits+1 end,
    window_start=case when limits.window_start <= now()-make_interval(secs=>p_seconds) then now() else limits.window_start end
  returning hits into count_now;
  return count_now <= p_max;
end; $$;
revoke all on function public.consume_guestbook_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_guestbook_limit(text,integer,integer) to service_role;

create table public.site_links (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 60),
  url text not null check (url ~ '^https://'),
  banner_url text,
  description text not null default '',
  created_at timestamptz not null default now()
);
alter table public.site_links enable row level security;
revoke all on public.site_links from anon,authenticated;
grant select on public.site_links to anon,authenticated;
grant insert,update,delete on public.site_links to authenticated;
create policy "visitors read friend links" on public.site_links for select to anon,authenticated using (true);
create policy "owner manages links" on public.site_links for all to authenticated
  using ((select public.is_home_admin())) with check ((select public.is_home_admin()));
commit;
