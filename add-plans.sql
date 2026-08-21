-- "What am I doing this weekend" vs. "what am I doing right now" — a forward-
-- looking plan (venue + occasion + date), distinct from a live check-in.
-- Real-world driver: the SA vs All Blacks match on 2026-08-22, people already
-- messaging Caitlyn asking where she's watching it. Run in the Supabase
-- dashboard > SQL Editor > New query (or via
-- `supabase db query --linked -f add-plans.sql`).

create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  user_name text not null,
  venue_id uuid references venues(id) on delete cascade,
  venue_name text not null,
  genre text,
  note text,
  planned_date date not null,
  created_at timestamptz default now()
);

alter table plans enable row level security;

drop policy if exists "Anyone can read plans" on plans;
create policy "Anyone can read plans"
  on plans for select
  using (true);

drop policy if exists "Users create their own plans" on plans;
create policy "Users create their own plans"
  on plans for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users delete their own plans" on plans;
create policy "Users delete their own plans"
  on plans for delete
  using (auth.uid() = user_id);

comment on table plans is 'A forward-looking "I''ll be here" post (e.g. watching a match Saturday) — separate from checkins, which are live/right-now only. Added 2026-08-21.';

-- "🙋 me too" on a plan — same shape as event_interest.
create table if not exists plan_interest (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references plans(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  user_name text not null,
  created_at timestamptz default now(),
  unique (plan_id, user_id)
);

alter table plan_interest enable row level security;

drop policy if exists "Anyone can read plan interest" on plan_interest;
create policy "Anyone can read plan interest"
  on plan_interest for select
  using (true);

drop policy if exists "Users mark their own plan interest" on plan_interest;
create policy "Users mark their own plan interest"
  on plan_interest for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users remove their own plan interest" on plan_interest;
create policy "Users remove their own plan interest"
  on plan_interest for delete
  using (auth.uid() = user_id);

comment on table plan_interest is 'One row per (plan, user) who tapped "me too" on a friend''s weekend plan. Added 2026-08-21.';
