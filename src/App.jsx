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

const BADGES = [
  { id: "first", label: "First Night Out", emoji: "🌟", need: (s) => s.checkinCount >= 1, desc: "Check in once" },
  { id: "regular", label: "Regular", emoji: "🍹", need: (s) => s.checkinCount >= 5, desc: "5 check-ins" },
  { id: "legend", label: "Nightly Legend", emoji: "👑", need: (s) => s.checkinCount >= 15, desc: "15 check-ins" },
  { id: "explorer", label: "Explorer", emoji: "🗺️", need: (s) => s.venueCount >= 3, desc: "3 different venues" },
  { id: "nightowl", label: "Night Owl", emoji: "🦉", need: (s) => s.venueCount >= 8, desc: "8 different venues" },
  { id: "connector", label: "Connector", emoji: "🤝", need: (s) => s.friendCount >= 3, desc: "3 friends on NIGHTLY" },
];

const displayFont = "'Space Grotesk', sans-serif";
const bodyFont = "'Inter', sans-serif";
const monoFont = "'IBM Plex Mono', monospace";

function eventDateLabel(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Tonight";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 0) return "Past";
  if (diffDays <= 6) return `In ${diffDays} days`;
  return target.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
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

function CheckInForm({ onCreate, onCancel, initialVenueQuery }) {
  const [venueQuery, setVenueQuery] = useState(initialVenueQuery || "");
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

function VenueCard({ group, myName, onCheckOut, defaultExpanded }) {
  const [expanded, setExpanded] = useState(!!defaultExpanded);
  const vibeCounts = {};
  group.checkins.forEach((c) => { vibeCounts[c.vibe] = (vibeCounts[c.vibe] || 0) + 1; });
  const topVibe = Object.entries(vibeCounts).sort((a, b) => b[1] - a[1])[0][0];
  const v = VIBES[topVibe];
  const mine = group.checkins.find((c) => c.user_name === myName);
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
        <div style={{ fontFamily: displayFont, fontWeight: 700, fontSize: 17, color: colors.text }}>{group.venue.name}</div>
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
          }}
        >
          {v.emoji} {v.label.toUpperCase()}
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: bodyFont, fontSize: 12.5, color: colors.textMuted, fontWeight: 600 }}>
          🎉 {group.checkins.length} {group.checkins.length === 1 ? "person" : "people"} here right now
        </div>
        <div style={{ fontFamily: bodyFont, fontSize: 11, color: colors.textMuted }}>{expanded ? "▲" : "▼"}</div>
      </div>

      {expanded && (
        <div style={{ marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
          {group.checkins.map((c) => (
            <div key={c.id} style={{ fontFamily: bodyFont, fontSize: 12, color: colors.text, marginBottom: 4, fontWeight: 500 }}>
              <span style={{ color: VIBES[c.vibe].color }}>{VIBES[c.vibe].emoji}</span> {c.user_name}
              {c.note ? <span style={{ color: colors.textMuted }}> — "{c.note}"</span> : null}
            </div>
          ))}
          {group.venue.osm_website && (
            <a href={group.venue.osm_website} target="_blank" rel="noopener noreferrer" style={{ fontFamily: bodyFont, fontSize: 11, color: "#34E4EA", textDecoration: "underline", fontWeight: 600 }}>
              🌐 venue website
            </a>
          )}
          {mine && (
            <div style={{ marginTop: 10 }}>
              <Button variant="danger" onClick={() => onCheckOut(mine.id)} style={{ padding: "7px 12px", fontSize: 11.5 }}>
                check out
              </Button>
            </div>
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

function BadgesScreen({ stats, myId }) {
  const [copied, setCopied] = useState(false);
  const unlocked = BADGES.filter((b) => b.need(stats));
  const locked = BADGES.filter((b) => !b.need(stats));

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
              <div>
                <div style={{ fontFamily: bodyFont, fontWeight: 700, fontSize: 13.5, color: colors.text }}>{b.label}</div>
                <div style={{ fontFamily: bodyFont, fontSize: 11, color: colors.textMuted }}>{b.desc}</div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function FeedScreen({ groups, myName, onCheckOut, onStartCheckinAt }) {
  const [query, setQuery] = useState("");
  const [osmResults, setOsmResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [sortMode, setSortMode] = useState("trending");
  const [spotlightId, setSpotlightId] = useState(null);

  const sorted = [...groups].sort((a, b) => {
    if (sortMode === "newest") {
      const aLatest = Math.max(...a.checkins.map((c) => new Date(c.created_at).getTime()));
      const bLatest = Math.max(...b.checkins.map((c) => new Date(c.created_at).getTime()));
      return bLatest - aLatest;
    }
    return b.checkins.length - a.checkins.length;
  });

  const filtered = query.trim()
    ? sorted.filter((g) => g.venue.name.toLowerCase().includes(query.trim().toLowerCase()))
    : sorted;

  const spotlightGroup = spotlightId ? groups.find((g) => g.venue.id === spotlightId) : null;

  const surpriseMe = () => {
    if (groups.length === 0) return;
    const topPool = groups.slice(0, Math.max(3, Math.ceil(groups.length / 2)));
    const pick = topPool[Math.floor(Math.random() * topPool.length)];
    setSpotlightId(pick.venue.id);
  };

  useEffect(() => {
    if (filtered.length > 0 || query.trim().length < 3) {
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
  }, [query, filtered.length]);

  return (
    <div>
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
            <Button onClick={() => onStartCheckinAt(spotlightGroup.venue.name)} style={{ flex: 1, padding: "9px 0", fontSize: 12 }}>
              check in here
            </Button>
            <Button variant="ghost" onClick={() => setSpotlightId(null)} style={{ padding: "9px 12px", fontSize: 12 }}>
              dismiss
            </Button>
          </div>
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

      {groups.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {[
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

      {query.trim() && filtered.length > 0 && (
        <div style={{ fontFamily: bodyFont, fontSize: 11, color: "#34E4EA", fontWeight: 600, marginBottom: 8 }}>
          {filtered.length} spot{filtered.length === 1 ? "" : "s"} matching "{query}"
        </div>
      )}

      {filtered.length === 0 && groups.length > 0 && query.trim() && osmResults.length === 0 && !searching && (
        <div style={{ fontFamily: bodyFont, fontSize: 12.5, color: colors.textMuted, marginBottom: 12 }}>
          nobody's checked in there right now.
        </div>
      )}

      {filtered.length === 0 && groups.length === 0 && !query.trim() && (
        <div style={{ padding: "40px 4px", textAlign: "center", color: colors.textMuted, fontSize: 13, lineHeight: 1.5 }}>
          nobody's checked in yet. be the first — tap "check in" below.
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
        {filtered.map((g) => (
          <VenueCard key={g.venue.id} group={g} myName={myName} onCheckOut={onCheckOut} />
        ))}
      </div>
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
  const [stats, setStats] = useState({ checkinCount: 0, venueCount: 0, friendCount: 0 });
  const [prefillVenue, setPrefillVenue] = useState("");

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
    if (session) { loadData(); loadStats(); }
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

    try {
      const params = new URLSearchParams(window.location.search);
      const inviterId = params.get("invite");
      if (inviterId && inviterId !== session.user.id) {
        await supabase.from("friendships").insert({ user_id_a: session.user.id, user_id_b: inviterId });
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch (e) {
      // Non-fatal — a duplicate/failed friendship shouldn't block onboarding
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
      setPrefillVenue("");
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
                <CheckInForm
                  onCreate={checkIn}
                  onCancel={() => { setPrefillVenue(""); setView("feed"); }}
                  initialVenueQuery={prefillVenue}
                />
              ) : view === "you" ? (
                <BadgesScreen stats={stats} myId={session.user.id} />
              ) : (
                <FeedScreen
                  groups={groups}
                  myName={profile.name}
                  onCheckOut={checkOut}
                  onStartCheckinAt={(name) => { setPrefillVenue(name); setView("checkin"); }}
                />
              )}
            </div>

            <BottomNav
              view={view}
              onNavigate={(id) => { if (id === "checkin") setPrefillVenue(""); setView(id); }}
            />
          </>
        )}
      </div>
    </div>
  );
}
