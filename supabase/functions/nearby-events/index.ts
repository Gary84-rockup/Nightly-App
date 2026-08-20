// Proxies PredictHQ's Events API so the API key stays server-side (a VITE_
// env var would ship it in the public client bundle). Called live from the
// Feed tab the same way "near you" venues call Overpass — device location in,
// events out — no caching table, since PredictHQ answers per-request.
//
// Deploy with: supabase functions deploy nearby-events
// Needs this secret set first (supabase secrets set NAME=value):
//   PREDICTHQ_API_KEY

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Categories chosen for relevance to "what's on nearby tonight" — excludes
// PredictHQ categories like sports, academic, politics, public-holidays,
// severe-weather etc. that don't belong in a nightlife app.
const CATEGORIES = "concerts,festivals,community,performing-arts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const { lat, lng } = await req.json();
    if (typeof lat !== "number" || typeof lng !== "number") {
      return new Response(JSON.stringify({ error: "lat/lng required" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString().slice(0, 19);
    const params = new URLSearchParams({
      within: `15km@${lat},${lng}`,
      category: CATEGORIES,
      "active.gte": now,
      sort: "start",
      limit: "50",
    });

    const res = await fetch(`https://api.predicthq.com/v1/events/?${params}`, {
      headers: {
        Authorization: `Bearer ${Deno.env.get("PREDICTHQ_API_KEY")}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`PredictHQ HTTP ${res.status}`);
    const data = await res.json();

    const events = (data.results || []).map((e: any) => ({
      id: e.id,
      title: e.title,
      category: e.category,
      start: e.start,
      startLocal: e.start_local,
      venueName: e.entities?.find((ent: any) => ent.type === "venue")?.name || null,
      address: e.entities?.find((ent: any) => ent.type === "venue")?.formatted_address || null,
      // PredictHQ prefixes every description with this boilerplate — strip it,
      // it's noise to a reader. No ticket-link field exists anywhere in the
      // PredictHQ event object (checked) — that'd need a different data source.
      description: e.description ? e.description.replace(/^Sourced from predicthq\.com - /, "").trim() || null : null,
    }));

    return new Response(JSON.stringify({ events }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
