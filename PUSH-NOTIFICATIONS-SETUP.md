# Push Notifications Setup

Lets "call the crew" actually notify people even when they don't have the app
open — but only for people who've added NIGHTLY to their phone's home screen
(see the PWA notes in the handoff doc). Doesn't need an app store, Capacitor,
or a developer account.

**Real limitations, not bugs:**
- Only works on iOS 16.4+ (2023 or newer), and only once someone has done
  Share → Add to Home Screen in Safari. It will never work for someone just
  visiting the site in a normal browser tab.
- Apple disabled this entirely for EU-region Apple IDs in 2024 (DMA
  compliance). Not an issue for a UK-based friend group, but worth knowing.
- Push notifications generally can't be tested in a simulator — needs a real
  phone.

## 1. VAPID keys (already generated for this project)

A VAPID key pair identifies this app to the browser push services. One's
already been generated so you don't need to run anything:

```
Public key:  BDSellNRtVh_R7ibNm5MY7HJyuwctJ2uU-R1eYNqFb8GMCriDaWce0P6WS9wkJMsbK0iOsJN_nAguKJBT0TijPM
Private key: Va3o_zHeXq6_UUJCncudTAnMM02iZ3KDA6_taBoCOzA
```

The public key is safe to expose (it's already going in client code below).
**The private key is a secret** — it goes only into Supabase's Edge Function
secrets (step 4), never into git, never into the frontend `.env`.

If you'd rather generate your own pair instead of using the one above:
`npx web-push generate-vapid-keys`

## 2. Add the public key to your environment

Locally, add to `.env`:
```
VITE_VAPID_PUBLIC_KEY=BDSellNRtVh_R7ibNm5MY7HJyuwctJ2uU-R1eYNqFb8GMCriDaWce0P6WS9wkJMsbK0iOsJN_nAguKJBT0TijPM
```

And add the same as an environment variable in Vercel (Project Settings →
Environment Variables), then redeploy.

## 3. Run the database migration

`add-push-subscriptions.sql` in the Supabase SQL Editor — creates the
`push_subscriptions` table that stores who's opted in.

## 4. Deploy the Edge Function

Needs the [Supabase CLI](https://supabase.com/docs/guides/cli) installed and
logged in (`supabase login`), then from the `nightly-app` folder:

```bash
supabase link --project-ref <your-project-ref>
supabase secrets set VAPID_PUBLIC_KEY=BDSellNRtVh_R7ibNm5MY7HJyuwctJ2uU-R1eYNqFb8GMCriDaWce0P6WS9wkJMsbK0iOsJN_nAguKJBT0TijPM
supabase secrets set VAPID_PRIVATE_KEY=Va3o_zHeXq6_UUJCncudTAnMM02iZ3KDA6_taBoCOzA
supabase secrets set VAPID_SUBJECT=mailto:you@example.com
supabase functions deploy send-crew-call-push --no-verify-jwt
```

(`VAPID_SUBJECT` just identifies who's sending the push to the browser's push
service if something goes wrong — any real email or your site URL works.)

**`--no-verify-jwt` is required, every time this is redeployed, not just the
first time.** This function is only ever called by the Database Webhook
below, server-to-server — never by a client with a user session — and a
Database Webhook does not send an Authorization header. Deploying without
this flag resets JWT verification to Supabase's default of **on**, which
silently rejects every webhook call with 401 before the function code even
runs. This is exactly what happened live (see "Real root cause" below) —
easy to reintroduce by deploying this one function the "normal" way out of
habit, so it's called out here twice.

## 5. Wire it up: Database Webhook on crew_calls

In the Supabase dashboard: **Database → Webhooks → Create a new webhook**
- Table: `crew_calls`
- Events: `Insert`
- Type: `Supabase Edge Function`
- Function: `send-crew-call-push`

This is what actually triggers the function every time someone calls the
crew — without it, the function exists but nothing ever calls it.

## 6. Test it

1. On a real phone: open the live site in Safari (iOS) or Chrome (Android),
   then **Add to Home Screen**.
2. **Fully close that browser tab.** Tapping "install" does not switch the
   tab you're already in into standalone mode — it just adds the icon.
3. Open the app from the home-screen icon you just added (not the browser —
   push is blocked entirely outside standalone mode on iOS), go to the
   **hub** (as of 2026-08-21 the "turn on notifications" card lives there,
   not on the Crew tab — it's the first thing shown after logging in), tap
   **turn on notifications**, and accept the permission prompt.
4. From a second account/device, call the crew to a venue (or, as of
   2026-08-21, to a plan).
5. The first phone should get a real system notification within a few
   seconds — even if NIGHTLY isn't open.

If nothing arrives: check the Edge Function logs in the Supabase dashboard
(Functions → send-crew-call-push → Logs) for errors first — that'll usually
point at whichever step above was missed.

## Real root cause, found and fixed (2026-08-22)

Real report from actual users (Caitlyn's friends): "turn on notifications"
doesn't turn notifications on — confirmed still happening even from the
installed home-screen icon (i.e. not just the step-2/3 tab-vs-icon mixup
above, which was found and fixed the same day but didn't fully resolve it).

That report was the right instinct to keep pushing on: **the client-side
subscribe button was never actually the problem.** `send-crew-call-push`
was deployed at some point with JWT verification **on** (Supabase's
default for a function deploy that doesn't explicitly disable it) — and a
Database Webhook call carries no Authorization header, so every single
invocation was being rejected with `401 UNAUTHORIZED_NO_AUTH_HEADER`
before the function's own code ever ran. Confirmed directly: a POST to the
function's URL with no auth header returned 401; after redeploying with
`--no-verify-jwt`, the identical request returned 200 and the function's
real logic executed. The Database Webhook itself was confirmed present and
correctly targeting `crew_calls` (`supabase_functions.hooks` in the
database) — it was never a missing-webhook problem either.

This explains why the earlier iOS standalone-mode fix made no visible
difference: it fixed a real, separate issue on the *subscribing* side, but
subscribing was never what was broken — every subscription anyone ever
made was valid, the *sending* side was silently failing 100% of the time,
for everyone, regardless of platform. Also fixed the same pass: the
function's notification text didn't know about plan calls (added to the
app after this function was last touched) and would have shown "Heading
to X — tap to check in too" for a future plan rather than "Planning to be
at X."

**Confirm this hasn't regressed** the same way it did before: `supabase
functions list` should show `"verify_jwt": false` for
`send-crew-call-push`. If a future deploy of this function doesn't include
`--no-verify-jwt`, this exact failure mode returns, silently, with no
error visible anywhere in the app.
