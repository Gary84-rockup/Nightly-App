-- Lets a crew call target a future plan, not just a live venue or a
-- discovery event — same denormalization pattern as venue_name/event_id
-- (planned_date is copied in so the feed banner needs no join). Added
-- 2026-08-21 for "call my crew to a planned event". Run via
-- `supabase db query --linked -f add-crew-calls-plans.sql`.

alter table crew_calls add column if not exists plan_id uuid references plans(id) on delete cascade;
alter table crew_calls add column if not exists planned_date date;
