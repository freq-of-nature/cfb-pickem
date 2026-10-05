-- Group parlay: one leg per user per week.
-- Run this in the Supabase SQL editor (schema for this project lives only in Supabase).

create table if not exists parlay_picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  week_id integer not null references weeks(id) on delete cascade,

  -- What the user typed. `team` is the side they took, `spread_value` is signed
  -- from that team's perspective (+10.5 = getting points, -7.5 = laying them).
  team text not null,
  spread_value numeric(4,1) not null,

  -- null = not yet graded. Filled by settlement, or by hand from the admin page.
  result text check (result in ('win', 'loss', 'push')),

  -- Captured at grading time so past weeks can show the final score.
  opponent text,
  team_score integer,
  opp_score integer,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One entry per person per week. Changing a pick updates this row.
  unique (user_id, week_id)
);

create index if not exists parlay_picks_week_id_idx on parlay_picks (week_id);
