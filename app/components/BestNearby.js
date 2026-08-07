"use client";
// BestNearby v2 — one near-black card, three expandable menus (owner
// directions 2026-07-21 late evening):
//   1. Best places to eat nearby — wf_best_picks(food). The engine's daypart
//      math IS the owner's rule (5-10:30 boosts breakfast 1.4x, midday boosts
//      open-kitchen restaurants, evening boosts bars/late food and penalizes
//      breakfast -1.2). Rows open OUR detail sheet, never Google.
//   2. Top things to do — wf_things_to_do (tours + attractions + beaches
//      ranked together). Tours book on Viator; places open the detail sheet.
//   3. Local trends — the area right now: beach intelligence when the
//      nearest beach is within 20 mi (owner's definition of "near"), plus
//      the LLM-written daily brief (/api/local/report) grounded ONLY in
//      today's real events + live weather + the beach reading. No crowd or
//      trend claims anywhere — nothing here measures those.
// Top-3 ranks wear medals (champagne/silver/bronze trophy — the premium
// treatment the owner asked for). Lazy per-section fetches, one open at a
// time, reserved-height loading, honest empty states.
// scripts/test-todays-best.mjs locks the contract.
import { useState, useRef, useEffect } from "react";
import { reasonLine } from "../../lib/reasonLine";
import { C, CHAMPAGNE, TYPE, RADII, SHADOW, FOCUS, TARGET, Icon, NavIcon, directionsUrl, PlaceScoreChip, TRENDING_POPULARITY_THRESHOLD } from "./kit";
import { fetchTodaysBest, fetchThingsToDo, tbPhotoUrl } from "../../lib/todaysBest.js";
import { PLATFORM } from "../../lib/creatorVideos";
import { supabase } from "../../lib/supabase.js";
import { siteTodayStr } from "../../lib/siteTime.js";
// v6.72: one source for the hour, the bucket and the outdoor gate.
import { nowContext } from "../../lib/nowContext.js";
import { gateOutdoor } from "../../lib/ranking.js";

// Owner: "a little lighter, almost black" — one step off the page's #040810.
const CARD_BG = "#0B0E15";
const MEDAL = [CHAMPAGNE.base, "#C7CCD6", "#B8804A"]; // gold, silver, bronze

const fmtDur = (m) => (m == null ? null : m >= 60 ? (m % 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m / 60 + "h") : m + "m");

// The ranked row wants ONE short, COMPLETE hook — what the place is known for —
// that fits a phone column without being cut off mid-word (owner, 2026-08-07:
// "not making me curious to click on it specially being cut off"). The editorial
// hook / blurb is a full sentence, so this compresses it: strip the redundant
// "<Name> is a ..." / "Known for ..." lead-in (the card already shows the name),
// take the first REAL sentence (not tricked by "St."/"Ave." abbreviations),
// then, if still too long, cut at the nearest clause boundary within CAP and
// trim any trailing filler word so the line ends on something solid — never a
// dangling "of/and/off" and never a chopped word. Returns "" so a place with no
// real hook falls back to its engine reason line.
const HOOK_ABBR = /(?:^|\s)(?:st|ave|blvd|rd|dr|mt|ft|mr|mrs|ms|jr|sr|no|vs|etc|co|inc|dept|hwy|pt|ln)\.$/i;
const HOOK_STOP = /\s+(?:a|an|the|and|or|of|with|to|for|in|on|at|by|from|off|into|its|their|this|that|not|but|where|which|while|as|is|was)$/i;
const HOOK_PLACEHOLDER = /\b(independent verification|none confirmed|this research pass|not (?:yet )?(?:been )?(?:confirmed|completed|verified)|unverified|pending verification)\b/i;
const HOOK_CAP = 40;
function toHookLine(raw, name) {
  let s = String(raw || "").replace(/\s+/g, " ").trim();
  if (!s || HOOK_PLACEHOLDER.test(s)) return ""; // never surface a pending-research note
  if (name) {
    const nm = String(name).split(/\s+[-–—|]\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp("^" + nm + "(?:['’]s)?\\s+(?:is|was|are)\\s+(?:a|an|the)\\s+", "i"), "");
  }
  s = s.replace(/^(?:it|this|the (?:place|spot|shop|cafe|café|bar))\s+(?:is|was)\s+(?:a|an|the)\s+/i, "");
  s = s.replace(/^known for\s+(?:its|their|the|a|an)?\s*/i, "");
  const re = /[.!?]+(?=\s|$)/g; let mm, endIdx = -1;
  while ((mm = re.exec(s))) {
    const upto = s.slice(0, mm.index + 1);
    if (HOOK_ABBR.test(upto)) continue;
    if (upto.length >= 20) { endIdx = mm.index + mm[0].length; break; }
  }
  let first = (endIdx > 0 ? s.slice(0, endIdx) : s).replace(/\s*[.!?]+$/, "").trim();
  if (first.length > HOOK_CAP) {
    const win = first.slice(0, HOOK_CAP + 1);
    let cut = -1;
    for (const b of [" — ", " – ", ", ", "; ", " and ", " or "]) { const i = win.lastIndexOf(b); if (i > cut && i >= 20) cut = i; }
    if (cut < 20) { const i = win.lastIndexOf(" "); cut = i >= 20 ? i : HOOK_CAP; }
    first = first.slice(0, cut);
  }
  first = first.replace(/[\s,;:—–-]+$/, "");
  let prev; do { prev = first; first = first.replace(HOOK_STOP, "").replace(/[\s,;:—–-]+$/, ""); } while (first !== prev);
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : "";
}

