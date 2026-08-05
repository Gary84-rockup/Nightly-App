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
  chill: { label: "Chill", color: "#34E4EA", emoji: "🌙" },
  busy: { label: "Busy", color: "#FFC24B", emoji: "🔥" },
  lit: { label: "Lit", color: "#FF3D9A", emoji: "⚡" },
  dead: { label: "Dead", color: "#6B5F82", emoji: "💤" },
};

const displayFont = "'Space Grotesk', sans-serif";
const bodyFont = "'Inter', sans-serif";
const monoFont = "'IBM Plex Mono', monospace";

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

function NameGate({ onSet, busy }) {
  const [name, setName] = useState("");
  return (
    <div style={{ padding: "70px 24px", textAlign: "center" }}>
      <div style={{ fontFamily: displayFont, fontWeight: 700, fontSize: 13, color: "#FF3D9A", letterSpacing: "0.1em", marginBottom: 6 }}>
        NIGHTLY
      </div>
      <div style={{ fontFamily: displayFont, fontWeight: 700, fontSize: 24, color: colors.text, marginBottom: 8 }}>
        who's out tonight?
      </div>
      <div style={{ fontFamily: bodyFont, fontSize: 13, color: colors.textMuted, marginBottom: 20, lineHeight: 1.5 }}>
        just your name for now — real sign-in comes later.
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="your name"
        style={{
          width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${colors.line}`,
          background: colors.surface, color: colors.text, fontFamily: bodyFont, fontSize: 14,
          marginBottom: 14, boxSizing: "border-box",
        }}
      />
      <Button onClick={() => name.trim() && onSet(name.trim())} disabled={!name.trim() || busy} style={{ width: "100%" }}>
        {busy ? "setting up..." : "let's go"}
      </Button>
    </div>
  );
}

function CheckInForm({ onCreate, onCancel }) {
  const [venueQuery, setVenueQuery] = useState("");
  const [venueResults, setVenueResults] = useState([]);
  const [selectedVenue, setSelectedVenue] = useState(null);
  const [vibe, setVibe] = useState("chill");
  const [note, setNote] = useState("");
  const [hours, setHours] = useState(3);
  const justSelectedRef = React.useRef(false);

  useEffect(() => {
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    if (!venueQuery || venueQuery.length < 3) {
      setVenueResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=5&extratags=1&q=${encodeURIComponent(venueQuery)}`
        );
        const data = await res.json();
        const seen = new Set();
        setVenueResults(data.filter((r) => (seen.has(r.display_name) ? false : (seen.add(r.display_name), true))));
      } catch (e) {
        setVenueResults([]);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [venueQuery]);

  const selectVenue = (r) => {
    justSelectedRef.current = true;
    const shortName = r.display_name.split(",")[0];
    setSelectedVenue({
      name: shortName,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      website: (r.extratags && (r.extratags.website || r.extratags["contact:website"])) || null,
    });
    setVenueQuery(shortName);
    setVenueResults([]);
  };

  const label = { fontFamily: monoFont, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.textMuted, marginBottom: 6, display: "block" };
  const inputStyle = { width: "100%", padding: "11px 13px", borderRadius: 9, border: `1px solid ${colors.line}`, background: colors.surface, color: colors.text, fontFamily: bodyFont, fontSize: 13.5, boxSizing: "border-box" };

  return (
    <div style={{ padding: "18px 20px 40px" }}>
      <div style={{ fontFamily: displayFont, fontWeight: 700, fontSize: 20, color: colors.text, marginBottom: 16 }}>check in</div>

      <label style={label}>venue</label>
      <div style={{ position: "relative", marginBottom: 6 }}>
        <input
          style={inputStyle}
          value={venueQuery}
          onChange={(e) => { setVenueQuery(e.target.value); setSelectedVenue(null); }}
          placeholder="start typing a real venue..."
        />
        {venueResults.length > 0 && (
          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10, background: colors.surfaceRaised, border: `1px solid ${colors.line}`, borderRadius: 9, marginTop: 4, overflow: "hidden" }}>
            {venueResults.map((r) => (
              <div key={r.place_id} onClick={() => selectVenue(r)} style={{ padding: "9px 12px", fontSize: 12.5, color: colors.text, cursor: "pointer", borderBottom: `1px solid ${colors.line}` }}>
                {r.display_name}
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ fontFamily: bodyFont, fontSize: 10.5, color: selectedVenue ? "#34E4EA" : colors.textMuted, marginBottom: 14 }}>
        {selectedVenue ? "✓ verified venue" : "pick a real place from the list"}
      </div>

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

      <div style={{ display: "flex", gap: 10 }}>
        <Button variant="ghost" onClick={onCancel} style={{ flex: 1 }}>cancel</Button>
        <Button
          disabled={!selectedVenue}
          onClick={() => selectedVenue && onCreate({ venue: selectedVenue, vibe, note: note.trim(), hours })}
          style={{ flex: 2 }}
        >
          check in
        </Button>
      </div>
    </div>
  );
}

function VenueCard({ group, myName, onCheckOut }) {
  const vibeCounts = {};
  group.checkins.forEach((c) => { vibeCounts[c.vibe] = (vibeCounts[c.vibe] || 0) + 1; });
  const topVibe = Object.entries(vibeCounts).sort((a, b) => b[1] - a[1])[0][0];
  const v = VIBES[topVibe];
  const mine = group.checkins.find((c) => c.user_name === myName);

  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.line}`, borderLeft: `3px solid ${v.color}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ fontFamily: displayFont, fontWeight: 700, fontSize: 15, color: colors.text }}>{group.venue.name}</div>
        <span style={{ fontFamily: monoFont, fontSize: 10, color: v.color, border: `1px solid ${v.color}`, borderRadius: 20, padding: "2px 8px" }}>
          {v.emoji} {v.label}
        </span>
      </div>
      <div style={{ fontFamily: bodyFont, fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>
        {group.checkins.length} {group.checkins.length === 1 ? "person" : "people"} checked in
      </div>
      {group.checkins.slice(0, 4).map((c) => (
        <div key={c.id} style={{ fontFamily: bodyFont, fontSize: 11.5, color: colors.text, marginBottom: 3 }}>
          <span style={{ color: VIBES[c.vibe].color }}>{VIBES[c.vibe].emoji}</span> {c.user_name}
          {c.note ? <span style={{ color: colors.textMuted }}> — "{c.note}"</span> : null}
        </div>
      ))}
      {group.venue.osm_website && (
        <a href={group.venue.osm_website} target="_blank" rel="noopener noreferrer" style={{ fontFamily: bodyFont, fontSize: 11, color: "#34E4EA", textDecoration: "underline" }}>
          🌐 venue website
        </a>
      )}
      {mine && (
        <div style={{ marginTop: 8 }}>
          <Button variant="danger" onClick={() => onCheckOut(mine.id)} style={{ padding: "7px 12px", fontSize: 11.5 }}>
            check out
          </Button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [checkins, setCheckins] = useState([]);
  const [venues, setVenues] = useState({});
  const [loading, setLoading] = useState(true);
  const [settingUp, setSettingUp] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState("feed");

  useEffect(() => {
    const init = async () => {
      try {
        const { data: existing } = await supabase.auth.getSession();
        let currentSession = existing.session;
        if (!currentSession) {
          const { data, error: authErr } = await supabase.auth.signInAnonymously();
          if (authErr) throw authErr;
          currentSession = data.session;
        }
        setSession(currentSession);
        const { data: profileRow } = await supabase.from("profiles").select("*").eq("id", currentSession.user.id).maybeSingle();
        setProfile(profileRow || null);
      } catch (e) {
        setError("Couldn't connect. Check your Supabase setup in .env");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

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

  useEffect(() => {
    if (session) loadData();
  }, [session, loadData]);

  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel("public:checkins-venues")
      .on("postgres_changes", { event: "*", schema: "public", table: "checkins" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "venues" }, loadData)
      .subscribe();
    const interval = setInterval(loadData, 60000); // refresh every minute to drop expired check-ins
    return () => { supabase.removeChannel(channel); clearInterval(interval); };
  }, [session, loadData]);

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
  };

  const checkIn = async (data) => {
    try {
      let venueId;
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
          .insert({ name: data.venue.name, lat: data.venue.lat, lng: data.venue.lng, osm_website: data.venue.website })
          .select()
          .single();
        if (venueErr) throw venueErr;
        venueId = newVenue.id;
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
      });
      if (checkinErr) throw checkinErr;
      setView("feed");
      loadData();
    } catch (e) {
      setError("Couldn't check in — try again.");
    }
  };

  const checkOut = async (checkinId) => {
    const { error: delErr } = await supabase.from("checkins").delete().eq("id", checkinId);
    if (delErr) setError("Couldn't check out — try again.");
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
          <NameGate onSet={handleSetName} busy={settingUp} />
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
                <CheckInForm onCreate={checkIn} onCancel={() => setView("feed")} />
              ) : groups.length === 0 ? (
                <div style={{ padding: "40px 4px", textAlign: "center", color: colors.textMuted, fontSize: 13, lineHeight: 1.5 }}>
                  nobody's checked in yet. be the first — tap "check in" below.
                </div>
              ) : (
                <div style={{ paddingBottom: 20 }}>
                  {groups.map((g) => (
                    <VenueCard key={g.venue.id} group={g} myName={profile.name} onCheckOut={checkOut} />
                  ))}
                </div>
              )}
            </div>

            {view !== "checkin" && (
              <div style={{ padding: "12px 20px 18px", borderTop: `1px solid ${colors.line}` }}>
                <Button onClick={() => setView("checkin")} style={{ width: "100%" }}>check in</Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
