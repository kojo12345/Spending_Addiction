-- Run once in Supabase: SQL Editor > New query
create table if not exists app_state (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table app_state enable row level security;
create policy "own row only" on app_state for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
