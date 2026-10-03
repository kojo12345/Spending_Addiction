-- Run once in Supabase: SQL Editor > New query
create table if not exists app_state (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table app_state enable row level security;

drop policy if exists "own row only" on app_state;
drop policy if exists "app_state_select_own" on app_state;
drop policy if exists "app_state_insert_own" on app_state;
drop policy if exists "app_state_update_own" on app_state;

revoke all on public.app_state from public, anon;
grant select, insert, update on public.app_state to authenticated;

create policy "app_state_select_own" on public.app_state
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "app_state_insert_own" on public.app_state
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "app_state_update_own" on public.app_state
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
