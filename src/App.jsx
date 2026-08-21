import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";

const colors = {
  bg: "#0A0612",
  surface: "#1A1226",
  surfaceRaised: "#22182F",
  line: "#2E2140",
  text: "#F2EEFA",
  textMuted: "#8C7FA8",
  danger: "#C15B4A",
};

const VIBES = {
  chill: { label: "Chill", color: "#34E4EA", emoji: "🌙", gradient: "linear-gradient(135deg, #14282e, #1A1226)" },
  busy: { label: "Busy", color: "#FFC24B", emoji: "🔥", gradient: "linear-gradient(135deg, #2e2414, #1A1226)" },
  lit: { label: "Lit", color: "#FF3D9A", emoji: "⚡", gradient: "linear-gradient(135deg, #2e1424, #1A1226)" },
  dead: { label: "Dead", color: "#6B5F82", emoji: "💤", gradient: "linear-gradient(135deg, #1A1226, #1A1226)" },
};

// Curated reaction set for individual check-ins — deliberately fixed rather than a
// full emoji picker (would roughly double the app's bundle size for one feature on
// this dependency-free build, see project-notes.md).
const REACTION_EMOJIS = ["🔥", "❤️", "😂", "😮", "👏", "💀"];

const BADGES = [
  { id: "first", label: "First Night Out", emoji: "🌟", statKey: "checkinCount", target: 1, desc: "Check in once" },
  { id: "regular", label: "Regular", emoji: "🍹", statKey: "checkinCount", target: 5, desc: "5 check-ins" },
  { id: "legend", label: "Nightly Legend", emoji: "👑", statKey: "checkinCount", target: 15, desc: "15 check-ins" },
  { id: "explorer", label: "Explorer", emoji: "🗺️", statKey: "venueCount", target: 3, desc: "3 different venues" },
  { id: "nightowl", label: "Night Owl", emoji: "🦉", statKey: "venueCount", target: 8, desc: "8 different venues" },
  { id: "connector", label: "Connector", emoji: "🤝", statKey: "friendCount", target: 3, desc: "3 friends on NIGHTLY" },
];

const STAT_NOUNS = { checkinCount: "check-in", venueCount: "venue", friendCount: "friend" };
function statNoun(statKey, count) {
  const word = STAT_NOUNS[statKey] || "";
  return count === 1 ? word : `${word}s`;
}

const displayFont = "'Space Grotesk', sans-serif";
const bodyFont = "'Inter', sans-serif";
const monoFont = "'IBM Plex Mono', monospace";

