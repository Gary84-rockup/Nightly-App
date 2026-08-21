-- Lets people react to an individual check-in (the vibe-tinted rows inside an
-- expanded venue card) with one of a small curated set of emoji — Slack-style,
-- but a fixed set rather than a full picker (see REACTION_EMOJIS in App.jsx).
-- Run in the Supabase dashboard > SQL Editor > New query (or via
-- `supabase db query --linked -f add-checkin-reactions.sql`).

create table if not exists checkin_reactions (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid references checkins(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  user_name text not null,
  emoji text not null,
  created_at timestamptz default now(),
  unique (checkin_id, user_id, emoji)
);

alter table checkin_reactions enable row level security;

drop policy if exists "Anyone can read checkin reactions" on checkin_reactions;
create policy "Anyone can read checkin reactions"
  on checkin_reactions for select
  using (true);

drop policy if exists "Users add their own reactions" on checkin_reactions;
create policy "Users add their own reactions"
  on checkin_reactions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users remove their own reactions" on checkin_reactions;
create policy "Users remove their own reactions"
  on checkin_reactions for delete
  using (auth.uid() = user_id);

comment on table checkin_reactions is 'One row per (check-in, user, emoji) — a person can react to the same check-in with several different emoji, but not the same emoji twice.';
