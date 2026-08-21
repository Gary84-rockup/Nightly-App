// Fires when a row is inserted into crew_calls (via a Supabase Database
// Webhook — see setup instructions in PUSH-NOTIFICATIONS-SETUP.md). Looks up
// everyone in that crew (except whoever made the call), finds their saved
// push subscriptions, and sends each a real push notification.
//
// Deploy with: supabase functions deploy send-crew-call-push
// Needs these secrets set first (supabase secrets set NAME=value):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:you@example.com)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically by Supabase.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT")!,
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!
);

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const call = payload.record;
    if (!call?.crew_id) return new Response("ignored: no crew_id", { status: 200 });

    const { data: members, error: membersErr } = await supabase
      .from("crew_members")
      .select("user_id")
      .eq("crew_id", call.crew_id)
      .neq("user_id", call.from_user_id);
    if (membersErr) throw membersErr;
    if (!members?.length) return new Response("no other crew members", { status: 200 });

    const memberIds = members.map((m) => m.user_id);
    const { data: subs, error: subsErr } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth, user_id")
      .in("user_id", memberIds);
    if (subsErr) throw subsErr;
    if (!subs?.length) return new Response("no subscriptions for these members", { status: 200 });

    const isEventCall = !call.venue_id && call.event_id;
    const isPlanCall = !!call.plan_id;
    const notificationPayload = JSON.stringify({
      title: `📣 ${call.from_user_name} is calling the crew`,
      body: isEventCall
        ? `Checking interest in ${call.venue_name} — tap to say you're in.`
        : isPlanCall
        ? `Planning to be at ${call.venue_name} — tap to say you're in.`
        : `Heading to ${call.venue_name} — tap to check in too.`,
      url: "/",
    });

    const results = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          notificationPayload
        )
      )
    );

    // A 404/410 from the push service means that subscription is dead (e.g. uninstalled) — clean it up.
    const deadEndpoints = subs
      .filter((_, i) => {
        const r = results[i];
        return r.status === "rejected" && [404, 410].includes(r.reason?.statusCode);
      })
      .map((s) => s.endpoint);
    if (deadEndpoints.length) {
      await supabase.from("push_subscriptions").delete().in("endpoint", deadEndpoints);
    }

    const sent = results.filter((r) => r.status === "fulfilled").length;
    return new Response(`sent ${sent}/${subs.length}`, { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response(String(e), { status: 500 });
  }
});