// Rank medal: top three only — a trophy in gold, silver, bronze.
function Medal({ i }) {
  if (i > 2) return <span style={{ width: 20, textAlign: "center", fontSize: 12, fontWeight: 800, color: C.muted, flexShrink: 0 }}>{i + 1}</span>;
  return (
    <span style={{ width: 20, display: "inline-flex", justifyContent: "center", flexShrink: 0 }} aria-label={"Ranked #" + (i + 1)}>
      <Icon name="trophy" size={15} color={MEDAL[i]} strokeWidth={2.2} />
    </span>
  );
}

// The expanded panel is overflow:hidden with a hard maxHeight. This must be
// >= the TALLEST a row can get or the last rows are silently clipped — a bug
// with no error, no warning and no signature in a diff. 64 was the pre-reason
// row; a two-line why at 12px/1.35 adds ~32px. 100 leaves headroom without
// making the collapse animation feel loose.
// Pinned by scripts/check-home-answer-first.mjs.
const ROW_MAX_H = 100;

// v6.97 — the answer-first head. The mockup the owner approved shows THREE
// results and then a way to see the rest, not ten. Three is what fits above the
// fold on a phone, and the fold is the entire problem this surface was built to
// fix (259 single-page sessions on `/`, median 10 seconds).
//
// "See all" expands IN PLACE rather than navigating. A separate list page would
// re-rank with its own code path, and two lists that disagree about the same
// places is the exact bug class this session has spent its time removing —
// wayfindScore had five implementations, the answer-first list ignored the
// creator boost the grid below it applied. One list, one ranking.
const HEAD_COUNT = 3;

// The mood row. Every one of these is a REAL route that already exists and
// already ranks — no chip here is a placeholder, and none of them is a filter
// that silently returns the same list. `/` is "right now", which is where the
// reader already is, so it renders as the selected state rather than a link to
// the page they are on.
const MOODS = [
  { label: "Right now", href: null },
  { label: "Date night", href: "/date-night" },
  { label: "Family", href: "/family" },
  { label: "Hidden gems", href: "/hidden-gems" },
];

// 22.4 -> "10pm". Whole hours only: "10:24pm" claims a precision the ranking
// does not have (wf_best_picks buckets the day into four dayparts), and a
// minute-accurate label on an hour-accurate ranking is a small lie that gets
// noticed.
function hourLabel(h) {
  const n = Math.floor(((Number(h) % 24) + 24) % 24);
  const ampm = n >= 12 ? "pm" : "am";
  const h12 = n % 12 === 0 ? 12 : n % 12;
  return h12 + ampm;
}

