-- Optional "what's on right now" tag per check-in (house/techno/live music/
-- cocktails/sports/quiz night), the recommendation #2 vibe/genre filter from
-- the 2026-08-21 competitive UX review. No CHECK constraint — same convention
-- as checkins.vibe, validated client-side against GENRE_TAGS in App.jsx. Run
-- in the Supabase dashboard > SQL Editor > New query (or via
-- `supabase db query --linked -f add-checkin-genre.sql`).

alter table checkins add column if not exists genre text;

comment on column checkins.genre is 'Optional "what''s on" tag — one of house/techno/live/cocktails/sports/quiz (see GENRE_TAGS in App.jsx), added 2026-08-21.';
