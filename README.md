# NIGHTLY — Web App (MVP)

A separate app from Rock Up — a real-time "vibe check" for venues, based on the document Caitlyn sent. This is a first build covering the document's own Phase 1 "must-haves": venue check-ins, vibe tags, time-limited visibility, and an activity feed.

## What's built vs. deliberately left out

**Built:**
- Check in at a real, verified venue (same OpenStreetMap search used in Rock Up)
- Pick a vibe (Chill / Busy / Lit / Dead) and an optional note
- Check-ins expire automatically after 2–4 hours (your choice at check-in)
- A feed grouped by venue, showing who's there and the overall vibe
- Check out manually any time before it expires

**Deliberately left out of this first build** — worth deciding on purpose, not by default:
- **ID/gender verification and QR profiles** — a real compliance and design project on its own
- **Gamification (badges, streaks, leaderboards)** — the source document includes this, but it's worth deciding deliberately rather than assuming it's wanted
- **Real friend graph / private visibility tiers** — everyone using the app currently shares one pilot board, same simplification used for Rock Up's first version
- **Monetisation, venue dashboards, advertising** — all Phase 2+ in the source document too

## Setup — same process as Rock Up

You'll need a **new, separate Supabase project** — don't reuse Rock Up's, since this is a distinct app with its own data.

1. **Supabase**: New project → SQL Editor → paste and run all of `schema.sql` → Authentication → Providers → enable Anonymous sign-ins → Project Settings → API Keys to get your URL and anon key
2. **Local test**: `npm install`, copy `.env.example` to `.env` and fill in your values, `npm run dev`
3. **Deploy**: push to a new GitHub repo, import into Vercel, add the same two environment variables, deploy

## Next steps worth discussing before building further

- Whether visibility tiers (friends-only, ghost mode) are worth building before wider testing, given the privacy sensitivity of location/presence data
- Whether vibe tags should be limited to actual checked-in users only (as the source document recommends) to prevent fake/drive-by tagging
- A real map view, rather than the current list — bigger build, worth validating the core loop first