function Row({ i, thumb, title, why, meta, badge, trailing, onClick, href, whyOneLine }) {
  const inner = (
    <>
      <Medal i={i} />
      <div style={{ width: 46, height: 46, borderRadius: 9, overflow: "hidden", flexShrink: 0, background: C.card }}>
        {thumb && <img src={thumb} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
          {badge}
        </div>
        {why ? (
          // The WHY, above the numbers. wf_best_picks has always returned a
          // `reasons text[]` — "Breakfast — right for the hour", "A cool treat
          // for a 83° day", "Local favorite — 4.9★ from 1782 reviews" — and no
          // surface has ever rendered it. The engine was explaining itself to
          // nobody. Two lines max so a long reason cannot push the row height
          // around; the list must not reflow when it refreshes on the hour.
          <div style={whyOneLine
            ? { fontSize: 12.5, lineHeight: 1.35, color: "#B6C2CE", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }
            : { fontSize: 12.5, lineHeight: 1.35, color: "#B6C2CE", marginTop: 3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{why}</div>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: why ? 4 : 2, fontSize: 12.5, color: C.muted, flexWrap: "wrap" }}>{meta}</div>
      </div>
      {trailing}
    </>
  );
  const style = { display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "8px 2px", minHeight: TARGET, background: "transparent", border: "none", borderTop: "1px solid rgba(255,255,255,.06)", cursor: "pointer", textDecoration: "none" };
  return href
    ? <a href={href} target="_blank" rel="noreferrer" className="wf-bn-focus" style={style}>{inner}</a>
    : <button onClick={onClick} className="wf-bn-focus" style={style}>{inner}</button>;
}

const SellingFast = () => (
  <span style={{ flexShrink: 0, background: "#B33A2B", color: "#fff", fontSize: 9, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", borderRadius: 999, padding: "2px 7px" }}>Selling fast</span>
);

// v6.71 (Wave 2): same flame + threshold as the PlaceCard/Detail-sheet/Best
// Beaches signal — one meaning wherever a beach shows up. Compact form (no
// label) since Row's badge slot sits beside a title that's already ellipsized.
const Flame = () => (
  <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 800, color: "#FB923C" }} aria-label="Trending">🔥</span>
);

const STATUS_LABEL = { great: "Great beach day", great_uv_caution: "Great beach day · high UV", poor: "Not a beach day", unsafe: "Beach advisories active", too_far: null };

// Which section greets a visitor. Food is the default because it is the only
// rail that is answerable at every hour of the day — "top things to do" is
// empty-ish at 11pm, and an empty first impression is worse than a collapsed
// one. Set to null to restore the pre-2026-08-06 all-collapsed behaviour;
// scripts/check-home-answer-first.mjs asserts it is a real section id.
export const DEFAULT_SECTION = "eat";

export default function BestNearby({ center, weather, events, videoPlaces, onOpenPlace, onLog }) {
  // v6.57 (2026-08-06, owner): the FIRST section is open on arrival.
  //
  // MEASURED, not a preference. 259 single-page sessions landed on "/" in the
  // 14 days to 2026-08-05; the MEDIAN one lasted 10 seconds and 130 of them
  // ended inside those 10 seconds. The ranked list — the entire product — sat
  // below the events rail, below the link grid, inside a collapsed accordion.
  // `result_count_shown` fired 3,766 times in 30 days for a list almost nobody
  // scrolled far enough to open. A visitor was asked for ~15 decisions before
  // being shown one recommendation.
  //
  // Opening by default costs one Supabase read on mount (wf_best_picks, the
  // same read a tap already triggered) and removes the tap that was losing
  // them. `toggle` still closes it, so the accordion is not being deleted —
  // its default is being inverted.
  const [open, setOpen] = useState(DEFAULT_SECTION);
  // Reset when the section changes: "see all" is a statement about the list in
  // front of you, not a preference that should follow you into a different one.
  const [showAll, setShowAll] = useState(false); // "eat" | "todo" | "trends" | null
  const [rows, setRows] = useState({});
  const fetchedFor = useRef("");
  // v6.71 (Wave 2): "Top things to do" mixes beach rows in with tours and
  // attractions (wf_things_to_do); this batches the same popularity read the
  // rest of the app uses (wf_place_popularity_scored, keyed by place_id) for
  // whichever beach rows land in THIS list — one query per open, not per row.
  const [beachPop, setBeachPop] = useState({});
  // 2026-08-07 (owner: "a one-liner that says what the place is known for and why
  // to go"). This is the identity hook the main PlaceCard feed already renders,
  // brought onto the ranked list. TWO SOURCES, SAME PRECEDENCE AS THE MAIN FEED:
  //   1. /api/known-for — researched wf_editorial copy about THIS place (what it
  //      is known for). No model. WINS whenever it exists.
  //   2. /api/blurbs cacheOnly:true — the validated "Known for" line from the
  //      shared 30-day pool. RENDER-SAFE: reads only what the pool already holds,
  //      never generates while the reader waits (check-no-llm-in-render-path).
  // When neither has anything real, the row keeps its existing engine reason line
  // (reasonLine) — a row never LOSES text, and nothing generic is invented.
  const [hooks, setHooks] = useState({});
  useEffect(() => {
    const todo = rows.todo;
    if (!Array.isArray(todo) || !todo.length || !supabase) return;
    const ids = todo.filter((r) => r.kind !== "experience" && r.category === "beach").map((r) => r.id);
    if (!ids.length) return;
    let dead = false;
    (async () => {
      try {
        const { data } = await supabase.from("wf_place_popularity_scored").select("place_id,tier2_popularity").in("place_id", ids);
        if (dead || !data) return;
        setBeachPop((prev) => { const next = { ...prev }; for (const r of data) next[r.place_id] = r.tier2_popularity; return next; });
      } catch (e) {}
    })();
    return () => { dead = true; };
  }, [rows.todo]);

  // Resolve the "known for / why go" hook for the eat rows once they load.
  // Keyed on the row place_ids, so a new location re-resolves and a warm one
  // does not refetch. Both calls fail soft: on any error the row simply keeps
  // its reason line. The blurbs call is cacheOnly (render-path contract).
  useEffect(() => {
    const eat = rows.eat;
    if (!Array.isArray(eat) || !eat.length) return;
    const items = eat.filter((p) => p && p.place_id).map((p) => ({ id: p.place_id, name: p.name, type: p.primary_type || "", rating: p.rating, reviews: p.reviews }));
    const ids = items.map((p) => p.id);
    if (!ids.length) return;
    let dead = false;
    (async () => {
      const next = {};
      // 1) Researched editorial hook — wins where it exists.
      try {
        const r = await fetch("/api/known-for", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) });
        const d = await r.json();
        if (d && d.lines && typeof d.lines === "object") for (const id of ids) if (d.lines[id]) next[id] = d.lines[id];
      } catch (e) {}
      // 2) Validated generated "Known for" line from the shared pool. cacheOnly:
      //    true keeps this off the generation path — a page view never waits on
      //    a model. Only fills ids the editorial hook did not already answer.
      try {
        const r = await fetch("/api/blurbs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cacheOnly: true, city: "", places: items }) });
        const d = await r.json();
        if (d && d.blurbs && typeof d.blurbs === "object") for (const id of ids) if (!next[id] && d.blurbs[id]) { const b = d.blurbs[id]; next[id] = typeof b === "string" ? b : (b.card_line_1 || ""); }
      } catch (e) {}
      if (dead || !Object.keys(next).length) return;
      setHooks((prev) => ({ ...prev, ...next }));
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.isArray(rows.eat) ? rows.eat.map((p) => p && p.place_id).join(",") : ""]);

  // v6.72: nowContext is the single source of the hour AND the outdoor gate.
  // `now()` is a function, not a memo, so a rail opened at 17:29 and again at
  // 17:31 gets the two different buckets it should.
  const nowCtx = () => nowContext({ lat: center && center.lat, lng: center && center.lng, weather });
  const baseArgs = () => {
    const n = nowCtx();
    return {
      lat: center && center.lat, lng: center && center.lng,
      localHour: n.hour,
      tempF: weather && weather.temp != null ? weather.temp : null,
      condition: weather && weather.label ? weather.label : null,
    };
  };

  // Local trends: nearest beach ≤20mi (owner's "near"), its live conditions,
  // today's real events, and the grounded LLM brief. Every piece fails soft.
  const loadTrends = async () => {
    const { lat, lng } = baseArgs();
    const today = siteTodayStr();
    const todays = (events || []).filter((e) => e && e.name && e.date === today).slice(0, 8);
    let beach = null;
    try {
      if (supabase && isFinite(lat)) {
        const { data } = await supabase.rpc("wf_nearest_beaches", { p_lat: lat, p_lng: lng, p_radius_mi: 20, p_max: 1 });
        const b = Array.isArray(data) && data[0];
        if (b && b.name) {
          beach = { name: b.name, distance_mi: b.distance_mi, lat: b.lat, lng: b.lng };
          try {
            const r = await fetch("/api/beach/conditions?lat=" + b.lat + "&lng=" + b.lng + "&dist=" + b.distance_mi);
            const c = r.ok ? await r.json() : null;
            if (c) beach = { ...beach, status: c.status, reasons: c.reasons || [], waterTempF: c.conditions && c.conditions.waterTempF, waveHeightFt: c.conditions && c.conditions.waveHeightFt };
          } catch (e) {}
        }
      }
    } catch (e) {}
    let report = null;
    try {
      const r = await fetch("/api/local/report", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: null, events: todays.map((e) => ({ name: e.name, time: e.time, venue: e.venue || e.city })),
          weather: weather ? { temp: weather.temp, label: weather.label, sunset: weather.sunset } : null,
          beach,
        }),
      });
      const j = r.ok ? await r.json() : null;
      report = j && j.report ? j.report : null;
    } catch (e) {}
    return { kindOf: "trends", beach, todays, report };
  };

  const load = (id) =>
    id === "eat" ? fetchTodaysBest({ ...baseArgs(), category: "food", limit: 10 })
    : id === "todo" ? fetchThingsToDo({ ...baseArgs(), limit: 10 })
    : loadTrends();

  // Fetching a section, independent of what caused it to open. Pulled out of
  // toggle() so the default-open section on mount and a user's tap go through
  // exactly ONE loading path — two copies would drift, and the mount path is
  // now the one almost every visitor takes.
  const ensureLoaded = (id) => {
    if (!id) return;
    const centerKey = center ? center.lat.toFixed(3) + "," + center.lng.toFixed(3) : "";
    if (fetchedFor.current !== centerKey) { fetchedFor.current = centerKey; setRows({}); }
    setRows((r) => {
      if (r[id]) return r;
      // THE GATE, applied to whichever rail loaded. The "eat" rail is
      // unaffected in practice (restaurants read indoor), so this is one
      // call site rather than two branches that can drift apart.
      (async () => { const data = await load(id); setRows((r2) => ({ ...r2, [id]: gateOutdoor(data, nowCtx()) })); })();
      return { ...r, [id]: "loading" };
    });
  };

  // The default-open section cannot fetch until there is a location to rank
  // against, and `center` arrives asynchronously (saved wf_center, then URL,
  // then geolocation). So this waits for a real centre rather than firing a
  // request with lat=undefined — which is what an unconditional mount fetch
  // would have done, once per visitor, for nothing.
  useEffect(() => {
    if (!open) return;
    if (!center || !isFinite(center.lat) || !isFinite(center.lng)) return;
    ensureLoaded(open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, center && center.lat, center && center.lng]);

  const toggle = (id) => {
    const next = open === id ? null : id;
    setOpen(next);
    setShowAll(false);
    if (!next) return;
    // `trigger` separates a deliberate tap from the section that was already
    // open on arrival. Without it the default-open fire would silently inflate
    // best_nearby_open and make the before/after read on this change
    // uninterpretable — which is the only reason the change is being made.
    try { onLog && onLog("best_nearby_open", null, { section: id, trigger: "tap" }); } catch (e) {}
    ensureLoaded(id);
  };

  // Owner call: rows open OUR detail sheet (the same card the main menu
  // uses), never a Google tab. Tours still book out on Viator — that is the
  // product. Directions live inside the detail sheet.
  const openPlace = (p) => {
    try { onLog && onLog("best_nearby_detail", { id: p.id, name: p.name }); } catch (e) {}
    if (onOpenPlace) onOpenPlace(p);
    else { const u = directionsUrl(p); if (u) { try { window.open(u, "_blank", "noopener"); } catch (e) {} } }
  };

  // Owner (2026-07-21, late): Local trends is OFF for now — vertical budget
  // goes to the taller hero. All trends machinery stays; flip to bring back.
  const SHOW_TRENDS = false;
  const SECTIONS = [
    { id: "eat", label: "Best places to eat nearby", sub: "Ranked for this exact hour", icon: "food" },
    { id: "todo", label: "Top things to do", sub: "Tours, beaches and attractions, one list", icon: "attractions" },
    ...(SHOW_TRENDS ? [{ id: "trends", label: "Local trends", sub: "What creators are posting, plus your area right now", icon: "map" }] : []),
  ];

  const trendsBody = (d) => (
    <>
      {(videoPlaces || []).length ? (
        <div style={{ padding: "6px 2px 4px" }}>
          <div style={{ ...TYPE.eyebrow, fontSize: 10, color: C.muted, marginBottom: 2 }}>Creators are posting about these</div>
          {(videoPlaces || []).map(({ p, videos }, i) => (
            <button key={p.id} onClick={() => openPlace(p)} className="wf-bn-focus" style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "7px 0", minHeight: TARGET, background: "transparent", border: "none", borderTop: i ? "1px solid rgba(255,255,255,.05)" : "none", cursor: "pointer" }}>
              <Medal i={i} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 2, flexWrap: "wrap" }}>
                  {[...new Set(videos.map((v) => v.platform))].slice(0, 3).map((pl) => PLATFORM[pl] ? (
                    <span key={pl} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 800, color: PLATFORM[pl].color }}>
                      <span style={{ width: 6, height: 6, borderRadius: 3, background: PLATFORM[pl].color, display: "inline-block" }} />{PLATFORM[pl].label}
                    </span>
                  ) : null)}
                  {videos[0] && videos[0].creator ? <span style={{ fontSize: 11, color: C.muted }}>{videos[0].creator}</span> : null}
                  <PlaceScoreChip p={p} size={11.5} />
                </div>
              </div>
              <span aria-hidden="true" style={{ flexShrink: 0, color: "rgba(255,255,255,.3)" }}>›</span>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ padding: "8px 2px 2px", fontSize: 12.5, color: C.muted }}>No creator videos linked near you yet — they appear here the moment one is.</div>
      )}
      {d.report ? (
        <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.55, padding: "8px 2px 4px", borderTop: "1px solid rgba(255,255,255,.06)" }}>{d.report}</div>
      ) : null}
      {d.beach && d.beach.status && STATUS_LABEL[d.beach.status] !== null ? (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 2px", borderTop: "1px solid rgba(255,255,255,.06)" }}>
          <NavIcon name="beach" size={20} strokeWidth={1.6} color={C.blue} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{STATUS_LABEL[d.beach.status] || "Beach nearby"} · {d.beach.name}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              {[isFinite(d.beach.distance_mi) ? d.beach.distance_mi.toFixed(1) + " mi" : null,
                isFinite(d.beach.waterTempF) ? "water " + Math.round(d.beach.waterTempF) + "°" : null,
                isFinite(d.beach.waveHeightFt) ? "waves " + d.beach.waveHeightFt + " ft" : null,
                ...(d.beach.reasons || []).slice(0, 1)].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>
      ) : null}
      {d.todays.length ? (
        <div style={{ borderTop: "1px solid rgba(255,255,255,.06)", padding: "8px 2px 2px" }}>
          <div style={{ ...TYPE.eyebrow, fontSize: 10, color: C.muted, marginBottom: 4 }}>Today</div>
          {d.todays.map((e, i) => (
            <div key={e.id || i} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "5px 0", fontSize: 13 }}>
              <span style={{ color: C.light, fontWeight: 800, fontSize: 11.5, flexShrink: 0, minWidth: 52 }}>{e.time || "Today"}</span>
              <span style={{ color: C.text, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
              {e.venue || e.city ? <span style={{ color: C.muted, fontSize: 11.5, flexShrink: 0 }}>· {e.venue || e.city}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
      
    </>
  );

  // Built here, not in JSX, so the honesty rules are readable in one place.
  const headline = (() => {
    const ctx = nowCtx();
    const openList = Array.isArray(rows[open]) ? rows[open] : [];
    const n = openList.length;
    // The COUNT clause is dropped entirely while loading or empty. A headline
    // that says "0 places scored" is worse than a headline with no count, and
    // one that says "30" when the engine returned 12 is worse than both.
    const factors = "scored on reviews, distance and time of day";
    return {
      // HONESTY FIX (owner-reported 2026-08-07: Rocco's Tacos & Tequila Bar
      // under "Open now" at 7am). Nothing in the engine checks opening hours —
      // wf_best_picks filters permanently-closed status only — so the header
      // must not claim "Open now" until an hours engine exists (scoped: hours
      // column + open-now filter + freshness cron). "The best near you" is
      // what the list actually is; the hour framing stays because the daypart
      // fit is real.
      lead: open === "todo" ? "Things to do near you," : "The best near you,",
      tail: "ranked for " + hourLabel(ctx.hour) + " " + ctx.dayName + ".",
      sub: (n ? n + " places " + factors : "Ranked " + factors) + " · no paid placement",
    };
  })();

  return (
    <section aria-label="Best nearby" style={{ position: "relative", overflow: "hidden", background: "linear-gradient(145deg, #101722 0%, #0A0E15 72%)", border: "1px solid #293442", borderRadius: 19, padding: "4px 14px", marginBottom: 12, boxShadow: "inset 0 1px 0 rgba(255,255,255,.045), 0 12px 30px rgba(0,0,0,.2)" }}>
      <style dangerouslySetInnerHTML={{ __html: `.wf-bn-focus:focus-visible{outline:${FOCUS.outline};outline-offset:${FOCUS.outlineOffset}}` }} />
      {/* v6.97 — THE ANSWER, stated before anything is asked of the reader.
          This replaced an eyebrow that read "Nearby, right now / Updated for
          this hour": true, but it described the section instead of answering
          the question, and a stranger who lands here has about ten seconds.
          Every number in it is real — the hour and day come from the same
          nowContext() the ranking uses, and the count is the length of the
          list actually rendered below, never a round figure. */}
      <div style={{ padding: "13px 1px 11px" }}>
        <h2 style={{ margin: 0, fontSize: 21, fontWeight: 820, letterSpacing: "-.7px", lineHeight: 1.16, color: C.text }}>
          {headline.lead}
          <br />
          <span style={{ background: "linear-gradient(120deg, #FDA60A, #FB3502)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{headline.tail}</span>
        </h2>
        <div style={{ marginTop: 6, fontSize: 11.5, color: "#7F8DA0", lineHeight: 1.4 }}>{headline.sub}</div>
      </div>
      {SECTIONS.map((sdef, si) => {
        const isOpen = open === sdef.id;
        const data = rows[sdef.id];
        const list = Array.isArray(data) ? data : [];
        return (
          <div key={sdef.id} style={{ borderTop: si ? "1px solid rgba(255,255,255,.07)" : "none", borderLeft: isOpen ? `2px solid ${C.accent}` : "2px solid transparent", background: isOpen ? "linear-gradient(90deg, rgba(249,115,22,.075), transparent 70%)" : "transparent", transition: "border-color .22s ease, background .22s ease" }}>
            <button onClick={() => toggle(sdef.id)} aria-expanded={isOpen} className="wf-bn-focus" style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", background: "transparent", border: "none", padding: "13px 2px 13px 10px", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
              <span style={{ width: 29, height: 29, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: 9, background: isOpen ? "rgba(249,115,22,.1)" : "rgba(255,255,255,.028)" }}><NavIcon name={sdef.icon} size={21} strokeWidth={1.7} color={isOpen ? C.light : "#E7EDF5"} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 15.2, fontWeight: 740, letterSpacing: "-.08px", color: isOpen ? "#FFF3E8" : C.text, lineHeight: 1.25 }}>{sdef.label}</span>
                <span style={{ display: "block", fontSize: 11.5, color: "#8D9AAB", marginTop: 2 }}>{sdef.sub}</span>
              </span>
              <span aria-hidden="true" style={{ width: 24, height: 24, flexShrink: 0, color: isOpen ? C.light : "rgba(255,255,255,.42)", display: "grid", placeItems: "center", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .22s ease" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
              </span>
            </button>
            <div style={{ overflow: "hidden", maxHeight: isOpen ? 10 * ROW_MAX_H + 220 : 0, opacity: isOpen ? 1 : 0, transition: "max-height .3s cubic-bezier(.4,0,.2,1), opacity .22s ease" }}>
              <div style={{ padding: "0 2px 12px 12px" }}>
                {data === "loading" ? (
                  <>
                    <div className="wf-sk" style={{ height: 46, borderRadius: 9, margin: "8px 0" }} />
                    <div className="wf-sk" style={{ height: 46, borderRadius: 9, margin: "8px 0" }} />
                    <div className="wf-sk" style={{ height: 46, borderRadius: 9, margin: "8px 0" }} />
                  </>
                ) : sdef.id === "trends" && data && data.kindOf === "trends" ? (
                  trendsBody(data)
                ) : list.length ? (
                  <>
                    {/* Mood chips at the TOP of the eat section (owner 2026-08-07:
                        "place the mood on top not the bottom") — switch the mood
                        before scanning the list. Still real ranked routes only. */}
                    {sdef.id === "eat" ? (
                      <div style={{ marginTop: 2, marginBottom: 12 }}>
                        <div style={{ ...TYPE.eyebrow, fontSize: 10, color: C.muted, marginBottom: 7 }}>Or change the mood</div>
                        <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 2, WebkitOverflowScrolling: "touch" }}>
                          {MOODS.map((m) => m.href ? (
                            <a key={m.label} href={m.href} className="wf-bn-focus"
                              onClick={() => { try { onLog && onLog("best_nearby_mood", null, { mood: m.label }); } catch (e) {} }}
                              style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", minHeight: 34, padding: "0 12px", borderRadius: 9, background: "#121A23", border: "1px solid " + C.line, color: "#C9D4DF", fontSize: 12, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>
                              {m.label}
                            </a>
                          ) : (
                            <span key={m.label} aria-current="true"
                              style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", minHeight: 34, padding: "0 12px", borderRadius: 9, background: "linear-gradient(160deg,#FDA60A,#FB3502)", color: "#fff", fontSize: 12, fontWeight: 750, whiteSpace: "nowrap" }}>
                              {m.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {sdef.id === "eat"
                      ? (showAll ? list : list.slice(0, HEAD_COUNT)).map((p, i) => (
                          <Row key={p.place_id} i={i} thumb={tbPhotoUrl(p.photo_ref, 240)} title={p.name} whyOneLine={!!toHookLine(hooks[p.place_id], p.name)} why={toHookLine(hooks[p.place_id], p.name) || reasonLine(p.reasons)}
                            onClick={() => openPlace({ id: p.place_id, name: p.name, lat: p.lat, lng: p.lng, rating: p.rating, reviews: p.reviews, photo: tbPhotoUrl(p.photo_ref, 640) })}
                            meta={<>
                              {isFinite(p.distance_mi) ? <span>{p.distance_mi < 10 ? p.distance_mi.toFixed(1) : Math.round(p.distance_mi)} mi</span> : null}
                              <PlaceScoreChip p={p} size={12} />
                            </>}
                            trailing={<span aria-hidden="true" style={{ flexShrink: 0, color: "rgba(255,255,255,.3)" }}>›</span>} />
                        ))
                      : (showAll ? list : list.slice(0, HEAD_COUNT)).map((r, i) => r.kind === "experience" ? (
                          <Row key={r.id} i={i} href={r.booking_url} thumb={r.image_url || null} title={r.title} why={reasonLine([r.subtitle])}
                            badge={r.selling_out ? <SellingFast /> : null}
                            meta={<>
                              <PlaceScoreChip p={{ rating: r.rating, reviews: r.reviews }} size={12} />
                              {r.price_from != null ? <span style={{ color: C.green, fontWeight: 700 }}>from ${r.price_from}</span> : null}
                              {fmtDur(r.duration_min) ? <span>{fmtDur(r.duration_min)}</span> : null}
                            </>}
                            trailing={<span style={{ flexShrink: 0, background: C.accent, color: "#0D1117", borderRadius: 999, padding: "5px 11px", fontSize: 11, fontWeight: 800 }}>Book ↗</span>} />
                        ) : (
                          <Row key={r.id} i={i} thumb={tbPhotoUrl(r.photo_ref, 240)} title={r.title} why={reasonLine([r.subtitle])}
                            onClick={() => openPlace({ id: r.id, name: r.title, category: r.category, rating: r.rating, reviews: r.reviews, photo: tbPhotoUrl(r.photo_ref, 640) })}
                            badge={r.category === "beach" && beachPop[r.id] != null && beachPop[r.id] >= TRENDING_POPULARITY_THRESHOLD ? <Flame /> : null}
                            meta={<>
                              {isFinite(r.distance_mi) ? <span>{r.distance_mi < 10 ? r.distance_mi.toFixed(1) : Math.round(r.distance_mi)} mi</span> : null}
                              <PlaceScoreChip p={r} size={12} />
                            </>}
                            trailing={<span aria-hidden="true" style={{ flexShrink: 0, color: "rgba(255,255,255,.3)" }}>›</span>} />
                        ))}
                    {/* v6.97 — the rest of the list, in place. The count is
                        list.length, so it can never over-promise: if the engine
                        returned 12 near you, this says 12. */}
                    {!showAll && list.length > HEAD_COUNT ? (
                      <button
                        onClick={() => { setShowAll(true); try { onLog && onLog("best_nearby_see_all", null, { section: sdef.id, total: list.length }); } catch (e) {} }}
                        className="wf-bn-focus"
                        style={{ display: "block", width: "100%", marginTop: 10, padding: "11px 0", minHeight: TARGET, background: "transparent", border: "1px solid rgba(249,115,22,.35)", borderRadius: 10, color: C.accent, fontSize: 12.5, fontWeight: 750, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
                      >
                        See all {list.length} ranked near you →
                      </button>
                    ) : null}
                    {showAll && list.length > HEAD_COUNT ? (
                      <button
                        onClick={() => setShowAll(false)}
                        className="wf-bn-focus"
                        style={{ display: "block", width: "100%", marginTop: 10, padding: "10px 0", minHeight: TARGET, background: "transparent", border: "1px solid rgba(255,255,255,.12)", borderRadius: 10, color: C.muted, fontSize: 12.5, fontWeight: 700, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
                      >
                        Show fewer
                      </button>
                    ) : null}
                    {sdef.id === "todo" && list.some((r) => r.kind === "experience") ? (
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 1.4 }}>Tours &amp; activities are affiliate links; Wayfind may earn a commission at no cost to you. It never changes what we recommend.</div>
                    ) : null}
                  </>
                ) : Array.isArray(data) ? (
                  <div style={{ padding: "8px 2px 10px", fontSize: 12.5, color: C.muted }}>Nothing strong here right now.</div>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
