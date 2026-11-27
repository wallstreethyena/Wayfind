"use client";
// The interactive itinerary builder (owner, 2026-11-27). State lives here and
// in this browser only (localStorage, wrapped in try/catch: a private window
// simply starts fresh). Every stop comes from /api/plan-my-day, which only
// returns real Wayfind places and events; this file never invents one.
// Travel lines are labeled estimates from lib/travelEstimate.js, each paired
// with a real Apple Maps route link. Ticket buttons use the exact partner
// href the server returned, so attribution is the same as on the cards.
import { useCallback, useEffect, useRef, useState } from "react";
import { travelEstimate, legDirectionsUrl } from "../../lib/travelEstimate.js";

const STORE_KEY = "wf_itinerary_v1";
const PREFS_KEY = "wf_planner_prefs_v1"; // the visitor's last request in this browser only, so the next visit starts where they left off
const MAX_STOPS = 6;
const T = {
  card: "#161B22", card2: "#1C2230", border: "#2D3748", text: "#F1F5F9", muted: "#94A3B8", light: "#CBD5E1",
  accent: "#F97316", gold: "#FBBF24", green: "#22C55E",
};
const btn = (on) => ({
  minHeight: 40, padding: "8px 14px", borderRadius: 999, border: `1px solid ${on ? T.accent : T.border}`,
  background: on ? "rgba(249,115,22,.14)" : T.card2, color: on ? "#FDBA74" : T.light, fontSize: 14, fontWeight: 800, cursor: "pointer",
});
const iconBtn = { minWidth: 40, minHeight: 40, borderRadius: 10, border: `1px solid ${T.border}`, background: T.card2, color: T.light, fontSize: 16, fontWeight: 900, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" };

function readStore() {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const v = raw ? JSON.parse(raw) : null;
    if (!v || !v.itinerary || !Array.isArray(v.itinerary.days)) return null;
    // A plan whose last day has passed is not brought back.
    const d = new Date();
    const today = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    return v.itinerary.endDate && v.itinerary.endDate < today ? null : v;
  } catch { return null; }
}
function writeStore(v) {
  try { if (v) window.localStorage.setItem(STORE_KEY, JSON.stringify(v)); else window.localStorage.removeItem(STORE_KEY); } catch { /* storage off */ }
}

function readPrefs() {
  try {
    const v = JSON.parse(window.localStorage.getItem(PREFS_KEY) || "null");
    return v && typeof v === "object" ? v : null;
  } catch { return null; }
}
function writePrefs(v) {
  try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(v)); } catch { /* storage off */ }
}

function retravel(stops) {
  return stops.map((s, i) => {
    const next = stops[i + 1];
    const est = next ? travelEstimate(s, next) : null;
    return { ...s, travelToNext: est ? { ...est, directions: legDirectionsUrl(s, next) } : null };
  });
}

