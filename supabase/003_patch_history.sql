-- Existing homepage: run once in Supabase SQL Editor before deploying the UI.
-- Re-running is safe. Existing posts, grants and RLS policies are preserved.
begin;
alter table public.posts drop constraint if exists posts_kind_check;
alter table public.posts add constraint posts_kind_check
  check (kind in ('diary', 'novel', 'art', 'update'));
commit;
