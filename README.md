# NIGHTLY — Web App

A separate app from Rock Up — a real-time "vibe check" for venues, based on the document Caitlyn sent. Started as a Phase 1 MVP (venue check-ins, vibe tags, time-limited visibility, an activity feed) and has grown well past that — see `../nightly-handoff (1).md` for the full, current, feature-by-feature build status; this file is not kept up to date feature-by-feature and shouldn't be treated as the source of truth for what's built.

## What's built (high level — see the handoff doc for real detail)

- Check in at a real, verified venue (OpenStreetMap search), with a vibe (Chill/Busy/Lit/Dead/Match On), optional genre tag, note, and photo
- Check-ins expire automatically after 2–4 hours, or check out manually any time before
- A distance-sorted Feed merging live check-ins, nearby venues, and nearby events, with DICE-style photo cards
- Real friend graph, crews, crew calls (live + push), badges computed from real activity, weekend plans (create/edit/call the crew to one)
- Installable as a home-screen PWA; real accounts via magic link, layered on top of frictionless anonymous sign-in

**Deliberately left out, on purpose:**
- **ID/gender verification and QR profiles** — a real compliance and design project on its own
- **Monetisation, venue dashboards, advertising** — not this project's problem yet

## Setup — same process as Rock Up

You'll need a **new, separate Supabase project** — don't reuse Rock Up's, since this is a distinct app with its own data.

1. **Supabase**: New project → SQL Editor → run `schema.sql`, then every standalone `add-*.sql` migration file in the repo root, in date order (`schema.sql` alone is stale and missing most tables — see the "Standalone SQL scripts" list in `../nightly-handoff (1).md` for what each one does) → Authentication → Providers → enable Anonymous sign-ins → Project Settings → API Keys to get your URL and anon key
2. **Local test**: `npm install`, copy `.env.example` to `.env` and fill in your values, `npm run dev`
3. **Deploy**: push to a new GitHub repo, import into Vercel, add the same two environment variables, deploy

## Next steps worth discussing before building further

- Whether visibility tiers (friends-only, ghost mode) are worth building before wider testing, given the privacy sensitivity of location/presence data
- Whether vibe tags should be limited to actual checked-in users only (as the source document recommends) to prevent fake/drive-by tagging
- A real map view, rather than the current list — bigger build, worth validating the core loop first
