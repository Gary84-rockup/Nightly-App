-- Lets people mark "I'm interested" on a nearby event (from the PredictHQ
-- events panel on the Feed tab), and lets "call the crew" target an event
-- instead of only a venue. Run in the Supabase dashboard > SQL Editor > New
-- query (or via `supabase db query --linked -f add-event-interest.sql`).

create table if not exists event_interest (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  event_title text not null,
  user_id uuid references auth.users(id) on delete cascade,
  user_name text not null,
  created_at timestamptz default now(),
  unique (event_id, user_id)
);

alter table event_interest enable row level security;

drop policy if exists "Anyone can read event interest" on event_interest;
create policy "Anyone can read event interest"
  on event_interest for select
  using (true);

drop policy if exists "Users mark their own interest" on event_interest;
create policy "Users mark their own interest"
  on event_interest for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users remove their own interest" on event_interest;
create policy "Users remove their own interest"
  on event_interest for delete
  using (auth.uid() = user_id);

comment on table event_interest is 'One row per (event, user) who has tapped "I''m interested" on a nearby event.';

-- Lets a crew call target an event (crew_calls.venue_id stays null for these
-- — venue_name is reused to hold the event title so the existing banner UI
-- needs no schema-shape change there).
alter table crew_calls add column if not exists event_id text;
