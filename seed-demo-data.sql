-- NIGHTLY demo data — 10 fake anonymous accounts checked into real,
-- OpenStreetMap-verified venues in Bishop's Stortford (same source the app
-- itself uses), so the feed feels busy for testing.
--
-- Run in the Supabase dashboard > SQL Editor > New query.
-- Safe to re-run: re-running refreshes these check-ins (fresh timestamps)
-- rather than piling up duplicates. Real venues are reused if they already
-- exist (e.g. from your own testing) rather than duplicated.
--
-- NOTE: the auth.users insert below uses Supabase's standard columns for a
-- password-less/anonymous-style account. If your project's auth.users table
-- has slightly different required columns and this errors, paste the exact
-- error back and it can be adjusted — this couldn't be tested against your
-- actual database from here.

-- 1. Fake accounts (fixed IDs so this script and the matching cleanup script stay in sync)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111101', 'authenticated', 'authenticated', null, '', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111102', 'authenticated', 'authenticated', null, '', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111103', 'authenticated', 'authenticated', null, '', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111104', 'authenticated', 'authenticated', null, '', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111105', 'authenticated', 'authenticated', null, '', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111106', 'authenticated', 'authenticated', null, '', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111107', 'authenticated', 'authenticated', null, '', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111108', 'authenticated', 'authenticated', null, '', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111109', 'authenticated', 'authenticated', null, '', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111110', 'authenticated', 'authenticated', null, '', now(), '{"provider":"anonymous","providers":["anonymous"]}', '{}', now(), now(), '', '', '', '')
on conflict (id) do nothing;

-- 2. Matching profiles
insert into profiles (id, name) values
  ('11111111-1111-1111-1111-111111111101', 'Ava'),
  ('11111111-1111-1111-1111-111111111102', 'Leo'),
  ('11111111-1111-1111-1111-111111111103', 'Priya'),
  ('11111111-1111-1111-1111-111111111104', 'Sam'),
  ('11111111-1111-1111-1111-111111111105', 'Tom'),
  ('11111111-1111-1111-1111-111111111106', 'Chloe'),
  ('11111111-1111-1111-1111-111111111107', 'Jordan'),
  ('11111111-1111-1111-1111-111111111108', 'Mia'),
  ('11111111-1111-1111-1111-111111111109', 'Ryan'),
  ('11111111-1111-1111-1111-111111111110', 'Freya')
on conflict (id) do update set name = excluded.name;

-- 3. Real Bishop's Stortford venues (skipped if they already exist — e.g. from your own testing)
insert into venues (name, lat, lng)
select v.name, v.lat, v.lng from (values
  ('The Three Tuns', 51.8665227, 0.1660082),
  ('The Black Lion', 51.8712542, 0.1596522),
  ('Rose & Crown', 51.8676282, 0.1627918)
) as v(name, lat, lng)
where not exists (select 1 from venues where venues.name = v.name);

-- 4. Clear any previous demo check-ins from these accounts, then add fresh ones
delete from checkins where user_id in (
  '11111111-1111-1111-1111-111111111101','11111111-1111-1111-1111-111111111102','11111111-1111-1111-1111-111111111103',
  '11111111-1111-1111-1111-111111111104','11111111-1111-1111-1111-111111111105','11111111-1111-1111-1111-111111111106',
  '11111111-1111-1111-1111-111111111107','11111111-1111-1111-1111-111111111108','11111111-1111-1111-1111-111111111109',
  '11111111-1111-1111-1111-111111111110'
);

insert into checkins (venue_id, user_id, user_name, vibe, note, visibility, expires_at, created_at)
select
  v.id,
  c.user_id::uuid,
  c.user_name,
  c.vibe,
  c.note,
  'shared',
  now() + make_interval(hours => c.hours_left),
  now() - make_interval(mins => c.mins_ago)
from (values
  -- The Three Tuns: 5 people, mostly lit — busy filter + pulse glow (5+) both trigger
  ('The Three Tuns', '11111111-1111-1111-1111-111111111101', 'Ava',    'lit',   'DJ''s actually good tonight',       3, 5),
  ('The Three Tuns', '11111111-1111-1111-1111-111111111102', 'Leo',    'lit',   'rammed but worth it',               3, 12),
  ('The Three Tuns', '11111111-1111-1111-1111-111111111103', 'Priya',  'lit',   null,                                2, 20),
  ('The Three Tuns', '11111111-1111-1111-1111-111111111104', 'Sam',    'busy',  'queue but moving fast',             3, 8),
  ('The Three Tuns', '11111111-1111-1111-1111-111111111105', 'Tom',    'busy',  null,                                2, 25),
  -- The Black Lion: 3 people, mostly busy — busy filter triggers
  ('The Black Lion',  '11111111-1111-1111-1111-111111111106', 'Chloe',  'busy',  'good crowd, decent music',         3, 15),
  ('The Black Lion',  '11111111-1111-1111-1111-111111111107', 'Jordan', 'busy',  null,                                3, 30),
  ('The Black Lion',  '11111111-1111-1111-1111-111111111108', 'Mia',    'chill', 'settled in the corner, nice vibe', 4, 40),
  -- Rose & Crown: 2 people, chill — quieter option for contrast
  ('Rose & Crown',    '11111111-1111-1111-1111-111111111109', 'Ryan',   'chill', 'quiet but decent atmosphere',      2, 18),
  ('Rose & Crown',    '11111111-1111-1111-1111-111111111110', 'Freya',  'chill', null,                                2, 35)
) as c(venue_name, user_id, user_name, vibe, note, hours_left, mins_ago)
join venues v on v.name = c.venue_name;
