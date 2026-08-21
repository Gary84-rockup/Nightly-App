-- Lets a check-in carry an optional photo. Run in the Supabase dashboard >
-- SQL Editor > New query (or via `supabase db query --linked -f add-checkin-photo.sql`).

alter table checkins add column if not exists photo_url text;

-- Public bucket — check-in photos are shown in the feed to any authenticated
-- user already (same visibility as the check-in itself), so the photo needs
-- to be publicly readable by URL. Writes are still locked to the uploading
-- user via the policies below.
insert into storage.buckets (id, name, public)
values ('checkin-photos', 'checkin-photos', true)
on conflict (id) do nothing;

drop policy if exists "Anyone can view checkin photos" on storage.objects;
create policy "Anyone can view checkin photos"
  on storage.objects for select
  using (bucket_id = 'checkin-photos');

-- Uploaded path is always "{user_id}/{filename}" — this policy checks the
-- first path segment matches the uploader's own auth id.
drop policy if exists "Users upload their own checkin photos" on storage.objects;
create policy "Users upload their own checkin photos"
  on storage.objects for insert
  with check (bucket_id = 'checkin-photos' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Users delete their own checkin photos" on storage.objects;
create policy "Users delete their own checkin photos"
  on storage.objects for delete
  using (bucket_id = 'checkin-photos' and auth.uid()::text = (storage.foldername(name))[1]);

comment on column checkins.photo_url is 'Public Supabase Storage URL for an optional photo attached at check-in, added 2026-08-21.';
