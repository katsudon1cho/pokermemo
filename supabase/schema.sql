create extension if not exists pgcrypto;

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text,
  appearance jsonb not null default '{}'::jsonb,
  appearance_note text not null default '',
  memo text not null default '',
  current_type_tags text[] not null default '{}',
  current_action_tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  casino_name text not null,
  seat_count integer not null default 9 check (seat_count in (6, 8, 9, 10)),
  hero_seat integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.session_seats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  seat_no integer not null,
  created_at timestamptz not null default now(),
  unique(session_id, seat_no)
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_players_updated_at on public.players;
create trigger touch_players_updated_at
before update on public.players
for each row execute function public.touch_updated_at();

drop trigger if exists touch_sessions_updated_at on public.sessions;
create trigger touch_sessions_updated_at
before update on public.sessions
for each row execute function public.touch_updated_at();

alter table public.players enable row level security;
alter table public.sessions enable row level security;
alter table public.session_seats enable row level security;

drop policy if exists "players_select_own" on public.players;
drop policy if exists "players_insert_own" on public.players;
drop policy if exists "players_update_own" on public.players;
drop policy if exists "players_delete_own" on public.players;
create policy "players_select_own" on public.players for select using (auth.uid() = user_id);
create policy "players_insert_own" on public.players for insert with check (auth.uid() = user_id);
create policy "players_update_own" on public.players for update using (auth.uid() = user_id);
create policy "players_delete_own" on public.players for delete using (auth.uid() = user_id);

drop policy if exists "sessions_select_own" on public.sessions;
drop policy if exists "sessions_insert_own" on public.sessions;
drop policy if exists "sessions_update_own" on public.sessions;
drop policy if exists "sessions_delete_own" on public.sessions;
create policy "sessions_select_own" on public.sessions for select using (auth.uid() = user_id);
create policy "sessions_insert_own" on public.sessions for insert with check (auth.uid() = user_id);
create policy "sessions_update_own" on public.sessions for update using (auth.uid() = user_id);
create policy "sessions_delete_own" on public.sessions for delete using (auth.uid() = user_id);

drop policy if exists "session_seats_select_own" on public.session_seats;
drop policy if exists "session_seats_insert_own" on public.session_seats;
drop policy if exists "session_seats_update_own" on public.session_seats;
drop policy if exists "session_seats_delete_own" on public.session_seats;
create policy "session_seats_select_own" on public.session_seats for select using (auth.uid() = user_id);
create policy "session_seats_insert_own" on public.session_seats for insert with check (auth.uid() = user_id);
create policy "session_seats_update_own" on public.session_seats for update using (auth.uid() = user_id);
create policy "session_seats_delete_own" on public.session_seats for delete using (auth.uid() = user_id);