function Stop({ stop, index, count, edited, onMove, onRemove, onSwap, dragProps, dragging }) {
  const time = stop.fixedTime ? `Starts ${stop.fixedTime}` : (!edited && stop.slot ? `Suggested ${stop.slot}` : null);
  return (
    <li data-stop-id={stop.id} style={{ listStyle: "none", opacity: dragging ? 0.6 : 1 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: T.card, border: `1px solid ${dragging ? T.accent : T.border}`, borderRadius: 14, padding: 12 }}>
        <button type="button" aria-label={`Drag to reorder ${stop.name}`} {...dragProps} style={{ ...iconBtn, cursor: "grab", touchAction: "none", flex: "0 0 auto" }}>≡</button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={{ color: T.accent, fontWeight: 900, fontSize: 13 }}>{index + 1}</span>
            {stop.href
              ? <a href={stop.href} style={{ color: T.text, fontWeight: 900, fontSize: 16, textDecoration: "none", overflowWrap: "anywhere" }}>{stop.name}</a>
              : <span style={{ color: T.text, fontWeight: 900, fontSize: 16, overflowWrap: "anywhere" }}>{stop.name}</span>}
          </div>
          <div style={{ color: T.muted, fontSize: 12.5, marginTop: 2 }}>{[time, stop.type, stop.city, stop.price].filter(Boolean).join(" · ")}</div>
          {stop.why ? <p style={{ margin: "6px 0 0", color: T.light, fontSize: 13.5, lineHeight: 1.45 }}>{stop.why}</p> : null}
          {stop.hoursNote ? <div style={{ color: T.gold, fontSize: 12, marginTop: 4 }}>{stop.hoursNote}</div> : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {stop.ticket ? <a href={stop.ticket.href} target="_blank" rel="sponsored nofollow noopener" data-plan-ticket="" style={{ ...btn(true), display: "inline-flex", alignItems: "center", textDecoration: "none", background: "#FBBF24", color: "#111827", border: "1px solid #FBBF24" }}>{stop.ticket.label}</a> : null}
            {stop.href ? <a href={stop.href} style={{ ...btn(false), display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Details</a> : null}
            {stop.alt ? <button type="button" onClick={onSwap} style={btn(false)}>Or try {stop.alt.name}</button> : null}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "0 0 auto" }}>
          <button type="button" aria-label={`Move ${stop.name} up`} disabled={index === 0} onClick={() => onMove(-1)} style={{ ...iconBtn, opacity: index === 0 ? 0.35 : 1 }}>▲</button>
          <button type="button" aria-label={`Move ${stop.name} down`} disabled={index === count - 1} onClick={() => onMove(1)} style={{ ...iconBtn, opacity: index === count - 1 ? 0.35 : 1 }}>▼</button>
          <button type="button" aria-label={`Remove ${stop.name}`} onClick={onRemove} style={iconBtn}>×</button>
        </div>
      </div>
      {stop.travelToNext ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", color: T.muted, fontSize: 12.5, padding: "8px 4px 8px 22px" }}>
          <span aria-hidden="true">{stop.travelToNext.mode === "walk" ? "🚶" : "🚗"}</span>
          <span>{stop.travelToNext.label}</span>
          {stop.travelToNext.directions ? <a href={stop.travelToNext.directions} target="_blank" rel="noopener" style={{ color: T.light, fontWeight: 800 }}>Route ↗</a> : null}
        </div>
      ) : <div style={{ height: 10 }} />}
    </li>
  );
}

