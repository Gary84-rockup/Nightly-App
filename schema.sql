-- Run this in your Supabase project's SQL Editor (Supabase dashboard > SQL Editor > New query)
-- Use a NEW, separate Supabase project for NIGHTLY — don't reuse the Rock Up one.

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

-- Venues are added by users the first time someone checks in somewhere new
create table venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lat double precision not null,
  lng double precision not null,
  osm_website text,
  created_at timestamptz default now()
);

-- Check-ins auto-expire (enforced in the app, not the database) after a
-- duration chosen at check-in time (default 3 hours).
create table checkins (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references venues(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  user_name text not null,
  vibe text not null, -- 'chill' | 'busy' | 'lit' | 'dead'
  note text,
  visibility text not null default 'shared', -- 'shared' (pilot-wide) | 'ghost' (hidden from feed, kept for future friends-only use)
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

alter table profiles enable row level security;
alter table venues enable row level security;
alter table checkins enable row level security;

create policy "Profiles viewable by signed-in users"
  on profiles for select using (auth.role() = 'authenticated');
create policy "Users insert their own profile"
  on profiles for insert with check (auth.uid() = id);
create policy "Users update their own profile"
  on profiles for update using (auth.uid() = id);

create policy "Venues viewable by signed-in users"
  on venues for select using (auth.role() = 'authenticated');
create policy "Signed-in users can add venues"
  on venues for insert with check (auth.role() = 'authenticated');

create policy "Checkins viewable by signed-in users"
  on checkins for select using (auth.role() = 'authenticated');
create policy "Users insert their own checkins"
  on checkins for insert with check (auth.uid() = user_id);
create policy "Users delete their own checkins"
  on checkins for delete using (auth.uid() = user_id);
