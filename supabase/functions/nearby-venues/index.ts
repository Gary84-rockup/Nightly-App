// Proxies Geoapify's Places API for the check-in tab's "near you" bar/pub/
// nightclub list — replaces the free public Overpass endpoints, which proved
// unreliable in production (both the primary overpass-api.de and the
// kumi.systems fallback were down/timing out simultaneously, see handoff
// doc). Same OSM-sourced data, hosted with an uptime SLA instead of a free
// best-effort mirror. Key stays server-side for the same reason as
// PREDICTHQ_API_KEY — a VITE_ env var would ship it in the public bundle.
//
// Deploy with: supabase functions deploy nearby-venues
// Needs this secret set first (supabase secrets set NAME=value):
//   GEOAPIFY_API_KEY

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CATEGORIES = "catering.bar,catering.pub,adult.nightclub";

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

    const params = new URLSearchParams({
      categories: CATEGORIES,
      filter: `circle:${lng},${lat},2000`,
      bias: `proximity:${lng},${lat}`,
      limit: "20",
      apiKey: Deno.env.get("GEOAPIFY_API_KEY")!,
    });

    const res = await fetch(`https://api.geoapify.com/v2/places?${params}`);
    if (!res.ok) throw new Error(`Geoapify HTTP ${res.status}`);
    const data = await res.json();

    const venues = (data.features || [])
      .map((f: any) => {
        const p = f.properties;
        if (!p?.name) return null;
        return {
          name: p.name,
          lat: p.lat,
          lng: p.lon,
          website: p.website || p.contact?.website || null,
        };
      })
      .filter(Boolean);

    return new Response(JSON.stringify({ venues }), {
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