function Day({ day, dayIdx, pool, onChange, onAdd }) {
  const listRef = useRef(null);
  const [drag, setDrag] = useState(null); // { id }
  const [adding, setAdding] = useState(false);

  const move = (from, to) => {
    if (to < 0 || to >= day.stops.length || from === to) return;
    const next = day.stops.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange({ ...day, edited: true, stops: retravel(next) });
  };
  const onPointerMove = (e) => {
    if (!drag || !listRef.current) return;
    const from = day.stops.findIndex((s) => s.id === drag.id);
    // Target = how many OTHER stops sit above the pointer's midline.
    const others = [...listRef.current.querySelectorAll("li[data-stop-id]")].filter((el) => el.getAttribute("data-stop-id") !== drag.id);
    let to = 0;
    for (const el of others) { const r = el.getBoundingClientRect(); if (e.clientY > r.top + r.height / 2) to += 1; }
    if (from !== -1 && to !== from) move(from, to);
  };
  const dragProps = (stop) => ({
    onPointerDown: (e) => { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* old browser */ } setDrag({ id: stop.id }); },
    onPointerMove,
    onPointerUp: () => setDrag(null),
    onPointerCancel: () => setDrag(null),
    onKeyDown: (e) => {
      const i = day.stops.findIndex((s) => s.id === stop.id);
      if (e.key === "ArrowUp") { e.preventDefault(); move(i, i - 1); }
      if (e.key === "ArrowDown") { e.preventDefault(); move(i, i + 1); }
    },
  });

  return (
    <section aria-label={day.label} style={{ marginTop: 22 }}>
      <h2 style={{ fontSize: 18, color: "#F8FAFC", margin: "0 0 10px", fontWeight: 900 }}>{day.label}</h2>
      {day.stops.length ? (
        <ol ref={listRef} style={{ margin: 0, padding: 0 }}>
          {day.stops.map((s, i) => (
            <Stop key={s.id} stop={s} index={i} count={day.stops.length} edited={!!day.edited} dragging={drag && drag.id === s.id}
              dragProps={dragProps(s)}
              onMove={(dir) => move(i, i + dir)}
              onRemove={() => onChange({ ...day, edited: true, stops: retravel(day.stops.filter((x) => x.id !== s.id)) }, s)}
              onSwap={() => {
                const alt = { ...s.alt, alt: null, why: s.alt.why || null };
                const next = day.stops.map((x) => (x.id === s.id ? alt : x));
                onChange({ ...day, edited: true, stops: retravel(next) }, { ...s, alt: null }, alt.id);
              }} />
          ))}
        </ol>
      ) : <p style={{ color: T.muted, fontSize: 14 }}>No stops yet. Add one below.</p>}
      {day.stops.length < MAX_STOPS && pool.length ? (
        <div style={{ marginTop: 4 }}>
          <button type="button" onClick={() => setAdding((v) => !v)} aria-expanded={adding} style={btn(adding)}>{adding ? "Close" : "+ Add a stop"}</button>
          {adding ? (
            <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "grid", gap: 8 }}>
              {pool.slice(0, 10).map((p) => (
                <li key={p.id} style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 12px" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: T.text, fontWeight: 800, fontSize: 14, overflowWrap: "anywhere" }}>{p.name}</div>
                    <div style={{ color: T.muted, fontSize: 12 }}>{[p.fixedTime ? "Starts " + p.fixedTime : null, p.type, p.city].filter(Boolean).join(" · ")}</div>
                  </div>
                  <button type="button" onClick={() => { onAdd(dayIdx, p); setAdding(false); }} style={{ ...btn(false), flex: "0 0 auto" }}>Add</button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default function ItineraryBuilder({ areas, whens, vibes }) {
  const [mode, setMode] = useState("notes");
  const [area, setArea] = useState("sarasota");
  const [when, setWhen] = useState("today");
  const [vibe, setVibe] = useState("easy");
  const [notes, setNotes] = useState("");
  const [state, setState] = useState(null); // { itinerary, pool, unmatched }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const resultRef = useRef(null);

  useEffect(() => { const saved = readStore(); if (saved) setState(saved); }, []);
  useEffect(() => {
    const p = readPrefs();
    if (!p) return;
    if (p.mode === "picks" || p.mode === "notes") setMode(p.mode);
    if (typeof p.area === "string" && areas.some((a) => a.slug === p.area)) setArea(p.area);
    if (typeof p.when === "string" && whens.some((w) => w.id === p.when)) setWhen(p.when);
    if (typeof p.vibe === "string" && vibes.some((v) => v.id === p.vibe)) setVibe(p.vibe);
    if (typeof p.notes === "string") setNotes(p.notes.slice(0, 1200));
  }, [areas, whens, vibes]);
  useEffect(() => { writeStore(state); }, [state]);

  const build = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const payload = mode === "notes" ? { notes } : { area, when, vibe };
      writePrefs({ mode, area, when, vibe, notes: notes.slice(0, 1200) });
      const r = await fetch("/api/plan-my-day", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json().catch(() => null);
      if (!d || !d.ok) { setError((d && d.message) || "Something went wrong. Try again."); return; }
      setState({ itinerary: d.itinerary, pool: d.pool || [], unmatched: d.unmatched || [], weather: d.weather && typeof d.weather.note === "string" ? { note: d.weather.note } : null });
      setTimeout(() => { try { resultRef.current && resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" }); } catch { /* ignore */ } }, 50);
    } catch {
      setError("You look offline. Check your connection and try again.");
    } finally { setBusy(false); }
  }, [mode, notes, area, when, vibe]);

  const changeDay = (dayIdx, nextDay, removed, takenFromPoolId) => {
    setState((cur) => {
      if (!cur) return cur;
      const days = cur.itinerary.days.map((d, i) => (i === dayIdx ? nextDay : d));
      let pool = cur.pool.filter((p) => p.id !== takenFromPoolId);
      if (removed && !pool.some((p) => p.id === removed.id)) pool = [{ ...removed, travelToNext: null }, ...pool];
      return { ...cur, itinerary: { ...cur.itinerary, days }, pool };
    });
  };
  const addStop = (dayIdx, p) => {
    setState((cur) => {
      if (!cur) return cur;
      const days = cur.itinerary.days.map((d, i) => (i === dayIdx ? { ...d, edited: true, stops: retravel([...d.stops, { ...p, alt: null }]) } : d));
      return { ...cur, itinerary: { ...cur.itinerary, days }, pool: cur.pool.filter((x) => x.id !== p.id) };
    });
  };
  const it = state && state.itinerary;
  return (
    <div>
      <div role="tablist" aria-label="How to start" style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button type="button" role="tab" aria-selected={mode === "notes"} onClick={() => setMode("notes")} style={btn(mode === "notes")}>Just tell us</button>
        <button type="button" role="tab" aria-selected={mode === "picks"} onClick={() => setMode("picks")} style={btn(mode === "picks")}>Quick picks</button>
      </div>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 14 }}>
        {mode === "picks" ? (
          <div style={{ display: "grid", gap: 14 }}>
            <label style={{ display: "grid", gap: 6, color: T.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em" }}>
              City
              <select value={area} onChange={(e) => setArea(e.target.value)} style={{ minHeight: 44, borderRadius: 12, border: `1px solid ${T.border}`, background: T.card2, color: T.text, fontSize: 16, padding: "0 12px" }}>
                {areas.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
              </select>
            </label>
            <div>
              <div style={{ color: T.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Day</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{whens.map((w) => <button key={w.id} type="button" aria-pressed={when === w.id} onClick={() => setWhen(w.id)} style={btn(when === w.id)}>{w.label}</button>)}</div>
            </div>
            <div>
              <div style={{ color: T.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Vibe</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{vibes.map((v) => <button key={v.id} type="button" aria-pressed={vibe === v.id} onClick={() => setVibe(v.id)} style={btn(vibe === v.id)}>{v.label}</button>)}</div>
            </div>
          </div>
        ) : (
          <label style={{ display: "grid", gap: 6, color: T.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em" }}>
            Who's going, where, budget and mood
            <textarea value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 1200))} rows={4}
              placeholder="Rainy Saturday with two kids near Tampa, under $100. Or: Orlando Dec 12 to 14, Christmas lights and cheap dinners, no theme parks."
              style={{ width: "100%", boxSizing: "border-box", borderRadius: 12, border: `1px solid ${T.border}`, background: T.card2, color: T.text, fontSize: 16, padding: 12, lineHeight: 1.45, resize: "vertical", fontFamily: "inherit", textTransform: "none", letterSpacing: "normal", fontWeight: 500 }} />
            <span style={{ textTransform: "none", letterSpacing: "normal", fontWeight: 600, color: T.muted }}>{notes.length}/1200 · One day or up to 4. We check the forecast and lean indoors when it calls for rain or heat. Name places you want and we add them when Wayfind has them.</span>
          </label>
        )}
        <button type="button" onClick={build} disabled={busy || (mode === "notes" && notes.trim().length < 8)}
          style={{ marginTop: 16, width: "100%", minHeight: 48, borderRadius: 14, border: "none", background: busy ? "#7C2D12" : T.accent, color: "#fff", fontSize: 16, fontWeight: 900, cursor: busy ? "wait" : "pointer" }}>
          {busy ? "Building your plan…" : it ? "Build a new plan" : "Build my plan"}
        </button>
        {error ? <p role="alert" style={{ color: "#FCA5A5", fontSize: 14, margin: "10px 0 0" }}>{error}</p> : null}
      </div>

      {it ? (
        <div ref={resultRef} aria-live="polite" style={{ marginTop: 26, scrollMarginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: 24, margin: 0, color: "#F8FAFC", fontWeight: 900 }}>{it.title}</h2>
              {it.intro ? <p style={{ color: T.light, margin: "6px 0 0", fontSize: 14.5 }}>{it.intro}</p> : null}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setState(null)} style={btn(false)}>Clear</button>
            </div>
          </div>
          {state.weather && state.weather.note ? (
            <p role="note" style={{ color: "#BAE6FD", background: "rgba(14,165,233,.10)", border: "1px solid rgba(56,189,248,.35)", borderRadius: 12, padding: "8px 12px", fontSize: 13.5, margin: "12px 0 0" }}>{state.weather.note}</p>
          ) : null}
          {state.unmatched && state.unmatched.length ? (
            <p style={{ color: T.gold, fontSize: 13, margin: "10px 0 0" }}>Not on Wayfind yet, so not added: {state.unmatched.join(", ")}.</p>
          ) : null}
          {it.days.map((d, i) => (
            <Day key={(d.date || "") + i} day={d} dayIdx={i} pool={state.pool}
              onChange={(nd, removed, takenId) => changeDay(i, nd, removed, takenId)} onAdd={addStop} />
          ))}
          <p style={{ color: T.muted, fontSize: 12, marginTop: 18 }}>Travel times are estimates from distance; tap Route for live directions. Times and hours can change, so check each stop before you go. Ticket links may earn Wayfind a commission at no cost to you.</p>
        </div>
      ) : null}
    </div>
  );
}
