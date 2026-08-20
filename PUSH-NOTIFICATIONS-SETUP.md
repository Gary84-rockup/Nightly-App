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
supabase functions deploy send-crew-call-push
```

(`VAPID_SUBJECT` just identifies who's sending the push to the browser's push
service if something goes wrong — any real email or your site URL works.)

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
2. Open the app from the home-screen icon (not the browser — push only works
   from the installed icon), go to the **Crew** tab, tap **turn on
   notifications**, and accept the permission prompt.
3. From a second account/device, call the crew to a venue.
4. The first phone should get a real system notification within a few
   seconds — even if NIGHTLY isn't open.

If nothing arrives: check the Edge Function logs in the Supabase dashboard
(Functions → send-crew-call-push → Logs) for errors first — that'll usually
point at whichever step above was missed.
