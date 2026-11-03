-- Flying Head Game: run this entire script in Supabase Dashboard > SQL Editor.
-- Also enable Authentication > Providers > Anonymous Sign-Ins.

create table if not exists public.players (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (char_length(username) between 1 and 18),
  best_score integer not null default 0 check (best_score >= 0),
  games_played integer not null default 0 check (games_played >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.scores (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  score integer not null check (score >= 0),
  created_at timestamptz not null default now()
);

create index if not exists players_best_score_idx
  on public.players (best_score desc);
create index if not exists scores_player_id_idx
  on public.scores (player_id);

alter table public.players enable row level security;
alter table public.scores enable row level security;

drop policy if exists "Anyone can view leaderboard" on public.players;
create policy "Anyone can view leaderboard"
  on public.players for select using (true);

drop policy if exists "Players can create own profile" on public.players;
create policy "Players can create own profile"
  on public.players for insert to authenticated
  with check (auth.uid() = id);

drop policy if exists "Players can update own profile" on public.players;
create policy "Players can update own profile"
  on public.players for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Anyone can view scores" on public.scores;
create policy "Anyone can view scores"
  on public.scores for select using (true);

drop policy if exists "Players can insert own scores" on public.scores;
create policy "Players can insert own scores"
  on public.scores for insert to authenticated
  with check (auth.uid() = player_id);

grant usage on schema public to anon, authenticated;
grant select on public.players, public.scores to anon, authenticated;
grant insert, update on public.players to authenticated;
grant insert on public.scores to authenticated;
grant usage, select on sequence public.scores_id_seq to authenticated;