function isOpenLate(hours) {
  if (!hours) return false;
  if (hours.includes("24/7")) return true;
  const ranges = hours.split(";").flatMap((part) => part.match(/(\d{2}:\d{2})-(\d{2}:\d{2})/g) || []);
  return ranges.some((r) => {
    const close = r.split("-")[1];
    const h = parseInt(close.split(":")[0], 10);
    return h >= 23 || h <= 6;
  });
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(m) {
  if (m == null) return null;
  if (m < 1000) return `${Math.round(m / 10) * 10}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

const EVENT_CATEGORY = {
  concerts: { emoji: "🎤", label: "Live Music" },
  festivals: { emoji: "🎪", label: "Festivals" },
  community: { emoji: "🎉", label: "Community" },
  "performing-arts": { emoji: "🎭", label: "Shows" },
};

function formatEventDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) +
    " · " + d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
}

// Browser Geolocation API — no key required, but needs a user-permission grant and HTTPS (or localhost).
function useGeolocation() {
  const [state, setState] = useState({ status: "idle", coords: null });

  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setState({ status: "unsupported", coords: null });
      return;
    }
    setState((s) => ({ ...s, status: "loading" }));

    const onSuccess = (pos) => setState({ status: "granted", coords: { lat: pos.coords.latitude, lng: pos.coords.longitude } });

    // A GPS fix indoors or on a cold start can easily exceed a short timeout even with
    // permission granted — that's not the same as being denied, so retry once using
    // network/wifi-based location (faster, coarser, but far more reliable indoors)
    // before telling the user location isn't available.
    const tryLowAccuracy = () => {
      navigator.geolocation.getCurrentPosition(
        onSuccess,
        (err) => setState({ status: err.code === 1 ? "denied" : "unavailable", coords: null }),
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
      );
    };

    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (err) => {
        if (err.code === 1) {
          setState({ status: "denied", coords: null }); // permission actually denied — retrying won't help
        } else {
          tryLowAccuracy();
        }
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }, []);

  return { ...state, request };
}

// Push notifications only work for a PWA that's been added to the home screen
// (iOS 16.4+, or Android/Chrome) — see PUSH-NOTIFICATIONS-SETUP.md.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function isIOSDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
}

function isStandaloneDisplay() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

async function subscribeToPush(supabaseClient, userId) {
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidKey) throw new Error("VITE_VAPID_PUBLIC_KEY isn't set — see PUSH-NOTIFICATIONS-SETUP.md");
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Push isn't supported in this browser");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("permission-denied");

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });
  const json = subscription.toJSON();

  const { error } = await supabaseClient.from("push_subscriptions").upsert(
    { user_id: userId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
    { onConflict: "endpoint" }
  );
  if (error) throw error;
}

function Button({ children, onClick, variant = "primary", accent, style, disabled }) {
  const base = {
    padding: "12px 16px",
    borderRadius: 10,
    border: "none",
    fontFamily: bodyFont,
    fontWeight: 700,
    fontSize: 13.5,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.4 : 1,
  };
  const variants = {
    primary: { background: accent || "#FF3D9A", color: "#0A0612" },
    ghost: { background: "transparent", color: colors.textMuted, border: `1px solid ${colors.line}`, fontWeight: 500 },
    danger: { background: "transparent", color: colors.danger, border: `1px solid ${colors.danger}` },
  };
  return (
    <button onClick={disabled ? undefined : onClick} style={{ ...base, ...variants[variant], ...style }}>
      {children}
    </button>
  );
}

function NameGate({ onSet, busy, onSendMagicLink, inviterName }) {
  const [name, setName] = useState("");
  const [showSignIn, setShowSignIn] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [signInError, setSignInError] = useState(null);

  const inputStyle = {
    width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${colors.line}`,
    background: colors.surface, color: colors.text, fontFamily: bodyFont, fontSize: 14,
    marginBottom: 14, boxSizing: "border-box",
  };

  const sendLink = async () => {
    setSending(true);
    setSignInError(null);
    try {
      await onSendMagicLink(email.trim());
      setSent(true);
    } catch (e) {
      setSignInError("Couldn't send that link — try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ padding: "70px 24px", textAlign: "center" }}>
      <div style={{ fontFamily: displayFont, fontWeight: 700, fontSize: 13, color: "#FF3D9A", letterSpacing: "0.1em", marginBottom: 6 }}>
        NIGHTLY
      </div>
      <div style={{ fontFamily: displayFont, fontWeight: 700, fontSize: 24, color: colors.text, marginBottom: 8 }}>
        {inviterName ? `${inviterName} invited you to NIGHTLY` : "who's out tonight?"}
      </div>

      {showSignIn ? (
        sent ? (
          <div style={{ fontFamily: bodyFont, fontSize: 13, color: colors.textMuted, lineHeight: 1.5 }}>
            ✉️ check <strong style={{ color: colors.text }}>{email.trim()}</strong> for a sign-in link.
          </div>
        ) : (
          <>
            <div style={{ fontFamily: bodyFont, fontSize: 13, color: colors.textMuted, marginBottom: 20, lineHeight: 1.5 }}>
              enter the email you saved your account with — we'll send a link, no password needed.
            </div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              type="email"
              style={inputStyle}
            />
            {signInError && (
              <div style={{ fontFamily: bodyFont, fontSize: 11.5, color: colors.danger, marginBottom: 10 }}>{signInError}</div>
            )}
            <Button onClick={sendLink} disabled={!email.trim() || sending} style={{ width: "100%", marginBottom: 10 }}>
              {sending ? "sending…" : "send sign-in link"}
            </Button>
            <button
              onClick={() => setShowSignIn(false)}
              style={{ background: "none", border: "none", color: colors.textMuted, fontFamily: bodyFont, fontSize: 12, cursor: "pointer" }}
            >
              ← back
            </button>
          </>
        )
      ) : (
        <>
          <div style={{ fontFamily: bodyFont, fontSize: 13, color: colors.textMuted, marginBottom: 20, lineHeight: 1.5 }}>
            {inviterName ? "join them — just your name to try it out, no account needed." : "just your name to try it out — no account needed."}
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="your name"
            style={inputStyle}
          />
          <Button onClick={() => name.trim() && onSet(name.trim())} disabled={!name.trim() || busy} style={{ width: "100%", marginBottom: 14 }}>
            {busy ? "setting up..." : "let's go"}
          </Button>
          <button
            onClick={() => setShowSignIn(true)}
            style={{ background: "none", border: "none", color: "#34E4EA", fontFamily: bodyFont, fontSize: 12, cursor: "pointer", fontWeight: 600 }}
          >
            already saved an account? sign in
          </button>
        </>
      )}
    </div>
  );
}

function CheckInForm({ onCreate, onCancel, initialVenueQuery, presetVenue, tonightCrew }) {
  const [venueQuery, setVenueQuery] = useState(initialVenueQuery || "");
  const [venueResults, setVenueResults] = useState([]);
  const [selectedVenue, setSelectedVenue] = useState(
    presetVenue
      ? { id: presetVenue.id, name: presetVenue.name, lat: presetVenue.lat, lng: presetVenue.lng, website: presetVenue.osm_website }
      : null
  );
  const [vibe, setVibe] = useState("chill");
  const [note, setNote] = useState("");
  const [hours, setHours] = useState(3);
  const [includeCrew, setIncludeCrew] = useState(!!tonightCrew);
  const [nearby, setNearby] = useState([]);
  const [nearbyStatus, setNearbyStatus] = useState("idle");
  const [nearbyRetryCount, setNearbyRetryCount] = useState(0);
  const justSelectedRef = React.useRef(false);
  const geo = useGeolocation();

  useEffect(() => {
    if (presetVenue) return;
    geo.request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetVenue]);

  // Nearby bars/pubs/clubs via a Geoapify-backed Edge Function (still OSM
  // data underneath, but hosted with an uptime SLA instead of the free
  // public Overpass endpoints, which proved unreliable in production).
  useEffect(() => {
    if (presetVenue || geo.status !== "granted" || !geo.coords) return;
    let cancelled = false;
    setNearbyStatus("loading");
    const { lat, lng } = geo.coords;

    supabase.functions
      .invoke("nearby-venues", { body: { lat, lng } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) throw error;
        const results = (data.venues || [])
          .map((v) => ({ ...v, distance: distanceMeters(lat, lng, v.lat, v.lng) }))
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 8);
        setNearby(results);
        setNearbyStatus(results.length > 0 ? "done" : "empty");
      })
      .catch(() => {
        if (!cancelled) setNearbyStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [presetVenue, geo.status, geo.coords, nearbyRetryCount]);

  useEffect(() => {
    if (presetVenue || justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    if (!venueQuery || venueQuery.length < 3) {
      setVenueResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        let data = [];
        if (geo.coords) {
          // Hard-filtered to a ~10km box around the user first — a soft bias alone let a same-named
          // venue on the other side of the country outrank the real nearby match in the top results.
          const d = 0.09;
          const boundedParams = new URLSearchParams({
            format: "json",
            limit: "8",
            extratags: "1",
            q: venueQuery,
            viewbox: `${geo.coords.lng - d},${geo.coords.lat + d},${geo.coords.lng + d},${geo.coords.lat - d}`,
            bounded: "1",
          });
          const res = await fetch(`https://nominatim.openstreetmap.org/search?${boundedParams.toString()}`);
          data = await res.json();
          if (data.length === 0) {
            // Nothing with that name nearby — fall back to a global search rather than showing nothing.
            const fallbackParams = new URLSearchParams({ format: "json", limit: "5", extratags: "1", q: venueQuery });
            const fallbackRes = await fetch(`https://nominatim.openstreetmap.org/search?${fallbackParams.toString()}`);
            data = await fallbackRes.json();
          }
        } else {
          const params = new URLSearchParams({ format: "json", limit: "5", extratags: "1", q: venueQuery });
          const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
          data = await res.json();
        }
        // Nominatim text search matches names on any tagged feature, not just venues — e.g. a bus
        // stop named after the pub next to it ("The Three Tuns PH") will match "three tuns" too.
        // Exclude classes that are never places you'd check into.
        const NON_VENUE_CLASSES = new Set(["highway", "boundary", "waterway", "natural", "landuse", "railway", "place", "administrative"]);
        const seen = new Set();
        let results = data
          .filter((r) => !NON_VENUE_CLASSES.has(r.class))
          .filter((r) => (seen.has(r.display_name) ? false : (seen.add(r.display_name), true)));
        if (geo.coords) {
          results = results
            .sort(
              (a, b) =>
                distanceMeters(geo.coords.lat, geo.coords.lng, parseFloat(a.lat), parseFloat(a.lon)) -
                distanceMeters(geo.coords.lat, geo.coords.lng, parseFloat(b.lat), parseFloat(b.lon))
            )
            .slice(0, 5);
        }
        setVenueResults(results);
      } catch (e) {
        setVenueResults([]);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [venueQuery, presetVenue, geo.coords]);

  const pickVenue = (v) => {
    justSelectedRef.current = true;
    setSelectedVenue(v);
    setVenueQuery(v.name);
    setVenueResults([]);
  };

  const selectVenue = (r) => {
    pickVenue({
      name: r.display_name.split(",")[0],
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      website: (r.extratags && (r.extratags.website || r.extratags["contact:website"])) || null,
      openingHours: (r.extratags && r.extratags.opening_hours) || null,
    });
  };

  const label = { fontFamily: monoFont, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.textMuted, marginBottom: 6, display: "block" };
  const inputStyle = { width: "100%", padding: "11px 13px", borderRadius: 9, border: `1px solid ${colors.line}`, background: colors.surface, color: colors.text, fontFamily: bodyFont, fontSize: 13.5, boxSizing: "border-box" };

  return (
    <div style={{ padding: "18px 20px 40px" }}>
      <div style={{ fontFamily: displayFont, fontWeight: 700, fontSize: 20, color: colors.text, marginBottom: 16 }}>check in</div>

      <label style={label}>venue</label>
      {presetVenue ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 14px",
            borderRadius: 10,
            background: "#14282e",
            border: "1px solid #34E4EA66",
            marginBottom: 14,
          }}
        >
          <span style={{ fontFamily: bodyFont, fontSize: 13.5, color: colors.text, fontWeight: 600 }}>📍 {presetVenue.name}</span>
          <span style={{ fontFamily: monoFont, fontSize: 10, color: "#34E4EA" }}>✓ already spotted</span>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontFamily: monoFont, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.textMuted }}>
              📍{" "}
              {geo.status === "loading"
                ? "finding you…"
                : geo.status === "granted"
                ? "near you"
                : geo.status === "denied"
                ? "location blocked for this site"
                : geo.status === "unavailable"
                ? "couldn't get a location fix"
                : geo.status === "unsupported"
                ? "location not supported on this browser"
                : "location off"}
            </span>
            {(geo.status === "denied" || geo.status === "unavailable" || geo.status === "unsupported" || geo.status === "idle") && (
              <button onClick={geo.request} style={{ background: "none", border: "none", color: "#34E4EA", fontSize: 10.5, fontFamily: bodyFont, cursor: "pointer", fontWeight: 700, padding: 0 }}>
                {geo.status === "denied" ? "check browser settings" : "retry"}
              </button>
            )}
          </div>
          {geo.status === "denied" && (
            <div style={{ fontFamily: bodyFont, fontSize: 11, color: colors.textMuted, marginBottom: 10, lineHeight: 1.4 }}>
              your browser has location blocked for this site — enable it in your browser's site settings (often the 🔒 or ⓘ icon next to the address bar), then tap retry.
            </div>
          )}

          {geo.status === "granted" && nearbyStatus === "loading" && (
            <div style={{ fontFamily: bodyFont, fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>looking for nearby spots…</div>
          )}
          {geo.status === "granted" && nearbyStatus === "empty" && (
            <div style={{ fontFamily: bodyFont, fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>nothing tagged as a bar/pub/club within 2km on OpenStreetMap — search below instead.</div>
          )}
          {geo.status === "granted" && nearbyStatus === "error" && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: bodyFont, fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>
              <span>couldn't load nearby spots — search still works below.</span>
              <button
                onClick={() => setNearbyRetryCount((c) => c + 1)}
                style={{ background: "none", border: "none", color: "#34E4EA", fontSize: 11, fontFamily: bodyFont, cursor: "pointer", fontWeight: 700, padding: 0, marginLeft: 8, flexShrink: 0 }}
              >
                retry
              </button>
            </div>
          )}
          {geo.status === "granted" && nearby.length > 0 && (
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 14 }}>
              {nearby.map((v) => (
                <div
                  key={`${v.name}-${v.lat}-${v.lng}`}
                  onClick={() => pickVenue(v)}
                  style={{ flex: "0 0 auto", minWidth: 120, maxWidth: 150, background: colors.surfaceRaised, border: `1px solid ${colors.line}`, borderRadius: 10, padding: "8px 10px", cursor: "pointer" }}
                >
                  <div style={{ fontFamily: bodyFont, fontWeight: 700, fontSize: 12, color: colors.text, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.name}</div>
                  <div style={{ fontFamily: monoFont, fontSize: 10, color: "#34E4EA" }}>{formatDistance(v.distance)} away</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ position: "relative", marginBottom: 6 }}>
            <input
              style={inputStyle}
              value={venueQuery}
              onChange={(e) => { setVenueQuery(e.target.value); setSelectedVenue(null); }}
              placeholder="start typing a real venue..."
            />
            {venueResults.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10, background: colors.surfaceRaised, border: `1px solid ${colors.line}`, borderRadius: 9, marginTop: 4, overflow: "hidden" }}>
                {venueResults.map((r) => {
                  const dist = geo.coords ? distanceMeters(geo.coords.lat, geo.coords.lng, parseFloat(r.lat), parseFloat(r.lon)) : null;
                  return (
                    <div key={r.place_id} onClick={() => selectVenue(r)} style={{ padding: "9px 12px", fontSize: 12.5, color: colors.text, cursor: "pointer", borderBottom: `1px solid ${colors.line}` }}>
                      <div>{r.display_name}</div>
                      {dist != null && <div style={{ fontFamily: monoFont, fontSize: 10, color: colors.textMuted, marginTop: 2 }}>{formatDistance(dist)} away</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div style={{ fontFamily: bodyFont, fontSize: 10.5, color: selectedVenue ? "#34E4EA" : colors.textMuted, marginBottom: 14 }}>
            {selectedVenue ? "✓ verified venue" : "pick a real place from the list"}
          </div>
        </>
      )}

      <label style={label}>vibe right now</label>
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {Object.entries(VIBES).map(([key, v]) => (
          <Button key={key} variant={vibe === key ? "primary" : "ghost"} accent={v.color} onClick={() => setVibe(key)} style={{ flex: 1, minWidth: 70 }}>
            {v.emoji} {v.label}
          </Button>
        ))}
      </div>

      <label style={label}>note (optional)</label>
      <input style={{ ...inputStyle, marginBottom: 14 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="queue's short, DJ's good..." />

      <label style={label}>visible for</label>
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {[2, 3, 4].map((h) => (
          <Button key={h} variant={hours === h ? "primary" : "ghost"} accent="#34E4EA" onClick={() => setHours(h)} style={{ flex: 1 }}>
            {h}h
          </Button>
        ))}
      </div>

      {tonightCrew && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 12px",
            background: colors.surface,
            border: `1px solid ${colors.line}`,
            borderRadius: 9,
            marginBottom: 20,
          }}
        >
          <span style={{ fontFamily: bodyFont, fontSize: 13, color: colors.text }}>
            👥 checking in with <strong>{tonightCrew.name}</strong>
          </span>
          <input type="checkbox" checked={includeCrew} onChange={(e) => setIncludeCrew(e.target.checked)} style={{ width: 18, height: 18 }} />
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <Button variant="ghost" onClick={onCancel} style={{ flex: 1 }}>cancel</Button>
        <Button
          disabled={!selectedVenue}
          onClick={() =>
            selectedVenue &&
            onCreate({
              venue: selectedVenue,
              vibe,
              note: note.trim(),
              hours,
              crewId: includeCrew && tonightCrew ? tonightCrew.id : null,
            })
          }
          style={{ flex: 2 }}
        >
          check in
        </Button>
      </div>
    </div>
  );
}

function VenueCard({ group, myName, myId, onCheckOut, onCheckInHere, onUpdateVibe, defaultExpanded, isFavorite, onToggleFavorite, friendIds, crews, onCallCrew, distance, reactionsByCheckin, onToggleReaction }) {
  const [pickingCrew, setPickingCrew] = useState(false);
  const [called, setCalled] = useState(false);
  const [expanded, setExpanded] = useState(!!defaultExpanded);
  const vibeCounts = {};
  group.checkins.forEach((c) => { vibeCounts[c.vibe] = (vibeCounts[c.vibe] || 0) + 1; });
  const topVibeEntry = Object.entries(vibeCounts).sort((a, b) => b[1] - a[1])[0];
  const v = topVibeEntry
    ? VIBES[topVibeEntry[0]]
    : { label: "Quiet for now", color: "#6B5F82", emoji: "🌑", gradient: "linear-gradient(135deg, #1A1226, #1A1226)" };
  const mine = group.checkins.find((c) => c.user_id === myId);
  const isPumping = group.checkins.length >= 5;

  return (
    <div
      onClick={() => setExpanded((e) => !e)}
      className={isPumping ? "nightly-pulse" : ""}
      style={{
        background: v.gradient,
        border: `1px solid ${v.color}44`,
        borderRadius: 18,
        padding: 16,
        marginBottom: 14,
        boxShadow: `0 0 24px -8px ${v.color}66`,
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
          {group.venue.id && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(group.venue.id); }}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 16, flexShrink: 0 }}
              aria-label="Toggle favourite"
            >
              {isFavorite ? "⭐" : "☆"}
            </button>
          )}
          <div style={{ fontFamily: displayFont, fontWeight: 700, fontSize: 17, color: colors.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {group.venue.name}
          </div>
        </div>
        <span
          style={{
            fontFamily: monoFont,
            fontSize: 10,
            fontWeight: 700,
            color: colors.bg,
            background: v.color,
            borderRadius: 20,
            padding: "3px 10px",
            whiteSpace: "nowrap",
            flexShrink: 0,
            marginLeft: 8,
          }}
        >
          {v.emoji} {v.label.toUpperCase()}
        </span>
      </div>
      {isOpenLate(group.venue.opening_hours) && (
        <div style={{ fontFamily: monoFont, fontSize: 9.5, color: "#34E4EA", fontWeight: 700, marginBottom: 8 }}>
          🌃 OPEN LATE
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: bodyFont, fontSize: 12.5, color: colors.textMuted, fontWeight: 600 }}>
          {distance != null && `📍 ${formatDistance(distance)} · `}
          {group.checkins.length === 0
            ? "nobody's checked in — be the first"
            : `🎉 ${group.checkins.length} ${group.checkins.length === 1 ? "person" : "people"} here right now`}
        </div>
        <div style={{ fontFamily: bodyFont, fontSize: 11, color: colors.textMuted }}>{expanded ? "▲" : "▼"}</div>
      </div>
      {friendIds && group.checkins.some((c) => friendIds.has(c.user_id)) && (
        <div style={{ fontFamily: bodyFont, fontSize: 11.5, color: "#FFC24B", fontWeight: 700, marginTop: 4 }}>
          👋 {group.checkins.filter((c) => friendIds.has(c.user_id)).length} of them {group.checkins.filter((c) => friendIds.has(c.user_id)).length === 1 ? "is" : "are"} your friend
          {group.checkins.filter((c) => friendIds.has(c.user_id)).length === 1 ? "" : "s"}
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
          {group.checkins.map((c) => {
            const isFriend = friendIds && friendIds.has(c.user_id);
            return (
              <div
                key={c.id}
                style={{
                  fontFamily: bodyFont,
                  fontSize: 12,
                  color: colors.text,
                  marginBottom: 4,
                  fontWeight: isFriend ? 700 : 500,
                  background: isFriend ? "#FFC24B22" : "transparent",
                  borderRadius: 6,
                  padding: isFriend ? "3px 6px" : 0,
                }}
              >
                {isFriend && <span style={{ marginRight: 4 }}>👋</span>}
                <span style={{ color: VIBES[c.vibe].color }}>{VIBES[c.vibe].emoji}</span> {c.user_name}
                {isFriend && <span style={{ color: "#FFC24B", fontSize: 10, marginLeft: 4 }}>· friend</span>}
                {c.note ? <span style={{ color: colors.textMuted }}> — "{c.note}"</span> : null}
                {onToggleReaction && (
                  <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                    {REACTION_EMOJIS.map((emoji) => {
                      const r = reactionsByCheckin?.[c.id]?.[emoji];
                      const count = r?.count || 0;
                      const reacted = !!r?.mine;
                      return (
                        <button
                          key={emoji}
                          onClick={(e) => { e.stopPropagation(); onToggleReaction(c.id, emoji); }}
                          style={{
                            fontSize: 11,
                            padding: "2px 6px",
                            borderRadius: 8,
                            border: `1px solid ${reacted ? "#FF3D9A" : colors.line}`,
                            background: reacted ? "#FF3D9A22" : "transparent",
                            color: colors.text,
                            cursor: "pointer",
                            opacity: count === 0 ? 0.45 : 1,
                            lineHeight: 1.4,
                          }}
                        >
                          {emoji}
                          {count > 0 ? ` ${count}` : ""}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {group.venue.osm_website && (
            <a href={group.venue.osm_website} target="_blank" rel="noopener noreferrer" style={{ fontFamily: bodyFont, fontSize: 11, color: "#34E4EA", textDecoration: "underline", fontWeight: 600 }}>
              🌐 venue website
            </a>
          )}
          {mine ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontFamily: monoFont, fontSize: 9.5, letterSpacing: "0.06em", color: colors.textMuted, textTransform: "uppercase", marginBottom: 6 }}>
                update your vibe
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {Object.entries(VIBES).map(([key, vb]) => (
                  <Button
                    key={key}
                    variant={mine.vibe === key ? "primary" : "ghost"}
                    accent={vb.color}
                    onClick={() => onUpdateVibe(mine.id, key)}
                    style={{ padding: "6px 10px", fontSize: 11.5 }}
                  >
                    {vb.emoji} {vb.label}
                  </Button>
                ))}
              </div>
              <Button variant="danger" onClick={() => onCheckOut(mine.id)} style={{ padding: "7px 12px", fontSize: 11.5 }}>
                check out
              </Button>
            </div>
          ) : (
            <div style={{ marginTop: 10 }}>
              <Button onClick={() => onCheckInHere(group.venue)} style={{ padding: "8px 14px", fontSize: 12 }}>
                📍 check in here too
              </Button>
            </div>
          )}

          {crews && crews.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {called ? (
                <div style={{ fontFamily: bodyFont, fontSize: 11.5, color: "#FF3D9A", fontWeight: 700 }}>
                  📣 crew called!
                </div>
              ) : pickingCrew ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontFamily: bodyFont, fontSize: 11, color: colors.textMuted, marginBottom: 2 }}>
                    call which crew?
                  </div>
                  {crews.map((c) => (
                    <Button
                      key={c.id}
                      variant="ghost"
                      onClick={() => { onCallCrew(c.id, group.venue); setCalled(true); setPickingCrew(false); }}
                      style={{ padding: "7px 10px", fontSize: 11.5, textAlign: "left" }}
                    >
                      {c.name}
                    </Button>
                  ))}
                </div>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() =>
                    crews.length === 1
                      ? (onCallCrew(crews[0].id, group.venue), setCalled(true))
                      : setPickingCrew(true)
                  }
                  style={{ padding: "7px 12px", fontSize: 11.5 }}
                >
                  📣 call the crew here
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EventCard({ event, interest, onToggleInterest, onCheckInHere, crews, onCallCrew, distance, fullWidth }) {
  const [expanded, setExpanded] = useState(false);
  const [pickingCrew, setPickingCrew] = useState(false);
  const [called, setCalled] = useState(false);
  const cat = EVENT_CATEGORY[event.category] || { emoji: "📅", label: event.category };
  const mine = interest?.mine;
  const count = interest?.count || 0;

  return (
    <div
      onClick={() => setExpanded((v) => !v)}
      style={
        fullWidth
          ? {
              background: colors.surfaceRaised,
              border: `1px solid ${mine ? "#FF3D9A88" : colors.line}`,
              borderRadius: 18,
              padding: 16,
              marginBottom: 14,
              cursor: "pointer",
            }
          : {
              flex: "0 0 auto",
              minWidth: 160,
              maxWidth: expanded ? 240 : 190,
              background: colors.surfaceRaised,
              border: `1px solid ${mine ? "#FF3D9A88" : colors.line}`,
              borderRadius: 10,
              padding: "10px 12px",
              cursor: "pointer",
            }
      }
    >
      <div style={{ fontFamily: bodyFont, fontWeight: 700, fontSize: 12.5, color: colors.text, marginBottom: 4, lineHeight: 1.3 }}>
        {cat.emoji} {event.title}
      </div>
      <div style={{ fontFamily: monoFont, fontSize: 10, color: "#FF3D9A", marginBottom: 2 }}>{formatEventDate(event.start)}</div>
      {distance != null && (
        <div style={{ fontFamily: bodyFont, fontSize: 10.5, color: colors.textMuted, marginBottom: 2 }}>📍 {formatDistance(distance)} away</div>
      )}
      {event.venueName && (
        <div style={{ fontFamily: bodyFont, fontSize: 10.5, color: colors.textMuted, whiteSpace: expanded || fullWidth ? "normal" : "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          📍 {event.venueName}
        </div>
      )}
      {count > 0 && (
        <div style={{ fontFamily: bodyFont, fontSize: 10.5, color: mine ? "#FF3D9A" : colors.textMuted, marginTop: 4, fontWeight: mine ? 700 : 500 }}>
          🙋 {count} interested{mine ? " (you)" : ""}
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }} onClick={(e) => e.stopPropagation()}>
          {event.description && (
            <div style={{ fontFamily: bodyFont, fontSize: 11, color: colors.text, lineHeight: 1.4 }}>{event.description}</div>
          )}
          {event.address && (
            <div style={{ fontFamily: bodyFont, fontSize: 10.5, color: colors.textMuted, lineHeight: 1.4 }}>{event.address}</div>
          )}
          {/* PredictHQ has no ticket-URL field on any event, so this is a search
              fallback rather than a direct RA/DICE-style deep link. */}
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(`${event.title} tickets`)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontFamily: bodyFont, fontSize: 11, color: "#34E4EA", textDecoration: "underline", fontWeight: 600 }}
          >
            🎟️ search for tickets
          </a>
          {event.venueName && (
            <Button onClick={() => onCheckInHere(event.venueName)} style={{ padding: "7px 10px", fontSize: 11.5 }}>
              📍 check in there
            </Button>
          )}
          <Button
            variant={mine ? "primary" : "ghost"}
            accent="#FF3D9A"
            onClick={() => onToggleInterest(event.id, event.title)}
            style={{ padding: "7px 10px", fontSize: 11.5 }}
          >
            🙋 {mine ? "you're interested" : "I'm interested"}
          </Button>

          {crews && crews.length > 0 && (
            called ? (
              <div style={{ fontFamily: bodyFont, fontSize: 11.5, color: "#FF3D9A", fontWeight: 700 }}>📣 crew called!</div>
            ) : pickingCrew ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontFamily: bodyFont, fontSize: 11, color: colors.textMuted, marginBottom: 2 }}>call which crew?</div>
                {crews.map((c) => (
                  <Button
                    key={c.id}
                    variant="ghost"
                    onClick={() => { onCallCrew(c.id, { id: null, name: event.title }, event.id); setCalled(true); setPickingCrew(false); }}
                    style={{ padding: "7px 10px", fontSize: 11.5, textAlign: "left" }}
                  >
                    {c.name}
                  </Button>
                ))}
              </div>
            ) : (
              <Button
                variant="ghost"
                onClick={() =>
                  crews.length === 1
                    ? (onCallCrew(crews[0].id, { id: null, name: event.title }, event.id), setCalled(true))
                    : setPickingCrew(true)
                }
                style={{ padding: "7px 10px", fontSize: 11.5 }}
              >
                📣 call the crew to check interest
              </Button>
            )
          )}
        </div>
      )}
    </div>
  );
}

function BottomNav({ view, onNavigate }) {
  const items = [
    { id: "feed", label: "Feed", emoji: "🌆" },
    { id: "checkin", label: "Check in", emoji: "➕" },
    { id: "crew", label: "Crew", emoji: "👥" },
    { id: "friends", label: "Friends", emoji: "👋" },
    { id: "you", label: "You", emoji: "🏆" },
  ];
  return (
    <div style={{ display: "flex", borderTop: `1px solid ${colors.line}`, background: colors.surface }}>
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => onNavigate(it.id)}
          style={{
            flex: 1,
            padding: "12px 0 14px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontFamily: bodyFont,
            fontSize: 11,
            fontWeight: 700,
            color: view === it.id ? "#FF3D9A" : colors.textMuted,
          }}
        >
          <div style={{ fontSize: 16, marginBottom: 2 }}>{it.emoji}</div>
          {it.label}
        </button>
      ))}
    </div>
  );
}

function CrewScreen({ crews, checkins, tonightCrew, setTonightCrew, onCreateCrew, onLeaveCrew, onSearchProfiles, onAddCrewMember, myId }) {
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState([]);
  const [notifStatus, setNotifStatus] = useState(
    "Notification" in window ? Notification.permission : "unsupported"
  );
  const [notifBusy, setNotifBusy] = useState(false);
  const [notifError, setNotifError] = useState(null);

  const enableNotifications = async () => {
    setNotifBusy(true);
    setNotifError(null);
    try {
      await subscribeToPush(supabase, myId);
      setNotifStatus("granted");
    } catch (e) {
      setNotifStatus("Notification" in window ? Notification.permission : "unsupported");
      setNotifError(e.message === "permission-denied" ? "notifications blocked — enable them in your browser/phone settings" : "couldn't turn on notifications — try again");
    } finally {
      setNotifBusy(false);
    }
  };

  const selected = crews.find((c) => c.id === selectedId);

  useEffect(() => {
    if (!selected) return;
    const timer = setTimeout(async () => {
      const results = await onSearchProfiles(memberQuery);
      const existingIds = new Set((selected.crew_members || []).map((m) => m.user_id));
      setMemberResults(results.filter((r) => !existingIds.has(r.id)));
    }, 400);
    return () => clearTimeout(timer);
  }, [memberQuery, selected, onSearchProfiles]);

  if (creating) {
    return (
      <div style={{ padding: "18px 0" }}>
        <div style={{ fontFamily: displayFont, fontWeight: 700, fontSize: 20, color: colors.text, marginBottom: 14 }}>
          name your crew
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Friday Night Crew"
          style={{
            width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${colors.line}`,
            background: colors.surface, color: colors.text, fontFamily: bodyFont, fontSize: 14,
            marginBottom: 14, boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: 10 }}>
          <Button variant="ghost" onClick={() => { setCreating(false); setName(""); }} style={{ flex: 1 }}>cancel</Button>
          <Button
            disabled={!name.trim()}
            onClick={() => { onCreateCrew(name.trim()); setCreating(false); setName(""); }}
            style={{ flex: 2 }}
          >
            create crew
          </Button>
        </div>
      </div>
    );
  }

  if (selected) {
    const members = selected.crew_members || [];
    const memberStatus = members.map((m) => {
      const activeCheckin = checkins.find((c) => c.crew_id === selected.id && c.user_id === m.user_id);
      return { ...m, checkedIn: !!activeCheckin, checkin: activeCheckin };
    });
    const allCheckedIn = memberStatus.length > 0 && memberStatus.every((m) => m.checkedIn);
    const inviteLink = `${window.location.origin}${window.location.pathname}?crew=${selected.id}`;
    const isTonight = tonightCrew && tonightCrew.id === selected.id;

    const shareInvite = async () => {
      if (navigator.share) {
        try {
          await navigator.share({ title: `Join ${selected.name} on NIGHTLY`, url: inviteLink });
        } catch (e) {}
      } else {
        await navigator.clipboard.writeText(inviteLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    };

    return (
      <div style={{ padding: "18px 0" }}>
        <button onClick={() => setSelectedId(null)} style={{ background: "none", border: "none", color: colors.textMuted, fontFamily: monoFont, fontSize: 11, cursor: "pointer", padding: 0, marginBottom: 14 }}>
          ← all crews
        </button>

        <div style={{ fontFamily: displayFont, fontWeight: 700, fontSize: 20, color: colors.text, marginBottom: 4 }}>
          {selected.name}
        </div>

        {allCheckedIn && (
          <div style={{ fontFamily: bodyFont, fontSize: 12.5, color: "#FF3D9A", fontWeight: 700, marginBottom: 12 }}>
            🎉 everyone's checked in!
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          {memberStatus.map((m) => (
            <div key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: `1px solid ${colors.line}` }}>
              <span style={{ fontSize: 14 }}>{m.checkedIn ? "✅" : "⭕"}</span>
              <span style={{ fontFamily: bodyFont, fontSize: 13, color: colors.text, fontWeight: 600 }}>{m.user_name}</span>
              {m.checkedIn && (
                <span style={{ fontFamily: bodyFont, fontSize: 11, color: colors.textMuted }}>
                  — {VIBES[m.checkin.vibe].emoji} checked in
                </span>
              )}
            </div>
          ))}
        </div>

        <div style={{ fontFamily: monoFont, fontSize: 10, letterSpacing: "0.08em", color: colors.textMuted, textTransform: "uppercase", marginBottom: 8 }}>
          add a member
        </div>
        <input
          value={memberQuery}
          onChange={(e) => setMemberQuery(e.target.value)}
          placeholder="search, or browse everyone on NIGHTLY..."
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: `1px solid ${colors.line}`,
            background: colors.surface,
            color: colors.text,
            fontFamily: bodyFont,
            fontSize: 13,
            boxSizing: "border-box",
            marginBottom: 8,
          }}
        />
        {memberResults.length > 0 && (
          <div style={{ background: colors.surfaceRaised, border: `1px solid ${colors.line}`, borderRadius: 9, marginBottom: 16, overflow: "hidden", maxHeight: 180, overflowY: "auto" }}>
            {memberResults.map((r) => (
              <div
                key={r.id}
                onClick={() => { onAddCrewMember(selected.id, r.id, r.name); setMemberQuery(""); }}
                style={{ padding: "9px 12px", fontSize: 12.5, color: colors.text, cursor: "pointer", borderBottom: `1px solid ${colors.line}`, display: "flex", justifyContent: "space-between" }}
              >
                <span>{r.name}</span>
                <span style={{ color: "#FF3D9A", fontWeight: 700 }}>+ add</span>
              </div>
            ))}
          </div>
        )}

        <Button
          onClick={() => setTonightCrew(isTonight ? null : { id: selected.id, name: selected.name })}
          style={{ width: "100%", marginBottom: 10 }}
        >
          {isTonight ? "✓ set as tonight's crew" : "use this crew tonight"}
        </Button>
        <Button variant="ghost" onClick={shareInvite} style={{ width: "100%", marginBottom: 10 }}>
          {copied ? "link copied ✓" : "invite someone to this crew"}
        </Button>
        <Button variant="danger" onClick={() => { onLeaveCrew(selected.id); setSelectedId(null); }} style={{ width: "100%" }}>
          leave crew
        </Button>
      </div>
    );
  }

  return (
    <div style={{ padding: "18px 0" }}>
      <div style={{ fontFamily: displayFont, fontWeight: 700, fontSize: 20, color: colors.text, marginBottom: 4 }}>
        your crews
      </div>
      <div style={{ fontFamily: bodyFont, fontSize: 12, color: colors.textMuted, marginBottom: 16, lineHeight: 1.4 }}>
        build a crew for tonight, save it, and check in together.
      </div>

      {notifStatus !== "granted" && notifStatus !== "unsupported" && (
        <div style={{ background: colors.surface, border: `1px solid ${colors.line}`, borderRadius: 14, padding: 14, marginBottom: 16 }}>
          <div style={{ fontFamily: bodyFont, fontWeight: 700, fontSize: 13, color: colors.text, marginBottom: 4 }}>
            🔔 don't miss a call
          </div>
          <div style={{ fontFamily: bodyFont, fontSize: 12, color: colors.textMuted, marginBottom: 10, lineHeight: 1.4 }}>
            turn on notifications so you know the moment someone calls the crew — even with the app closed.
          </div>
          {notifError && (
            <div style={{ fontFamily: bodyFont, fontSize: 11, color: colors.danger, marginBottom: 8 }}>{notifError}</div>
          )}
          <Button onClick={enableNotifications} disabled={notifBusy} style={{ width: "100%" }}>
            {notifBusy ? "turning on…" : "turn on notifications"}
          </Button>
        </div>
      )}

      {crews.length === 0 && (
        <div style={{ fontFamily: bodyFont, fontSize: 12.5, color: colors.textMuted, marginBottom: 16 }}>
          no crews yet — create one below.
        </div>
      )}

      {crews.map((c) => {
        const memberCount = (c.crew_members || []).length;
        const isTonight = tonightCrew && tonightCrew.id === c.id;
        return (
          <button
            key={c.id}
            onClick={() => setSelectedId(c.id)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              background: colors.surface,
              border: `1px solid ${isTonight ? "#FF3D9A" : colors.line}`,
              borderRadius: 12,
              padding: 14,
              marginBottom: 10,
              cursor: "pointer",
            }}
          >
            <div style={{ fontFamily: bodyFont, fontWeight: 700, fontSize: 14, color: colors.text }}>
              {c.name} {isTonight && <span style={{ color: "#FF3D9A", fontSize: 11 }}>· tonight</span>}
            </div>
            <div style={{ fontFamily: bodyFont, fontSize: 11.5, color: colors.textMuted, marginTop: 2 }}>
              {memberCount} {memberCount === 1 ? "member" : "members"}
            </div>
          </button>
        );
      })}

      <Button onClick={() => setCreating(true)} style={{ width: "100%", marginTop: 6 }}>
        + create a crew
      </Button>
    </div>
  );
}

function FriendsScreen({ myId, friends, onSearchProfiles, onAddFriend, onRemoveFriend }) {
  const [copied, setCopied] = useState(false);
  const [friendQuery, setFriendQuery] = useState("");
  const [friendResults, setFriendResults] = useState([]);

  const inviteLink = `${window.location.origin}${window.location.pathname}?invite=${myId}`;

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join me on NIGHTLY", url: inviteLink });
      } catch (e) {
        // user cancelled the share sheet — nothing to do
      }
    } else {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  useEffect(() => {
    const timer = setTimeout(async () => {
      const results = await onSearchProfiles(friendQuery);
      const friendIds = new Set(friends.map((f) => f.id));
      setFriendResults(results.filter((r) => !friendIds.has(r.id)));
    }, 400);
    return () => clearTimeout(timer);
  }, [friendQuery, friends, onSearchProfiles]);

  return (
    <div style={{ padding: "20px 0 20px" }}>
      <div
        style={{
          background: "linear-gradient(135deg, #2e1424, #14282e)",
          border: "1px solid #FF3D9A44",
          borderRadius: 16,
          padding: 16,
          marginBottom: 20,
        }}
      >
        <div style={{ fontFamily: displayFont, fontWeight: 700, fontSize: 15, color: colors.text, marginBottom: 4 }}>
          bring your crew 🎉
        </div>
        <div style={{ fontFamily: bodyFont, fontSize: 12, color: colors.textMuted, marginBottom: 12, lineHeight: 1.4 }}>
          share your link — anyone who joins through it is automatically your friend on NIGHTLY.
        </div>
        <Button onClick={shareLink} style={{ width: "100%" }}>
          {copied ? "link copied ✓" : "share my invite link"}
        </Button>
      </div>

      <div style={{ fontFamily: monoFont, fontSize: 10, letterSpacing: "0.08em", color: colors.textMuted, textTransform: "uppercase", marginBottom: 8 }}>
        my friends
      </div>
      <input
        value={friendQuery}
        onChange={(e) => setFriendQuery(e.target.value)}
        placeholder="search, or browse everyone on NIGHTLY..."
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 10,
          border: `1px solid ${colors.line}`,
          background: colors.surface,
          color: colors.text,
          fontFamily: bodyFont,
          fontSize: 13,
          boxSizing: "border-box",
          marginBottom: 8,
        }}
      />
      {friendResults.length > 0 && (
        <div style={{ background: colors.surfaceRaised, border: `1px solid ${colors.line}`, borderRadius: 9, marginBottom: 14, overflow: "hidden", maxHeight: 200, overflowY: "auto" }}>
          {friendResults.map((r) => (
            <div
              key={r.id}
              onClick={() => { onAddFriend(r.id); setFriendQuery(""); }}
              style={{ padding: "9px 12px", fontSize: 12.5, color: colors.text, cursor: "pointer", borderBottom: `1px solid ${colors.line}`, display: "flex", justifyContent: "space-between" }}
            >
              <span>{r.name}</span>
              <span style={{ color: "#FF3D9A", fontWeight: 700 }}>+ add</span>
            </div>
          ))}
        </div>
      )}

      {friends.length === 0 ? (
        <div style={{ fontFamily: bodyFont, fontSize: 12, color: colors.textMuted, marginBottom: 20 }}>
          no friends added yet — search a name above, or share your invite link.
        </div>
      ) : (
        <div>
          {friends.map((f) => (
            <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${colors.line}` }}>
              <span style={{ fontFamily: bodyFont, fontSize: 13, color: colors.text, fontWeight: 600 }}>👋 {f.name}</span>
              <button
                onClick={() => onRemoveFriend(f.id)}
                style={{ background: "none", border: "none", color: colors.textMuted, fontFamily: monoFont, fontSize: 10, cursor: "pointer" }}
              >
                remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AccountCard({ userEmail, onSaveAccount, onLogout }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSaveAccount(email.trim());
      setSent(true);
    } catch (e) {
      setError("Couldn't save that — try again.");
    } finally {
      setBusy(false);
    }
  };

  if (userEmail) {
    return (
      <div style={{ background: colors.surface, border: `1px solid ${colors.line}`, borderRadius: 14, padding: 14, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ fontFamily: bodyFont, fontSize: 12.5, color: colors.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          ✉️ signed in as <strong>{userEmail}</strong>
        </div>
        <Button variant="ghost" onClick={onLogout} style={{ padding: "7px 12px", fontSize: 11.5, flexShrink: 0 }}>
          log out
        </Button>
      </div>
    );
  }

  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.line}`, borderRadius: 14, padding: 14, marginBottom: 20 }}>
      <div style={{ fontFamily: bodyFont, fontWeight: 700, fontSize: 13, color: colors.text, marginBottom: 4 }}>
        💾 save your account
      </div>
      {sent ? (
        <div style={{ fontFamily: bodyFont, fontSize: 12, color: colors.textMuted, lineHeight: 1.4 }}>
          ✉️ check <strong style={{ color: colors.text }}>{email.trim()}</strong> for a confirmation link.
        </div>
      ) : (
        <>
          <div style={{ fontFamily: bodyFont, fontSize: 12, color: colors.textMuted, marginBottom: 10, lineHeight: 1.4 }}>
            add an email so you can get back into this exact account — same badges, friends, and crews — on another device.
          </div>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            type="email"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 9, border: `1px solid ${colors.line}`, background: colors.bg, color: colors.text, fontFamily: bodyFont, fontSize: 13, boxSizing: "border-box", marginBottom: 8 }}
          />
          {error && <div style={{ fontFamily: bodyFont, fontSize: 11, color: colors.danger, marginBottom: 8 }}>{error}</div>}
          <Button onClick={submit} disabled={!email.trim() || busy} style={{ width: "100%" }}>
            {busy ? "sending…" : "send confirmation link"}
          </Button>
        </>
      )}
    </div>
  );
}

function InstallCard({ installed, canInstall, isIOS, onInstall }) {
  const [showIOSSteps, setShowIOSSteps] = useState(false);

  if (installed || (!canInstall && !isIOS)) return null;

  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.line}`, borderRadius: 14, padding: 14, marginBottom: 20 }}>
      <div style={{ fontFamily: bodyFont, fontWeight: 700, fontSize: 13, color: colors.text, marginBottom: 4 }}>
        📲 install NIGHTLY
      </div>
      <div style={{ fontFamily: bodyFont, fontSize: 12, color: colors.textMuted, marginBottom: 10, lineHeight: 1.4 }}>
        add it to your home screen — a real app icon, full-screen, and crew-call notifications.
      </div>
      {showIOSSteps ? (
        <div style={{ fontFamily: bodyFont, fontSize: 12, color: colors.text, lineHeight: 1.6 }}>
          tap <strong>share</strong> ⬆️ in Safari, then <strong>"add to home screen."</strong>
        </div>
      ) : (
        <Button onClick={canInstall ? onInstall : () => setShowIOSSteps(true)} style={{ width: "100%" }}>
          install app
        </Button>
      )}
    </div>
  );
}

function BadgesScreen({ stats, userEmail, onSaveAccount, onLogout, installed, canInstall, isIOS, onInstall }) {
  const unlocked = BADGES.filter((b) => stats[b.statKey] >= b.target);
  const locked = BADGES.filter((b) => stats[b.statKey] < b.target);
  const nextBadge = locked.reduce(
    (best, b) => (best == null || stats[b.statKey] / b.target > stats[best.statKey] / best.target ? b : best),
    null
  );

  return (
    <div style={{ padding: "20px 0 20px" }}>
      <AccountCard userEmail={userEmail} onSaveAccount={onSaveAccount} onLogout={onLogout} />
      <InstallCard installed={installed} canInstall={canInstall} isIOS={isIOS} onInstall={onInstall} />

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <div style={{ flex: 1, background: colors.surface, borderRadius: 14, padding: 14, textAlign: "center" }}>
          <div style={{ fontFamily: displayFont, fontWeight: 700, fontSize: 24, color: "#FF3D9A" }}>{stats.checkinCount}</div>
          <div style={{ fontFamily: bodyFont, fontSize: 10.5, color: colors.textMuted, fontWeight: 600 }}>check-ins</div>
        </div>
        <div style={{ flex: 1, background: colors.surface, borderRadius: 14, padding: 14, textAlign: "center" }}>
          <div style={{ fontFamily: displayFont, fontWeight: 700, fontSize: 24, color: "#34E4EA" }}>{stats.venueCount}</div>
          <div style={{ fontFamily: bodyFont, fontSize: 10.5, color: colors.textMuted, fontWeight: 600 }}>venues</div>
        </div>
        <div style={{ flex: 1, background: colors.surface, borderRadius: 14, padding: 14, textAlign: "center" }}>
          <div style={{ fontFamily: displayFont, fontWeight: 700, fontSize: 24, color: "#FFC24B" }}>{stats.friendCount}</div>
          <div style={{ fontFamily: bodyFont, fontSize: 10.5, color: colors.textMuted, fontWeight: 600 }}>friends</div>
        </div>
      </div>

      {nextBadge && (
        <div style={{ background: "linear-gradient(135deg, #2e1424, #14282e)", border: "1px solid #FF3D9A44", borderRadius: 14, padding: 14, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontFamily: bodyFont, fontWeight: 700, fontSize: 13, color: colors.text }}>
              {nextBadge.emoji} next up: {nextBadge.label}
            </span>
            <span style={{ fontFamily: monoFont, fontSize: 11, color: "#FF3D9A", fontWeight: 700 }}>
              {stats[nextBadge.statKey]}/{nextBadge.target}
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 6, background: colors.bg, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, (stats[nextBadge.statKey] / nextBadge.target) * 100)}%`,
                background: "linear-gradient(90deg, #FF3D9A, #7C4DFF)",
                borderRadius: 6,
                transition: "width 0.4s ease",
              }}
            />
          </div>
          <div style={{ fontFamily: bodyFont, fontSize: 11, color: colors.textMuted, marginTop: 6 }}>
            {nextBadge.target - stats[nextBadge.statKey]} more {statNoun(nextBadge.statKey, nextBadge.target - stats[nextBadge.statKey])} to unlock
          </div>
        </div>
      )}

      <div style={{ fontFamily: monoFont, fontSize: 10, letterSpacing: "0.08em", color: colors.textMuted, textTransform: "uppercase", marginBottom: 10 }}>
        badges earned
      </div>
      {unlocked.length === 0 && (
        <div style={{ fontFamily: bodyFont, fontSize: 12.5, color: colors.textMuted, marginBottom: 16 }}>
          none yet — check in somewhere to start earning badges 🎉
        </div>
      )}
      {unlocked.map((b) => (
        <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "linear-gradient(135deg, #2e1424, #1A1226)", border: "1px solid #FF3D9A66", borderRadius: 14, padding: 12, marginBottom: 8, boxShadow: "0 0 20px -8px #FF3D9A66" }}>
          <div style={{ fontSize: 26 }}>{b.emoji}</div>
          <div>
            <div style={{ fontFamily: bodyFont, fontWeight: 700, fontSize: 13.5, color: colors.text }}>{b.label}</div>
            <div style={{ fontFamily: bodyFont, fontSize: 11, color: colors.textMuted }}>{b.desc}</div>
          </div>
        </div>
      ))}

      {locked.length > 0 && (
        <>
          <div style={{ fontFamily: monoFont, fontSize: 10, letterSpacing: "0.08em", color: colors.textMuted, textTransform: "uppercase", margin: "16px 0 10px" }}>
            still locked
          </div>
          {locked.map((b) => (
            <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 12, background: colors.surface, border: `1px solid ${colors.line}`, borderRadius: 14, padding: 12, marginBottom: 8, opacity: 0.6 }}>
              <div style={{ fontSize: 26, filter: "grayscale(1)" }}>{b.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: bodyFont, fontWeight: 700, fontSize: 13.5, color: colors.text }}>{b.label}</div>
                <div style={{ fontFamily: bodyFont, fontSize: 11, color: colors.textMuted, marginBottom: 6 }}>{b.desc}</div>
                <div style={{ height: 5, borderRadius: 4, background: colors.bg, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min(100, (stats[b.statKey] / b.target) * 100)}%`,
                      background: colors.textMuted,
                      borderRadius: 4,
                      transition: "width 0.4s ease",
                    }}
                  />
                </div>
                <div style={{ fontFamily: monoFont, fontSize: 9.5, color: colors.textMuted, marginTop: 3 }}>
                  {stats[b.statKey]}/{b.target}
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function FeedScreen({ groups, venues, favoriteIds, onToggleFavorite, friendIds, crews, onCallCrew, crewCalls, myName, myId, onCheckOut, onCheckInHere, onUpdateVibe, onStartCheckinAt, reactionsByCheckin, onToggleReaction }) {
  const [query, setQuery] = useState("");
  const [osmResults, setOsmResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [sortMode, setSortMode] = useState("closest");
  const [spotlightId, setSpotlightId] = useState(null);
  const [busyOnly, setBusyOnly] = useState(false);
  const [openLateOnly, setOpenLateOnly] = useState(false);
  const [events, setEvents] = useState([]);
  const [eventsStatus, setEventsStatus] = useState("idle");
  const [eventsRetryCount, setEventsRetryCount] = useState(0);
  const [discoveryVenues, setDiscoveryVenues] = useState([]);
  const [discoveryStatus, setDiscoveryStatus] = useState("idle");
  const [discoveryRetryCount, setDiscoveryRetryCount] = useState(0);
  const geo = useGeolocation();

  useEffect(() => {
    geo.request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nearby events (concerts/festivals/community/shows) via a PredictHQ-backed
  // Edge Function, same "device location in, results out" shape as the
  // near-you venue list on the check-in tab.
  useEffect(() => {
    if (geo.status !== "granted" || !geo.coords) return;
    let cancelled = false;
    setEventsStatus("loading");
    supabase.functions
      .invoke("nearby-events", { body: { lat: geo.coords.lat, lng: geo.coords.lng } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) throw error;
        setEvents(data.events || []);
        setEventsStatus(data.events?.length > 0 ? "done" : "empty");
      })
      .catch(() => {
        if (!cancelled) setEventsStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [geo.status, geo.coords, eventsRetryCount]);

  // Nearby bars/pubs/clubs via the same Geoapify-backed Edge Function used on the
  // check-in tab's "near you" list — lets the feed surface real nearby venues even
  // before anyone's checked in, instead of only ones that already have activity.
  useEffect(() => {
    if (geo.status !== "granted" || !geo.coords) return;
    let cancelled = false;
    setDiscoveryStatus("loading");
    supabase.functions
      .invoke("nearby-venues", { body: { lat: geo.coords.lat, lng: geo.coords.lng } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) throw error;
        setDiscoveryVenues(data.venues || []);
        setDiscoveryStatus(data.venues?.length > 0 ? "done" : "empty");
      })
      .catch(() => {
        if (!cancelled) setDiscoveryStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [geo.status, geo.coords, discoveryRetryCount]);

  // Who's interested in which nearby event — loaded for whatever's currently
  // fetched, kept as a simple map so both the event cards and the crew-call
  // banner below can read/update the same counts.
  const [interestByEvent, setInterestByEvent] = useState({});

  useEffect(() => {
    if (events.length === 0) return;
    let cancelled = false;
    supabase
      .from("event_interest")
      .select("event_id, user_id")
      .in("event_id", events.map((e) => e.id))
      .then(({ data }) => {
        if (cancelled || !data) return;
        const map = {};
        data.forEach((row) => {
          if (!map[row.event_id]) map[row.event_id] = { count: 0, mine: false };
          map[row.event_id].count += 1;
          if (row.user_id === myId) map[row.event_id].mine = true;
        });
        setInterestByEvent(map);
      });
    return () => {
      cancelled = true;
    };
  }, [events, myId]);

  const toggleInterest = async (eventId, eventTitle) => {
    const current = interestByEvent[eventId] || { count: 0, mine: false };
    if (current.mine) {
      await supabase.from("event_interest").delete().eq("event_id", eventId).eq("user_id", myId);
      setInterestByEvent((m) => ({ ...m, [eventId]: { count: Math.max(0, current.count - 1), mine: false } }));
    } else {
      await supabase.from("event_interest").insert({ event_id: eventId, event_title: eventTitle, user_id: myId, user_name: myName });
      setInterestByEvent((m) => ({ ...m, [eventId]: { count: current.count + 1, mine: true } }));
    }
  };

  // Distance-to-me, shared by venues and events below — null (rather than Infinity)
  // when either point is unknown, so "closest" sort can push it to the bottom
  // instead of pretending it's right next to you.
  const distanceTo = (lat, lng) =>
    geo.coords && lat != null && lng != null ? distanceMeters(geo.coords.lat, geo.coords.lng, lat, lng) : null;

  const favoriteGroups = Array.from(favoriteIds)
    .map((venueId) => {
      const existing = groups.find((g) => g.venue.id === venueId);
      if (existing) return existing;
      const venue = venues[venueId];
      return venue ? { venue, checkins: [] } : null;
    })
    .filter(Boolean)
    .map((g) => ({ ...g, distance: distanceTo(g.venue.lat, g.venue.lng) }));

  // A venue someone's already checked into (real row in our `venues` table, sourced
  // from OSM at check-in time) is always the authoritative version of that place —
  // Geoapify's nearby list is only used to fill in gaps for places nobody's checked
  // into yet, so the same physical venue should never show up as two cards.
  const norm = (s) => (s || "").toLowerCase().trim();
  const isSameVenue = (a, b) => {
    if (norm(a.name) !== norm(b.name)) return false;
    if (a.lat == null || b.lat == null) return true;
    return distanceMeters(a.lat, a.lng, b.lat, b.lng) < 150;
  };

  const nonFavoriteVenueGroups = groups
    .filter((g) => !favoriteIds.has(g.venue.id))
    .map((g) => ({ ...g, distance: distanceTo(g.venue.lat, g.venue.lng) }));

  const discoveryGroups = discoveryVenues
    .filter((v) => !groups.some((g) => isSameVenue(g.venue, v)))
    .map((v) => ({
      venue: { name: v.name, lat: v.lat, lng: v.lng, osm_website: v.website },
      checkins: [],
      distance: distanceTo(v.lat, v.lng),
    }));

  const venueItems = [...nonFavoriteVenueGroups, ...discoveryGroups].map((g) => ({
    type: "venue",
    key: g.venue.id || `discovery:${norm(g.venue.name)}:${g.venue.lat},${g.venue.lng}`,
    distance: g.distance,
    trendingScore: g.checkins.length,
    recencyScore: g.checkins.length > 0 ? Math.max(...g.checkins.map((c) => new Date(c.created_at).getTime())) : 0,
    matchesQuery: !query.trim() || g.venue.name.toLowerCase().includes(query.trim().toLowerCase()),
    // Busy/open-late are venue-only concepts — a venue fails the filter (rather
    // than being exempt) when it doesn't meet it, same as before this change.
    passesFilters: (!busyOnly || g.checkins.length >= 3) && (!openLateOnly || isOpenLate(g.venue.opening_hours)),
    group: g,
  }));

  const eventItems = events.map((e) => ({
    type: "event",
    key: e.id,
    distance: distanceTo(e.lat, e.lng),
    trendingScore: interestByEvent[e.id]?.count || 0,
    recencyScore: -new Date(e.start).getTime(), // soonest-starting reads as "newest" for an event
    matchesQuery: !query.trim() || e.title.toLowerCase().includes(query.trim().toLowerCase()),
    passesFilters: !busyOnly && !openLateOnly,
    event: e,
  }));

  const feedItems = [...venueItems, ...eventItems].filter((i) => i.matchesQuery && i.passesFilters);

  feedItems.sort((a, b) => {
    if (sortMode === "trending") return b.trendingScore - a.trendingScore;
    if (sortMode === "newest") return b.recencyScore - a.recencyScore;
    // closest — items with no known distance (location off, or no coords from
    // the source) sink to the bottom rather than vanishing.
    if (a.distance == null && b.distance == null) return 0;
    if (a.distance == null) return 1;
    if (b.distance == null) return -1;
    return a.distance - b.distance;
  });

  const spotlightGroup = spotlightId ? groups.find((g) => g.venue.id === spotlightId) : null;

  const surpriseMe = () => {
    if (groups.length === 0) return;
    const topPool = groups.slice(0, Math.max(3, Math.ceil(groups.length / 2)));
    const pick = topPool[Math.floor(Math.random() * topPool.length)];
    setSpotlightId(pick.venue.id);
  };

  useEffect(() => {
    if (feedItems.length > 0 || query.trim().length < 3) {
      setOsmResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=4&q=${encodeURIComponent(query)}`
        );
        const data = await res.json();
        setOsmResults(data);
      } catch (e) {
        setOsmResults([]);
      } finally {
        setSearching(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [query, feedItems.length]);

  return (
    <div>
      {crewCalls && crewCalls.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          {crewCalls.map((call) => {
            const crewName = (crews.find((c) => c.id === call.crew_id) || {}).name || "your crew";
            const isEventCall = !call.venue_id && call.event_id;
            return (
              <div
                key={call.id}
                style={{
                  background: "linear-gradient(135deg, #2e1424, #14282e)",
                  border: "1px solid #FF3D9A88",
                  borderRadius: 14,
                  padding: 13,
                  marginBottom: 8,
                }}
              >
                <div style={{ fontFamily: bodyFont, fontSize: 13, color: colors.text, marginBottom: 8, lineHeight: 1.4 }}>
                  📣 <strong>{call.from_user_name}</strong> is calling on <strong>{crewName}</strong>{" "}
                  {isEventCall ? (
                    <>
                      to check interest in <strong>{call.venue_name}</strong>
                    </>
                  ) : (
                    <>
                      to go to <strong>{call.venue_name}</strong>
                    </>
                  )}
                </div>
                {isEventCall ? (
                  <Button
                    onClick={() => toggleInterest(call.event_id, call.venue_name)}
                    style={{ padding: "8px 14px", fontSize: 12 }}
                  >
                    🙋 I'm interested too
                  </Button>
                ) : (
                  <Button
                    onClick={() =>
                      onCheckInHere({ id: call.venue_id, name: call.venue_name, lat: null, lng: null, osm_website: null })
                    }
                    style={{ padding: "8px 14px", fontSize: 12 }}
                  >
                    check in here too
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {groups.length > 0 && (
        <Button
          onClick={surpriseMe}
          style={{ width: "100%", marginBottom: 12, background: "linear-gradient(90deg, #FF3D9A, #7C4DFF)" }}
        >
          🎲 surprise me — where should I go?
        </Button>
      )}

      {spotlightGroup && (
        <div
          style={{
            background: "linear-gradient(135deg, #2e1424, #14282e)",
            border: "1px solid #FF3D9A66",
            borderRadius: 16,
            padding: 14,
            marginBottom: 14,
            boxShadow: "0 0 24px -6px #FF3D9A88",
          }}
        >
          <div style={{ fontFamily: monoFont, fontSize: 9, letterSpacing: "0.08em", color: "#FF3D9A", textTransform: "uppercase", marginBottom: 4, fontWeight: 700 }}>
            tonight's pick ✨
          </div>
          <div style={{ fontFamily: displayFont, fontWeight: 700, fontSize: 16, color: colors.text, marginBottom: 8 }}>
            {spotlightGroup.venue.name}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={() => onCheckInHere(spotlightGroup.venue)} style={{ flex: 1, padding: "9px 0", fontSize: 12 }}>
              check in here
            </Button>
            <Button variant="ghost" onClick={() => setSpotlightId(null)} style={{ padding: "9px 12px", fontSize: 12 }}>
              dismiss
            </Button>
          </div>
        </div>
      )}

      {(geo.status === "idle" || geo.status === "loading") && (
        <div style={{ fontFamily: bodyFont, fontSize: 12, color: colors.textMuted, marginBottom: 14 }}>
          📍 finding what's near you…
        </div>
      )}
      {(geo.status === "denied" || geo.status === "unavailable" || geo.status === "unsupported") && (
        <div style={{ fontFamily: bodyFont, fontSize: 12, color: colors.textMuted, marginBottom: 14, lineHeight: 1.4 }}>
          📍 location's off — showing venues with activity only. turn it on for the full near-me feed.
        </div>
      )}
      {geo.status === "granted" && (discoveryStatus === "error" || eventsStatus === "error") && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: bodyFont, fontSize: 12, color: colors.textMuted, marginBottom: 14 }}>
          <span>couldn't load everything nearby.</span>
          <button
            onClick={() => { setDiscoveryRetryCount((c) => c + 1); setEventsRetryCount((c) => c + 1); }}
            style={{ background: "none", border: "none", color: "#34E4EA", fontSize: 11, fontFamily: bodyFont, cursor: "pointer", fontWeight: 700, padding: 0, marginLeft: 8, flexShrink: 0 }}
          >
            retry
          </button>
        </div>
      )}

      {favoriteGroups.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: monoFont, fontSize: 10, letterSpacing: "0.08em", color: colors.textMuted, textTransform: "uppercase", marginBottom: 8 }}>
            ⭐ your favourites
          </div>
          {favoriteGroups.map((g) => (
            <VenueCard
              key={g.venue.id}
              group={g}
              myName={myName}
              myId={myId}
              onCheckOut={onCheckOut}
              onCheckInHere={onCheckInHere}
              onUpdateVibe={onUpdateVibe}
              isFavorite={true}
              onToggleFavorite={onToggleFavorite}
              friendIds={friendIds}
              crews={crews}
              onCallCrew={onCallCrew}
              distance={g.distance}
              reactionsByCheckin={reactionsByCheckin}
              onToggleReaction={onToggleReaction}
            />
          ))}
        </div>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="thinking about somewhere? search it..."
        style={{
          width: "100%",
          padding: "11px 13px",
          borderRadius: 12,
          border: `1px solid ${colors.line}`,
          background: colors.surface,
          color: colors.text,
          fontFamily: bodyFont,
          fontSize: 13,
          marginBottom: 10,
          boxSizing: "border-box",
        }}
      />

      {(groups.length > 0 || discoveryVenues.length > 0 || events.length > 0) && (
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {[
            { id: "closest", label: "📍 Closest" },
            { id: "trending", label: "🔥 Trending" },
            { id: "newest", label: "🆕 Newest" },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => setSortMode(s.id)}
              style={{
                flex: 1,
                padding: "8px 0",
                borderRadius: 10,
                border: `1px solid ${sortMode === s.id ? "#FF3D9A" : colors.line}`,
                background: sortMode === s.id ? "#FF3D9A22" : "transparent",
                color: sortMode === s.id ? "#FF3D9A" : colors.textMuted,
                fontFamily: bodyFont,
                fontSize: 11.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {(groups.length > 0 || discoveryVenues.length > 0) && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {[
            { key: "busy", label: "👥 Busy (3+)", active: busyOnly, toggle: () => setBusyOnly((b) => !b) },
            { key: "late", label: "🌃 Open late", active: openLateOnly, toggle: () => setOpenLateOnly((o) => !o) },
          ].map((f) => (
            <button
              key={f.key}
              onClick={f.toggle}
              style={{
                flex: 1,
                padding: "7px 0",
                borderRadius: 10,
                border: `1px solid ${f.active ? "#34E4EA" : colors.line}`,
                background: f.active ? "#34E4EA22" : "transparent",
                color: f.active ? "#34E4EA" : colors.textMuted,
                fontFamily: bodyFont,
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {query.trim() && feedItems.length > 0 && (
        <div style={{ fontFamily: bodyFont, fontSize: 11, color: "#34E4EA", fontWeight: 600, marginBottom: 8 }}>
          {feedItems.length} result{feedItems.length === 1 ? "" : "s"} matching "{query}"
        </div>
      )}

      {feedItems.length === 0 && query.trim() && osmResults.length === 0 && !searching && (
        <div style={{ fontFamily: bodyFont, fontSize: 12.5, color: colors.textMuted, marginBottom: 12 }}>
          nothing nearby matching that.
        </div>
      )}

      {feedItems.length === 0 && !query.trim() && geo.status !== "loading" && geo.status !== "idle" && (
        <div style={{ padding: "40px 4px", textAlign: "center", color: colors.textMuted, fontSize: 13, lineHeight: 1.5 }}>
          {geo.status === "granted"
            ? "nothing near you right now — be the first to check in."
            : "nobody's checked in yet. be the first — tap \"check in\" below."}
        </div>
      )}

      {osmResults.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: monoFont, fontSize: 10, letterSpacing: "0.08em", color: colors.textMuted, textTransform: "uppercase", marginBottom: 8 }}>
            nobody's there yet — be the first
          </div>
          {osmResults.map((r) => (
            <div
              key={r.place_id}
              style={{
                background: colors.surface,
                border: `1px solid ${colors.line}`,
                borderRadius: 12,
                padding: 12,
                marginBottom: 8,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div style={{ fontFamily: bodyFont, fontSize: 12.5, color: colors.text, flex: 1 }}>
                {r.display_name.split(",")[0]}
              </div>
              <Button onClick={() => onStartCheckinAt(r.display_name.split(",")[0])} style={{ padding: "7px 12px", fontSize: 11.5 }}>
                check in
              </Button>
            </div>
          ))}
        </div>
      )}

      <div style={{ paddingBottom: 20 }}>
        {feedItems.map((item) =>
          item.type === "venue" ? (
            <VenueCard
              key={item.key}
              group={item.group}
              myName={myName}
              myId={myId}
              onCheckOut={onCheckOut}
              onCheckInHere={onCheckInHere}
              onUpdateVibe={onUpdateVibe}
              isFavorite={false}
              onToggleFavorite={onToggleFavorite}
              friendIds={friendIds}
              crews={crews}
              onCallCrew={onCallCrew}
              distance={item.distance}
              reactionsByCheckin={reactionsByCheckin}
              onToggleReaction={onToggleReaction}
            />
          ) : (
            <EventCard
              key={item.key}
              event={item.event}
              interest={interestByEvent[item.event.id]}
              onToggleInterest={toggleInterest}
              onCheckInHere={onStartCheckinAt}
              crews={crews}
              onCallCrew={onCallCrew}
              distance={item.distance}
              fullWidth
            />
          )
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [checkins, setCheckins] = useState([]);
  const [reactionsByCheckin, setReactionsByCheckin] = useState({});
  const [venues, setVenues] = useState({});
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [crews, setCrews] = useState([]);
  const [friends, setFriends] = useState([]);
  const [crewCalls, setCrewCalls] = useState([]);
  const [tonightCrew, setTonightCrew] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settingUp, setSettingUp] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState("feed");
  const [stats, setStats] = useState({ checkinCount: 0, venueCount: 0, friendCount: 0 });
  const [prefillVenue, setPrefillVenue] = useState("");
  const [presetVenue, setPresetVenue] = useState(null);
  const [inviterName, setInviterName] = useState(null);
  const [installEvent, setInstallEvent] = useState(null);
  const [installed, setInstalled] = useState(() => isStandaloneDisplay());

  useEffect(() => {
    const init = async () => {
      try {
        const { data: existing } = await supabase.auth.getSession();
        let currentSession = existing.session;
        if (!currentSession) {
          // Zero-friction default: try the app without an account. "save your account" (You tab)
          // or the "already saved an account? sign in" link upgrades/replaces this later.
          const { data, error: authErr } = await supabase.auth.signInAnonymously();
          if (authErr) throw authErr;
          currentSession = data.session;
        }
        setSession(currentSession);
      } catch (e) {
        setError("Couldn't connect. Check your Supabase setup in .env");
        setLoading(false); // no session means the profile-sync effect below never runs, so nothing else will clear this
      }
    };
    init();

    // Catches every later auth change too — signing in via a magic link (new device, or
    // returning after "save your account"), linking an email to the current anonymous
    // account, and signing out. Keyed off this rather than only the one-time init() above
    // so the app actually reacts when the active account changes.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (newSession) {
        setSession(newSession);
      } else {
        // Signed out — fall back to a fresh anonymous session immediately rather than
        // leaving the app with no session at all (NameGate's guest flow needs one).
        supabase.auth.signInAnonymously().then(({ data }) => setSession(data.session));
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Looks up the name behind a ?invite= link so NameGate can greet a new arrival by
  // name ("Gary invited you to NIGHTLY") instead of the generic prompt. Read-only —
  // the actual friendship row is created in handleSetName once they pick a name.
  useEffect(() => {
    if (!session) return;
    const inviterId = new URLSearchParams(window.location.search).get("invite");
    if (!inviterId || inviterId === session.user.id) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("name")
      .eq("id", inviterId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setInviterName(data.name);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  // Captures the browser's native install prompt (Android/Chrome/Edge/desktop Chrome)
  // so the "install NIGHTLY" button on the You tab can trigger it on demand instead of
  // waiting for the browser's own address-bar icon. Safari (iOS/macOS) never fires this
  // event — InstallCard falls back to manual "Add to Home Screen" instructions there.
  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setInstallEvent(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!installEvent) return;
    installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setInstallEvent(null);
  };

  // Keeps profile in sync with whichever account is currently active, and handles pending
  // invite links once a profile exists — runs on the first sign-in and again any time the
  // active user actually changes (not on routine token refreshes, hence keying off the id).
  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: profileRow } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
      if (cancelled) return;
      setProfile(profileRow || null);
      setLoading(false);

      if (profileRow) {
        try {
          const params = new URLSearchParams(window.location.search);
          const inviterId = params.get("invite");
          const crewInviteId = params.get("crew");
          if (inviterId && inviterId !== session.user.id) {
            await supabase.from("friendships").insert({ user_id_a: session.user.id, user_id_b: inviterId });
          }
          if (crewInviteId) {
            await supabase.from("crew_members").insert({ crew_id: crewInviteId, user_id: session.user.id, user_name: profileRow.name });
          }
          if (inviterId || crewInviteId) window.history.replaceState({}, "", window.location.pathname);
        } catch (e) {
          // Non-fatal — duplicate friendship/crew membership is fine to ignore
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const loadData = useCallback(async () => {
    const nowIso = new Date().toISOString();
    const { data: checkinData } = await supabase
      .from("checkins")
      .select("*")
      .eq("visibility", "shared")
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false });
    const { data: venueData } = await supabase.from("venues").select("*");
    const venueMap = {};
    (venueData || []).forEach((v) => (venueMap[v.id] = v));
    setVenues(venueMap);
    setCheckins(checkinData || []);
  }, []);

  // Small-scale app (see project-notes.md) — loads every reaction rather than
  // scoping the query to whatever check-ins happen to be on screen, same
  // simplicity tradeoff as loadData() loading all check-ins.
  const loadReactions = useCallback(async () => {
    const { data } = await supabase.from("checkin_reactions").select("checkin_id, user_id, emoji");
    const map = {};
    (data || []).forEach((row) => {
      if (!map[row.checkin_id]) map[row.checkin_id] = {};
      if (!map[row.checkin_id][row.emoji]) map[row.checkin_id][row.emoji] = { count: 0, mine: false };
      map[row.checkin_id][row.emoji].count += 1;
      if (row.user_id === session?.user?.id) map[row.checkin_id][row.emoji].mine = true;
    });
    setReactionsByCheckin(map);
  }, [session]);

  const loadFavorites = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase.from("favorites").select("venue_id").eq("user_id", session.user.id);
    setFavoriteIds(new Set((data || []).map((f) => f.venue_id)));
  }, [session]);

  const loadCrews = useCallback(async () => {
    if (!session) return;
    const { data: memberships } = await supabase.from("crew_members").select("crew_id").eq("user_id", session.user.id);
    const crewIds = (memberships || []).map((m) => m.crew_id);
    if (crewIds.length === 0) {
      setCrews([]);
      setCrewCalls([]);
      return;
    }
    const { data: crewData } = await supabase
      .from("crews")
      .select("*, crew_members(user_id, user_name)")
      .in("id", crewIds);
    setCrews(crewData || []);
    loadCrewCalls(crewData || []);
  }, [session]);

  const loadFriends = useCallback(async () => {
    if (!session) return;
    const myId = session.user.id;
    const { data: rows } = await supabase
      .from("friendships")
      .select("user_id_a, user_id_b")
      .or(`user_id_a.eq.${myId},user_id_b.eq.${myId}`);
    const friendIds = (rows || []).map((r) => (r.user_id_a === myId ? r.user_id_b : r.user_id_a));
    if (friendIds.length === 0) {
      setFriends([]);
      return;
    }
    const { data: profileRows } = await supabase.from("profiles").select("id, name").in("id", friendIds);
    setFriends(profileRows || []);
  }, [session]);

  const loadCrewCalls = useCallback(
    async (crewList) => {
      if (!session) return;
      const crewIds = (crewList || crews).map((c) => c.id);
      if (crewIds.length === 0) {
        setCrewCalls([]);
        return;
      }
      const { data } = await supabase
        .from("crew_calls")
        .select("*")
        .in("crew_id", crewIds)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      setCrewCalls((data || []).filter((c) => c.from_user_id !== session.user.id));
    },
    [session, crews]
  );

  const loadStats = useCallback(async () => {
    if (!session) return;
    const { data: mine } = await supabase.from("checkins").select("venue_id").eq("user_id", session.user.id);
    const list = mine || [];
    const distinctVenues = new Set(list.map((c) => c.venue_id));
    const { count: friendCount } = await supabase
      .from("friendships")
      .select("*", { count: "exact", head: true })
      .or(`user_id_a.eq.${session.user.id},user_id_b.eq.${session.user.id}`);
    setStats({ checkinCount: list.length, venueCount: distinctVenues.size, friendCount: friendCount || 0 });
  }, [session]);

  useEffect(() => {
    if (session) { loadData(); loadStats(); loadFavorites(); loadCrews(); loadFriends(); loadReactions(); }
  }, [session, loadData]);

  const toggleFavorite = async (venueId) => {
    const isFav = favoriteIds.has(venueId);
    const next = new Set(favoriteIds);
    if (isFav) {
      next.delete(venueId);
      setFavoriteIds(next);
      await supabase.from("favorites").delete().eq("user_id", session.user.id).eq("venue_id", venueId);
    } else {
      next.add(venueId);
      setFavoriteIds(next);
      await supabase.from("favorites").insert({ user_id: session.user.id, venue_id: venueId });
    }
  };

  const toggleReaction = async (checkinId, emoji) => {
    const current = reactionsByCheckin[checkinId]?.[emoji] || { count: 0, mine: false };
    const next = {
      ...reactionsByCheckin,
      [checkinId]: {
        ...reactionsByCheckin[checkinId],
        [emoji]: { count: current.mine ? current.count - 1 : current.count + 1, mine: !current.mine },
      },
    };
    setReactionsByCheckin(next);
    if (current.mine) {
      await supabase.from("checkin_reactions").delete().eq("checkin_id", checkinId).eq("user_id", session.user.id).eq("emoji", emoji);
    } else {
      await supabase.from("checkin_reactions").insert({ checkin_id: checkinId, user_id: session.user.id, user_name: profile.name, emoji });
    }
  };

  const createCrew = async (name) => {
    try {
      const { data: newCrew, error: crewErr } = await supabase
        .from("crews")
        .insert({ name, created_by: session.user.id })
        .select()
        .single();
      if (crewErr) throw crewErr;
      await supabase.from("crew_members").insert({ crew_id: newCrew.id, user_id: session.user.id, user_name: profile.name });
      loadCrews();
    } catch (e) {
      setError("Couldn't create crew — try again.");
    }
  };

  const leaveCrew = async (crewId) => {
    await supabase.from("crew_members").delete().eq("crew_id", crewId).eq("user_id", session.user.id);
    if (tonightCrew && tonightCrew.id === crewId) setTonightCrew(null);
    loadCrews();
  };

  const addCrewMember = async (crewId, userId, userName) => {
    try {
      await supabase.from("crew_members").insert({ crew_id: crewId, user_id: userId, user_name: userName });
      loadCrews();
    } catch (e) {
      // Likely already a member — safe to ignore
    }
  };

  const searchProfiles = async (query) => {
    let builder = supabase.from("profiles").select("id, name").neq("id", session.user.id).limit(15);
    if (query && query.trim().length >= 2) {
      builder = builder.ilike("name", `%${query.trim()}%`);
    }
    const { data } = await builder;
    return data || [];
  };

  const addFriend = async (friendId) => {
    try {
      await supabase.from("friendships").insert({ user_id_a: session.user.id, user_id_b: friendId });
      loadFriends();
      loadStats();
    } catch (e) {
      // Likely already friends — safe to ignore
    }
  };

  const removeFriend = async (friendId) => {
    const myId = session.user.id;
    await supabase
      .from("friendships")
      .delete()
      .or(
        `and(user_id_a.eq.${myId},user_id_b.eq.${friendId}),and(user_id_a.eq.${friendId},user_id_b.eq.${myId})`
      );
    loadFriends();
    loadStats();
  };

  const callTheCrew = async (crewId, venue, eventId) => {
    try {
      const expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
      await supabase.from("crew_calls").insert({
        crew_id: crewId,
        from_user_id: session.user.id,
        from_user_name: profile.name,
        venue_id: venue.id || null,
        venue_name: venue.name,
        event_id: eventId || null,
        expires_at: expiresAt,
      });
    } catch (e) {
      setError("Couldn't call the crew — try again.");
    }
  };

  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel("public:checkins-venues")
      .on("postgres_changes", { event: "*", schema: "public", table: "checkins" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "venues" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "crew_calls" }, () => loadCrewCalls())
      .on("postgres_changes", { event: "*", schema: "public", table: "checkin_reactions" }, () => loadReactions())
      .subscribe();
    const interval = setInterval(loadData, 60000); // refresh every minute to drop expired check-ins
    return () => { supabase.removeChannel(channel); clearInterval(interval); };
  }, [session, loadData, loadCrewCalls, loadReactions]);

  const handleSetName = async (name) => {
    setSettingUp(true);
    try {
      const { error: upsertErr } = await supabase.from("profiles").upsert({ id: session.user.id, name });
      if (upsertErr) throw upsertErr;
      setProfile({ id: session.user.id, name });
    } catch (e) {
      setError("Couldn't save your name.");
    } finally {
      setSettingUp(false);
    }

    try {
      const params = new URLSearchParams(window.location.search);
      const inviterId = params.get("invite");
      const crewInviteId = params.get("crew");
      if (inviterId && inviterId !== session.user.id) {
        await supabase.from("friendships").insert({ user_id_a: session.user.id, user_id_b: inviterId });
        loadFriends();
        loadStats();
      }
      if (crewInviteId) {
        await supabase.from("crew_members").insert({ crew_id: crewInviteId, user_id: session.user.id, user_name: name });
        loadCrews();
      }
      if (inviterId || crewInviteId) window.history.replaceState({}, "", window.location.pathname);
    } catch (e) {
      // Non-fatal — a duplicate/failed friendship or crew join shouldn't block onboarding
    }
  };

  // "Already saved an account? sign in" (NameGate) — for a new device/browser, or after
  // signing out. Independent of whatever anonymous session is currently active; clicking
  // the emailed link swaps the active session over to the real account.
  const sendMagicLink = async (email) => {
    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` },
    });
    if (otpErr) throw otpErr;
  };

  // "Save your account" (You tab) — links an email to the CURRENT anonymous account rather
  // than creating a new one, so every check-in/friend/crew/badge already earned stays intact.
  const saveAccount = async (email) => {
    const { error: updateErr } = await supabase.auth.updateUser(
      { email },
      { emailRedirectTo: `${window.location.origin}${window.location.pathname}` }
    );
    if (updateErr) throw updateErr;
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  const checkIn = async (data) => {
    try {
      let venueId = data.venue.id || null;
      if (!venueId) {
        const { data: existingVenue } = await supabase
          .from("venues")
          .select("*")
          .ilike("name", data.venue.name)
          .maybeSingle();
        if (existingVenue) {
          venueId = existingVenue.id;
        } else {
          const { data: newVenue, error: venueErr } = await supabase
            .from("venues")
            .insert({ name: data.venue.name, lat: data.venue.lat, lng: data.venue.lng, osm_website: data.venue.website, opening_hours: data.venue.openingHours })
            .select()
            .single();
          if (venueErr) throw venueErr;
          venueId = newVenue.id;
        }
      }
      const expiresAt = new Date(Date.now() + data.hours * 60 * 60 * 1000).toISOString();
      const { error: checkinErr } = await supabase.from("checkins").insert({
        venue_id: venueId,
        user_id: session.user.id,
        user_name: profile.name,
        vibe: data.vibe,
        note: data.note || null,
        visibility: "shared",
        expires_at: expiresAt,
        crew_id: data.crewId || null,
      });
      if (checkinErr) throw checkinErr;
      setView("feed");
      setPrefillVenue("");
      setPresetVenue(null);
      loadData();
      loadStats();
    } catch (e) {
      setError("Couldn't check in — try again.");
    }
  };

  const checkOut = async (checkinId) => {
    const { error: delErr } = await supabase.from("checkins").delete().eq("id", checkinId);
    if (delErr) setError("Couldn't check out — try again.");
    else { loadData(); loadStats(); }
  };

  const updateVibe = async (checkinId, vibe) => {
    const { error: updateErr } = await supabase.from("checkins").update({ vibe }).eq("id", checkinId);
    if (updateErr) setError("Couldn't update your vibe — try again.");
    else loadData();
  };

  const grouped = {};
  checkins.forEach((c) => {
    if (!grouped[c.venue_id]) grouped[c.venue_id] = [];
    grouped[c.venue_id].push(c);
  });
  const groups = Object.entries(grouped)
    .map(([venueId, cs]) => ({ venue: venues[venueId], checkins: cs }))
    .filter((g) => g.venue)
    .sort((a, b) => b.checkins.length - a.checkins.length);

  return (
    <div style={{ minHeight: "100vh", background: colors.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: bodyFont }}>
      <div style={{ width: 390, minHeight: 700, maxHeight: 760, background: colors.bg, borderRadius: 28, border: "8px solid #050308", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 30px 60px rgba(255,61,154,0.15)" }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: "center", color: colors.textMuted }}>loading…</div>
        ) : !profile ? (
          <NameGate onSet={handleSetName} busy={settingUp} onSendMagicLink={sendMagicLink} inviterName={inviterName} />
        ) : (
          <>
            <div style={{ padding: "20px 20px 10px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontFamily: displayFont, fontWeight: 700, fontSize: 11, color: "#FF3D9A", letterSpacing: "0.1em" }}>NIGHTLY</div>
                <div style={{ fontFamily: displayFont, fontWeight: 700, fontSize: 20, color: colors.text }}>who's out</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: bodyFont, fontSize: 11, color: colors.textMuted }}>you're</div>
                <div style={{ fontFamily: bodyFont, fontSize: 13, color: colors.text, fontWeight: 700 }}>{profile.name}</div>
              </div>
            </div>

            {error && (
              <div style={{ margin: "0 20px 10px", padding: "8px 12px", background: "#3A2222", border: `1px solid ${colors.danger}`, borderRadius: 8, color: colors.text, fontSize: 12 }}>{error}</div>
            )}

            <div style={{ flex: 1, overflowY: "auto", padding: "0 20px" }}>
              {view === "checkin" ? (
                <CheckInForm
                  onCreate={checkIn}
                  onCancel={() => { setPrefillVenue(""); setPresetVenue(null); setView("feed"); }}
                  initialVenueQuery={prefillVenue}
                  presetVenue={presetVenue}
                  tonightCrew={tonightCrew}
                />
              ) : view === "crew" ? (
                <CrewScreen
                  crews={crews}
                  checkins={checkins}
                  tonightCrew={tonightCrew}
                  setTonightCrew={setTonightCrew}
                  onCreateCrew={createCrew}
                  onLeaveCrew={leaveCrew}
                  onSearchProfiles={searchProfiles}
                  onAddCrewMember={addCrewMember}
                  myId={session.user.id}
                />
              ) : view === "friends" ? (
                <FriendsScreen
                  myId={session.user.id}
                  friends={friends}
                  onSearchProfiles={searchProfiles}
                  onAddFriend={addFriend}
                  onRemoveFriend={removeFriend}
                />
              ) : view === "you" ? (
                <BadgesScreen
                  stats={stats}
                  userEmail={session.user.email}
                  onSaveAccount={saveAccount}
                  onLogout={logout}
                  installed={installed}
                  canInstall={!!installEvent}
                  isIOS={isIOSDevice()}
                  onInstall={promptInstall}
                />
              ) : (
                <FeedScreen
                  groups={groups}
                  venues={venues}
                  favoriteIds={favoriteIds}
                  onToggleFavorite={toggleFavorite}
                  friendIds={new Set(friends.map((f) => f.id))}
                  crews={crews}
                  onCallCrew={callTheCrew}
                  crewCalls={crewCalls}
                  myName={profile.name}
                  myId={session.user.id}
                  onCheckOut={checkOut}
                  onUpdateVibe={updateVibe}
                  onStartCheckinAt={(name) => { setPrefillVenue(name); setPresetVenue(null); setView("checkin"); }}
                  onCheckInHere={(venue) => { setPresetVenue(venue); setPrefillVenue(""); setView("checkin"); }}
                  reactionsByCheckin={reactionsByCheckin}
                  onToggleReaction={toggleReaction}
                />
              )}
            </div>

            <BottomNav
              view={view}
              onNavigate={(id) => { if (id === "checkin") { setPrefillVenue(""); setPresetVenue(null); } setView(id); }}
            />
          </>
        )}
      </div>
    </div>
  );
}
