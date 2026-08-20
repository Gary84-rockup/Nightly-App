-- Stores Web Push subscriptions so a Supabase Edge Function can notify crew
-- members when "call the crew" happens, even if they don't have the app open
-- (works for anyone who's added NIGHTLY to their phone's home screen — see
-- the PWA notes in the handoff doc).
--
-- Run in the Supabase dashboard > SQL Editor > New query.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);

alter table push_subscriptions enable row level security;

drop policy if exists "Users manage their own push subscriptions" on push_subscriptions;
create policy "Users manage their own push subscriptions"
  on push_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Lets the send-crew-call-push Edge Function look up subscriptions for other
-- crew members (not just its own) when a call goes out — service-role calls
-- bypass RLS anyway, but this documents the intent.
comment on table push_subscriptions is 'One row per (user, device/browser) that has opted into push notifications.';
