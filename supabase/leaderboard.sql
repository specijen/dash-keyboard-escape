-- Dash Keyboard Escape: public leaderboard.
-- Run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- Safe to run again; it only creates what's missing and replaces the function.

-- One row per player per level, holding that player's best time.
create table if not exists public.leaderboard (
  level      smallint    not null check (level between 1 and 9),
  player_id  text        not null check (char_length(player_id) between 8 and 40),
  name       text        not null check (char_length(name) between 1 and 12),
  time_ms    integer     not null check (time_ms between 15000 and 3600000),
  dash       integer     not null default 0 check (dash between 0 and 1000000),
  shirt      text        check (shirt ~ '^#[0-9a-fA-F]{6}$'),
  updated_at timestamptz not null default now(),
  primary key (level, player_id)
);

create index if not exists leaderboard_level_time on public.leaderboard (level, time_ms);

-- Anyone can read the board. Nobody can write to the table directly...
alter table public.leaderboard enable row level security;
drop policy if exists "Anyone can read the leaderboard" on public.leaderboard;
create policy "Anyone can read the leaderboard"
  on public.leaderboard for select to anon, authenticated using (true);
grant select on public.leaderboard to anon, authenticated;

-- ...scores only go in through this function, which keeps each player's best time.
create or replace function public.submit_score(
  p_level int, p_player_id text, p_name text, p_time_ms int, p_dash int, p_shirt text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into leaderboard (level, player_id, name, time_ms, dash, shirt)
  values (p_level, p_player_id, btrim(p_name), p_time_ms, p_dash, p_shirt)
  on conflict (level, player_id) do update
    set name       = excluded.name,
        dash       = excluded.dash,
        shirt      = excluded.shirt,
        time_ms    = least(leaderboard.time_ms, excluded.time_ms),
        updated_at = now();
end;
$$;

revoke all on function public.submit_score(int, text, text, int, int, text) from public;
grant execute on function public.submit_score(int, text, text, int, int, text) to anon, authenticated;

-- To remove a score (e.g. a rude name): Table Editor → leaderboard → select the row → Delete.
