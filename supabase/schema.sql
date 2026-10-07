-- Fresh Supabase project: run this once in SQL Editor as project owner.
begin;
create table public.home_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.home_admins enable row level security;
revoke all on public.home_admins from anon, authenticated;
grant select on public.home_admins to authenticated;
create policy "admin can see own membership" on public.home_admins for select to authenticated
  using (user_id = (select auth.uid()));

create function public.is_home_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.home_admins where user_id = (select auth.uid()));
$$;
revoke all on function public.is_home_admin() from public;
grant execute on function public.is_home_admin() to anon, authenticated;

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  kind text not null check (kind in ('diary','novel','art')),
  title text not null check (char_length(trim(title)) between 1 and 200),
  body text not null check (char_length(trim(body)) > 0),
  tags text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','public','private')),
  series_title text,
  chapter_no integer,
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint novel_fields check (kind <> 'novel' or (series_title is not null and char_length(trim(series_title)) between 1 and 200 and chapter_no is not null and chapter_no > 0)),
  constraint art_image check (kind <> 'art' or (image_path is not null and char_length(image_path)>0)),
  constraint image_owner_path check (image_path is null or split_part(image_path,'/',1) = owner_id::text)
);
create index posts_kind_created on public.posts(kind, created_at desc) where status = 'public';
create index posts_image_path on public.posts(image_path);
create unique index novel_unique_chapter on public.posts(series_title, chapter_no) where kind='novel';
create function public.touch_post() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
create trigger posts_updated before update on public.posts for each row execute function public.touch_post();

alter table public.posts enable row level security;
revoke all on public.posts from anon, authenticated;
grant select on public.posts to anon, authenticated;
grant insert, update, delete on public.posts to authenticated;
create policy "public reads published posts" on public.posts for select to anon, authenticated using (status = 'public');
create policy "owner reads all posts" on public.posts for select to authenticated using ((select public.is_home_admin()));
create policy "owner inserts" on public.posts for insert to authenticated with check ((select public.is_home_admin()) and owner_id = (select auth.uid()));
create policy "owner updates" on public.posts for update to authenticated using ((select public.is_home_admin()) and owner_id = (select auth.uid())) with check ((select public.is_home_admin()) and owner_id = (select auth.uid()));
create policy "owner deletes" on public.posts for delete to authenticated using ((select public.is_home_admin()) and owner_id = (select auth.uid()));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('artwork','artwork',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy "public reads images of published posts" on storage.objects for select to anon, authenticated
using (bucket_id='artwork' and exists (select 1 from public.posts p where p.image_path = storage.objects.name and p.status='public'));
create policy "owner reads own images" on storage.objects for select to authenticated
using (bucket_id='artwork' and (select public.is_home_admin()) and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owner uploads own images" on storage.objects for insert to authenticated
with check (bucket_id='artwork' and (select public.is_home_admin()) and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owner deletes own images" on storage.objects for delete to authenticated
using (bucket_id='artwork' and (select public.is_home_admin()) and (storage.foldername(name))[1] = (select auth.uid())::text);
commit;

-- After creating your confirmed Auth user in the dashboard, run separately:
-- insert into public.home_admins(user_id) values ('YOUR_AUTH_USER_UUID');
-- Never make this table writable by browser users.
