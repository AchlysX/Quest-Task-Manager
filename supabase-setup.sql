-- Quest Log database schema.
-- Run this ONCE in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to re-run (it is idempotent).

create table if not exists public.tasks (
  id            uuid primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title         text not null,
  size          text not null default 'M' check (size in ('S', 'M', 'L')),
  due           date,
  boss_date     date,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz,
  xp            integer not null default 0,
  boss_win      boolean not null default false,
  deleted       boolean not null default false,
  updated_at    timestamptz not null default now()
);

create table if not exists public.sessions (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  minutes     integer not null,
  task_id     uuid,
  xp          integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists tasks_user_updated_idx    on public.tasks    (user_id, updated_at);
create index if not exists sessions_user_updated_idx on public.sessions (user_id, updated_at);

-- The server stamps updated_at on every write; the app uses it as its sync cursor.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at before insert or update on public.tasks
  for each row execute function public.set_updated_at();

drop trigger if exists sessions_set_updated_at on public.sessions;
create trigger sessions_set_updated_at before insert or update on public.sessions
  for each row execute function public.set_updated_at();

-- Row-level security: every account can only ever see and change its own rows.
alter table public.tasks    enable row level security;
alter table public.sessions enable row level security;

drop policy if exists "tasks: own rows" on public.tasks;
create policy "tasks: own rows" on public.tasks
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "sessions: own rows" on public.sessions;
create policy "sessions: own rows" on public.sessions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
