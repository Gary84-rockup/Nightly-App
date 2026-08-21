# Nightly — Working Rules

## Core vision (keep this in view for every session)

Nightly is a real-time nightlife "vibe check" app: show which venues are busy/good **right now** and who's there, so people don't turn up somewhere dead or miss somewhere great. The reason to open the app is "what's happening tonight" — not a general social network, a generic events listing, or a booking platform.

Full context: `../Nightly Social app/project-notes.md` (origin, business case, external feedback review) and `nightly-handoff (1).md` (full build status, feature-by-feature).

## Rule: check alignment with the vision, out loud

For any non-trivial piece of Nightly work (a new feature, a redesign, a scope decision — not a one-line bug fix):

1. **Before building**, name in one sentence how the request connects to the core "what's happening right now / who's out" loop — or say plainly if it's a deliberate step *beyond* that. (Example: "weekend plans" is forward-looking, not live — that's a real, reasoned expansion because it was named and justified explicitly, not scope creep.)
2. **After shipping**, give a one-line vision check: does this pull toward the core loop, sit adjacent to it on purpose, or risk drifting into something else entirely (generic social network, generic ticketing platform, etc.)? If it's drifting, say so directly rather than quietly building it anyway.

The point isn't to block work — it's to make scope decisions visible and deliberate rather than accidental, so Gary can see at a glance whether a session stayed on the core goal or wandered from it.
