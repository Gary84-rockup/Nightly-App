-- Adds an optional profile photo and short "what I'm into" bio line. Run in
-- the Supabase dashboard > SQL Editor > New query (or via
-- `supabase db query --linked -f add-profile-avatar-bio.sql`).

alter table profiles add column if not exists avatar_url text;
alter table profiles add column if not exists bio text;

-- Public bucket — profile photos are shown to friends (and anyone browsing
-- "everyone on NIGHTLY" in Friends search), same visibility as the name
-- itself already has. One file per user at "{user_id}/avatar.jpg", always
-- upserted (overwritten) rather than accumulating old photos.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Anyone can view avatars" on storage.objects;
create policy "Anyone can view avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Users upload their own avatar" on storage.objects;
create policy "Users upload their own avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Users update their own avatar" on storage.objects;
create policy "Users update their own avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Users delete their own avatar" on storage.objects;
create policy "Users delete their own avatar"
  on storage.objects for delete
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

comment on column profiles.bio is 'Optional short free-text line, e.g. "house music, chill pubs, quiz nights" — added 2026-08-21.';
