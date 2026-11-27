"use client";
// Wayfind Live Trips — the shared itinerary screen (owner order 2026-11-27).
// Everyone on the trip edits the same itinerary; changes appear for everyone
// in about a second, and edits made offline are kept on the device and sent
// when the connection is back. Sync engine: lib/liveTripSync.js. Rules:
// lib/liveTrip.js. Offline storage: lib/liveTripStore.js. Service worker:
// public/trips-sw.js. Design: https://claude.ai/artifact/EoyYytVrKH5BwTsvgZB9ib
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// The Supabase client loads on demand (lib/lazySupabase.js), the same way the
// rest of the site does, so @supabase/supabase-js never joins the homepage's
// first-load bundle through this route.
import { getSupabase } from "../../../lib/lazySupabase.js";
import { signInUrlWithReturn } from "../../../lib/authReturn.js";
import { GROUP_PLAN_CSS } from "../../group-plans/GroupFrame.js";
import { activeSeasonalMark, NORMAL_MARK } from "../../../lib/seasonalBrand.js";
import { styleHtml } from "../../../lib/styleHtml.js";
import { orderedItems, itemsForDay, posAfter, randomId } from "../../../lib/liveTrip.js";
import { createLiveTripSync } from "../../../lib/liveTripSync.js";
import { createLiveTripStore } from "../../../lib/liveTripStore.js";
import { createLiveTripTransport, liveTripRequest } from "../../../lib/liveTripTransport.js";
import { addCalendarDays, formatStopDate } from "../../../lib/tripDays.js";
import SafeImg from "../../components/SafeImg";
import { railPhotoSrc } from "../../../lib/cardPhotoRequest";

const ID_RE = /^\/trips\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;
const JOIN_KEY = (id) => "wf_live_join:" + id;
const NOTE_DEBOUNCE_MS = 700;
const MAX_DAYS_SHOWN = 21;

const LT_CSS = `
.lt-head{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin:4px 0 6px}
.lt-title{background:none;border:0;color:var(--gp-text);font:inherit;font-size:clamp(26px,6vw,40px);font-weight:900;letter-spacing:-.8px;line-height:1.1;padding:0;text-align:left;cursor:text;overflow-wrap:anywhere;min-height:44px}
.lt-title-input{font:inherit;font-size:clamp(22px,5vw,32px);font-weight:900;width:100%;background:var(--gp-field);color:var(--gp-text);border:1px solid var(--gp-accent);border-radius:12px;padding:8px 12px}
.lt-sub{color:var(--gp-muted);font-size:14px;margin:0 0 12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.lt-pill{display:inline-flex;align-items:center;gap:6px;border-radius:99px;padding:5px 11px;font-size:12px;font-weight:800;border:1px solid var(--gp-border);background:var(--gp-card);color:var(--gp-light);white-space:nowrap}
.lt-pill i{width:8px;height:8px;border-radius:50%;background:currentColor;display:inline-block}
.lt-pill.live{color:#86EFAC;border-color:rgba(34,197,94,.45)}.lt-pill.off{color:#FCD34D;border-color:rgba(251,191,36,.45)}.lt-pill.bad{color:#FCA5A5;border-color:rgba(239,68,68,.45)}
.lt-people{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.lt-ava{width:32px;height:32px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:900;font-size:13px;color:#040810;border:2px solid var(--gp-bg);position:relative}
.lt-ava.away{opacity:.38}
.lt-ava.here::after{content:"";position:absolute;right:-2px;bottom:-2px;width:10px;height:10px;border-radius:50%;background:#22C55E;border:2px solid var(--gp-bg)}
.lt-dates{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 4px}
.lt-dates label{display:grid;gap:4px;font-size:12px;font-weight:700;color:var(--gp-muted)}
.lt-dates input{font:inherit;font-size:16px;background:var(--gp-field);color:var(--gp-text);border:1px solid var(--gp-border);border-radius:10px;padding:8px 10px;min-height:44px;color-scheme:dark}
.lt-day{margin:22px 0 8px}
.lt-day h2{display:flex;align-items:baseline;gap:10px;font-size:18px;margin:0 0 10px}
.lt-day h2 small{color:var(--gp-muted);font-size:13px;font-weight:700}
.lt-stop{display:grid;grid-template-columns:64px 1fr;gap:12px;padding:12px;border:1px solid var(--gp-border);border-radius:16px;background:var(--gp-panel);margin:0 0 10px;min-width:0;position:relative;transition:border-color .2s}
.lt-stop.pending{border-style:dashed}
.lt-stop.flash{border-color:var(--gp-accent)}
.lt-stop.done .lt-name{text-decoration:line-through;color:var(--gp-muted)}
.lt-ph{width:64px;height:64px;border-radius:12px;object-fit:cover;background:var(--gp-card);display:block}
.lt-ph.none{display:flex;align-items:center;justify-content:center;font-size:24px}
.lt-name{font-weight:800;font-size:15px;line-height:1.3;margin:0;overflow-wrap:anywhere}
.lt-name a{color:inherit;text-decoration:none}
.lt-addr{color:var(--gp-muted);font-size:12px;margin:2px 0 0;overflow-wrap:anywhere}
.lt-ctrl{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;align-items:center}
.lt-ib{min-width:44px;min-height:40px;border-radius:10px;border:1px solid var(--gp-border);background:var(--gp-card);color:var(--gp-text);font:inherit;font-size:15px;font-weight:800;cursor:pointer;padding:0 10px}
.lt-ib:disabled{opacity:.35;cursor:default}
.lt-ib.on{border-color:rgba(34,197,94,.6);color:#86EFAC}
.lt-sel,.lt-time{font:inherit;font-size:14px;min-height:40px;background:var(--gp-field);color:var(--gp-text);border:1px solid var(--gp-border);border-radius:10px;padding:0 8px;max-width:150px;color-scheme:dark}
.lt-note{grid-column:1/-1;font:inherit;font-size:16px;width:100%;min-height:44px;resize:vertical;background:var(--gp-field);color:var(--gp-text);border:1px solid var(--gp-border);border-radius:10px;padding:8px 10px}
.lt-editing{grid-column:1/-1;font-size:12px;font-weight:700;margin:-4px 0 0}
.lt-by{font-size:11px;color:var(--gp-muted);margin-top:2px}
.lt-add{width:100%;border:1px dashed var(--gp-border);background:transparent;color:var(--gp-light);border-radius:14px;min-height:46px;font:inherit;font-weight:800;cursor:pointer}
.lt-add:hover{border-color:var(--gp-accent);color:var(--gp-text)}
.lt-search{border:1px solid var(--gp-accent);border-radius:16px;padding:12px;background:var(--gp-panel);margin:0 0 10px}
.lt-search form{display:flex;gap:8px}.lt-search input{flex:1;min-width:0;font:inherit;font-size:16px;background:var(--gp-field);color:var(--gp-text);border:1px solid var(--gp-border);border-radius:10px;padding:10px}
.lt-results{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:6px}
.lt-results button{width:100%;display:flex;gap:10px;align-items:center;text-align:left;background:var(--gp-card);border:1px solid var(--gp-border);border-radius:12px;color:var(--gp-text);padding:8px;font:inherit;cursor:pointer;min-height:52px}
.lt-results img{width:40px;height:40px;border-radius:8px;object-fit:cover;flex:none}
.lt-toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:#1C2230;border:1px solid var(--gp-accent);color:var(--gp-text);padding:10px 16px;border-radius:12px;font-size:14px;font-weight:700;z-index:50;max-width:calc(100vw - 32px);box-shadow:0 10px 30px rgba(0,0,0,.4)}
.lt-share{display:flex;gap:8px;flex-wrap:wrap}
.lt-members{list-style:none;margin:8px 0 0;padding:0}.lt-members li{display:flex;align-items:center;gap:10px;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--gp-border)}.lt-members li:last-child{border-bottom:0}
.lt-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
@media(max-width:420px){.lt-stop{grid-template-columns:52px 1fr;gap:10px;padding:10px}.lt-ph{width:52px;height:52px}.lt-sel{max-width:120px}}
`;

function tripIdFrom(propId) {
  if (typeof window !== "undefined") {
    const m = window.location.pathname.match(ID_RE);
    if (m) return m[1].toLowerCase();
  }
  return propId && /^[0-9a-f-]{36}$/i.test(propId) ? String(propId).toLowerCase() : null;
}

function useSession() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    let alive = true;
    let sub = null;
    const timeout = setTimeout(() => { if (alive) setSession((s) => (s === undefined ? null : s)); }, 8000);
    getSupabase().then((supabase) => {
      if (!alive) return;
      if (!supabase) { clearTimeout(timeout); setSession(null); return; }
      supabase.auth.getSession().then(({ data }) => { clearTimeout(timeout); if (alive) setSession(data && data.session ? data.session : null); }).catch(() => { if (alive) setSession(null); });
      const { data } = supabase.auth.onAuthStateChange((_e, value) => { if (alive) setSession(value || null); });
      sub = data && data.subscription;
    }, () => { clearTimeout(timeout); if (alive) setSession(null); });
    return () => { alive = false; clearTimeout(timeout); try { sub && sub.unsubscribe(); } catch {} };
  }, []);
  return session;
}

function Frame({ children }) {
  const mark = activeSeasonalMark() || NORMAL_MARK;
  return (
    <div className="gp-shell">
      <style dangerouslySetInnerHTML={styleHtml(GROUP_PLAN_CSS + LT_CSS)} />
      <div className="gp-main" style={{ maxWidth: 760 }}>
        <nav className="gp-nav" aria-label="Trip">
          <a className="gp-mark" href="/" aria-label="Wayfind home"><picture>{mark.avif ? <source srcSet={mark.avif} type="image/avif" /> : null}{mark.webp ? <source srcSet={mark.webp} type="image/webp" /> : null}<img src={mark.png} alt="Wayfind" width="118" height="47" /></picture></a>
          <a href="/?go=itinerary">My trips</a>
        </nav>
        {children}
      </div>
    </div>
  );
}

function initials(name) { return String(name || "?").trim().charAt(0).toUpperCase() || "?"; }

function dayLabel(day) {
  if (!day) return "Anytime";
  try { return formatStopDate(day) || day; } catch { return day; }
}

function daysOf(state) {
  const set = new Set();
  if (state.startDate && state.endDate) {
    let d = state.startDate;
    for (let i = 0; i < MAX_DAYS_SHOWN && d && d <= state.endDate; i += 1) { set.add(d); d = addCalendarDays(d, 1); }
  }
  for (const it of Object.values(state.items || {})) if (it.day) set.add(it.day);
  return [...set].sort();
}

async function searchPlaces(q, near) {
  const params = new URLSearchParams({ q });
  if (near) { params.set("lat", String(near.lat)); params.set("lng", String(near.lng)); }
  let data = null;
  try { const r = await fetch("/api/search?" + params.toString(), { headers: { accept: "application/json" } }); data = await r.json(); } catch { data = null; }
  const out = [];
  const seen = new Set();
  const add = (o) => { const id = String(o.id || ""); if (!id || !o.name || seen.has(id) || out.length >= 8) return; seen.add(id); out.push(o); };
  for (const p of Array.isArray(data && data.places) ? data.places : []) add({ id: p.id, name: String((p.displayName && p.displayName.text) || p.name || ""), address: p.shortFormattedAddress || p.formattedAddress || p.address || "", photo: typeof p.photo === "string" ? p.photo : null, lat: (p.location && p.location.latitude) != null ? p.location.latitude : p.lat, lng: (p.location && p.location.longitude) != null ? p.location.longitude : p.lng, wfScore: p.wfScore != null ? p.wfScore : null });
  for (const c of Array.isArray(data && data.cards) ? data.cards : []) if ((c.kind || "place") === "place") add({ id: c.id, name: String(c.name || ""), address: c.address || c.city || "", photo: typeof c.photo === "string" ? c.photo : null, lat: c.lat, lng: c.lng, wfScore: c.score != null ? c.score : c.wfScore });
  return out;
}

function centerOf(state) {
  const pts = Object.values(state.items || {}).map((it) => it.place).filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (!pts.length) return null;
  return { lat: pts.reduce((a, p) => a + p.lat, 0) / pts.length, lng: pts.reduce((a, p) => a + p.lng, 0) / pts.length };
}

function StopCard({ it, state, days, canEdit, members, editors, onDispatch, onEditing, me, pendingIds }) {
  const list = itemsForDay(state, it.day);
  const idx = list.findIndex((x) => x.id === it.id);
  const [note, setNote] = useState(it.note || "");
  const focused = useRef(false);
  const timer = useRef(null);
  useEffect(() => { if (!focused.current) setNote(it.note || ""); }, [it.note]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const saveNote = (value) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (value !== (it.note || "")) onDispatch({ type: "set", itemId: it.id, field: "note", value }); }, NOTE_DEBOUNCE_MS);
  };
  const moveUp = () => { if (idx <= 0) return; onDispatch({ type: "move", itemId: it.id, day: it.day, pos: posAfter(state, it.day, idx >= 2 ? list[idx - 2].id : null, it.id) }); };
  const moveDown = () => { if (idx < 0 || idx >= list.length - 1) return; onDispatch({ type: "move", itemId: it.id, day: it.day, pos: posAfter(state, it.day, list[idx + 1].id, it.id) }); };
  const moveDay = (value) => {
    const day = value || null;
    const target = itemsForDay(state, day).filter((x) => x.id !== it.id);
    onDispatch({ type: "move", itemId: it.id, day, pos: posAfter(state, day, target.length ? target[target.length - 1].id : null, it.id) });
  };
  const adder = members.find((m) => m.id === it.by);
  const editingBy = editors.filter((e) => e.editing === it.id && e.memberId !== me);
  const p = it.place || {};
  const href = typeof p.detailHref === "string" && p.detailHref.startsWith("/") ? p.detailHref : (p.id && !String(p.id).startsWith("event") ? "/p/" + encodeURIComponent(p.id) : null);
  return (
    <li className={"lt-stop" + (it.visited ? " done" : "") + (pendingIds.has(it.id) ? " pending" : "")} data-stop={it.id}>
      {/* Same photo path as the itinerary screen: Google photos go through the credited lane, a broken photo falls back to a tile. */}
      <SafeImg className="lt-ph" src={railPhotoSrc(p) || ""} alt="" compact category={p.type} loading="lazy" width="64" height="64" style={{ overflow: "hidden" }} />
      <div style={{ minWidth: 0 }}>
        <p className="lt-name">{href ? <a href={href}>{p.name || "Stop"}</a> : (p.name || "Stop")}</p>
        {p.address ? <p className="lt-addr">{p.address}</p> : null}
        {adder ? <p className="lt-by">Added by {adder.name}</p> : null}
        {canEdit ? (
          <div className="lt-ctrl">
            <button type="button" className="lt-ib" aria-label={"Move " + (p.name || "stop") + " up"} onClick={moveUp} disabled={idx <= 0}>↑</button>
            <button type="button" className="lt-ib" aria-label={"Move " + (p.name || "stop") + " down"} onClick={moveDown} disabled={idx < 0 || idx >= list.length - 1}>↓</button>
            <select className="lt-sel" aria-label={"Day for " + (p.name || "stop")} value={it.day || ""} onChange={(e) => moveDay(e.target.value)}>
              <option value="">Anytime</option>
              {days.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
            </select>
            <input className="lt-time" type="time" aria-label={"Time for " + (p.name || "stop")} value={it.time || ""} onChange={(e) => onDispatch({ type: "set", itemId: it.id, field: "time", value: e.target.value || null })} />
            <button type="button" className={"lt-ib" + (it.visited ? " on" : "")} aria-pressed={!!it.visited} aria-label={(it.visited ? "Unmark " : "Mark ") + (p.name || "stop") + " as done"} onClick={() => onDispatch({ type: "set", itemId: it.id, field: "visited", value: !it.visited })}>✓</button>
            <button type="button" className="lt-ib" aria-label={"Remove " + (p.name || "stop")} onClick={() => { if (window.confirm("Remove " + (p.name || "this stop") + " for everyone?")) onDispatch({ type: "remove", itemId: it.id }); }}>✕</button>
          </div>
        ) : (it.time ? <p className="lt-addr">{it.time}</p> : null)}
      </div>
      {canEdit ? (
        <textarea className="lt-note" rows={1} maxLength={500} placeholder="Add a note for the group" aria-label={"Note for " + (p.name || "stop")} value={note}
          onFocus={() => { focused.current = true; onEditing(it.id); }}
          onBlur={() => { focused.current = false; onEditing(null); if (note !== (it.note || "")) { if (timer.current) clearTimeout(timer.current); onDispatch({ type: "set", itemId: it.id, field: "note", value: note }); } }}
          onChange={(e) => { setNote(e.target.value); saveNote(e.target.value); }} />
      ) : (it.note ? <p className="lt-addr" style={{ gridColumn: "1/-1" }}>{it.note}</p> : null)}
      {editingBy.length ? <p className="lt-editing" style={{ color: editingBy[0].color }}>{editingBy.map((e) => e.name).join(", ")} {editingBy.length === 1 ? "is" : "are"} editing this note</p> : null}
    </li>
  );
}

function AddStop({ day, state, onDispatch, onClose }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const run = async (e) => {
    e.preventDefault();
    const query = q.trim();
    if (!query || busy) return;
    setBusy(true);
    let near = centerOf(state);
    if (!near) { try { const c = JSON.parse(window.localStorage.getItem("wf_center") || "null"); if (c && Number.isFinite(c.lat) && Number.isFinite(c.lng)) near = c; } catch {} }
    setResults(await searchPlaces(query, near));
    setBusy(false);
  };
  const add = (p) => {
    const list = itemsForDay(state, day);
    onDispatch({ type: "add", item: { id: "s_" + randomId(12), place: p, day: day || null, pos: posAfter(state, day, list.length ? list[list.length - 1].id : null), note: "" } });
    onClose();
  };
  return (
    <div className="lt-search">
      <form onSubmit={run} role="search">
        <label className="lt-sr" htmlFor={"lt-q-" + (day || "any")}>Search places to add</label>
        <input id={"lt-q-" + (day || "any")} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a place, like brunch or a museum" enterKeyHint="search" />
        <button className="gp-button primary" type="submit" disabled={busy}>{busy ? "…" : "Search"}</button>
      </form>
      {results && !results.length ? <p className="gp-note">Nothing matched. Try a name or a kind of place.</p> : null}
      {results && results.length ? (
        <ul className="lt-results">
          {results.map((p) => (
            <li key={p.id}><button type="button" onClick={() => add(p)}><SafeImg className="lt-rph" src={railPhotoSrc(p) || ""} alt="" compact category={p.type} loading="lazy" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", flex: "none", overflow: "hidden" }} /><span><strong>{p.name}</strong><br /><span className="gp-note">{p.address}</span></span></button></li>
          ))}
        </ul>
      ) : null}
      <div className="gp-actions" style={{ marginTop: 10 }}><button type="button" className="gp-button" onClick={onClose}>Cancel</button></div>
    </div>
  );
}

function statusPill(snap) {
  if (!snap) return null;
  const n = snap.pending;
  if (snap.status === "offline") return <span className="lt-pill off" role="status"><i />Offline{n ? ` · ${n} change${n === 1 ? "" : "s"} saved on this phone` : ""}</span>;
  if (snap.status === "auth") return <span className="lt-pill bad" role="status"><i />Sign in again to keep saving</span>;
  if (snap.status === "ended") return <span className="lt-pill bad" role="status"><i />Sharing ended</span>;
  if (snap.status === "removed") return <span className="lt-pill bad" role="status"><i />You're no longer on this trip</span>;
  if (snap.status === "live") return <span className="lt-pill live" role="status"><i />{n ? `Saving ${n}…` : "Live"}</span>;
  return <span className="lt-pill" role="status"><i />{snap.status === "polling" ? "Reconnecting" : "Connecting"}{n ? ` · ${n} to send` : ""}</span>;
}

export default function LiveTripClient({ tripId: propId }) {
  const session = useSession();
  const [tripId, setTripId] = useState(propId || null);
  const [phase, setPhase] = useState("loading"); // loading | preview | signin | error | ready
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [snap, setSnap] = useState(null);
  const [presence, setPresence] = useState([]);
  const [toast, setToast] = useState("");
  const [addingDay, setAddingDay] = useState(undefined);
  const [editTitle, setEditTitle] = useState(null);
  const [inviteUrl, setInviteUrl] = useState(null);
  const [showPeople, setShowPeople] = useState(false);
  const engineRef = useRef(null);
  const transportRef = useRef(null);
  const tokenRef = useRef(null);
  const storeRef = useRef(null);
  const toastTimer = useRef(null);

  const notify = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  }, []);

  // Trip id from the address bar (so a cached page works as the offline shell),
  // and the invite code out of the fragment into storage, then off the URL.
  useEffect(() => {
    const id = tripIdFrom(propId);
    setTripId(id);
    if (!id) { setPhase("error"); setError("This trip link doesn't look right."); return; }
    try {
      const m = window.location.hash.match(/(?:^#|&)j=([A-Za-z0-9_-]{22})(?:&|$)/);
      if (m) {
        window.localStorage.setItem(JOIN_KEY(id), m[1]);
        window.history.replaceState(null, "", window.location.pathname);
      }
    } catch {}
  }, [propId]);

  // Keep the token fresh for the API, the socket and the service worker.
  useEffect(() => {
    tokenRef.current = session && session.access_token ? session.access_token : null;
    if (session && storeRef.current) storeRef.current.setMeta("auth", { token: session.access_token, exp: session.expires_at }).catch(() => {});
    if (transportRef.current) transportRef.current.refreshAuth();
    if (session && engineRef.current && engineRef.current.snapshot().status === "auth") engineRef.current.wake();
  }, [session]);

  // Signed-out: show the invite preview (or the cached trip, read-only).
  useEffect(() => {
    if (!tripId || session === undefined || session) return;
    let alive = true;
    (async () => {
      let code = null;
      try { code = window.localStorage.getItem(JOIN_KEY(tripId)); } catch {}
      if (code) {
        const r = await liveTripRequest("/api/trips/live/" + tripId, { method: "POST", body: { action: "preview", code } });
        if (!alive) return;
        if (r.status === 200 && r.body.ok) { setPreview(r.body); setPhase("preview"); return; }
        setError(r.body.message || "This invite link doesn't work anymore. Ask for a new one.");
        setPhase("error");
        return;
      }
      setPhase("signin");
    })();
    return () => { alive = false; };
  }, [tripId, session]);

  // Signed in: join if we hold an invite code, then start the sync engine.
  useEffect(() => {
    if (!tripId || !session) return undefined;
    let alive = true;
    let engine = null;
    const cleanups = [];
    (async () => {
      const store = await createLiveTripStore();
      storeRef.current = store;
      store.setMeta("auth", { token: session.access_token, exp: session.expires_at }).catch(() => {});
      let code = null;
      try { code = window.localStorage.getItem(JOIN_KEY(tripId)); } catch {}
      let first = null;
      if (code) {
        const r = await liveTripRequest("/api/trips/live/" + tripId, { method: "POST", token: session.access_token, body: { action: "join", code } });
        if (!alive) return;
        if (r.status === 200 && r.body.ok) { first = r.body; try { window.localStorage.removeItem(JOIN_KEY(tripId)); } catch {} }
        else if (r.status !== 0) {
          try { window.localStorage.removeItem(JOIN_KEY(tripId)); } catch {}
          const cachedTrip = await store.loadTrip(tripId).catch(() => null);
          if (!cachedTrip) { setError(r.body.message || "This invite link doesn't work anymore."); setPhase("error"); return; }
        }
      }
      const cached = first || (await store.loadTrip(tripId).catch(() => null));
      const me = (first && first.me) || (cached && cached.me) || (session.user && session.user.id);
      const myMember = ((first && first.members) || (cached && cached.members) || []).find((m) => m.id === me);
      if (first) {
        await store.saveTrip(tripId, { state: first.state, revision: first.revision, checksum: first.checksum, role: first.role, me: first.me, members: first.members, status: first.status }).catch(() => {});
        if (first.inviteUrl) setInviteUrl(first.inviteUrl);
      }
      const supabase = await getSupabase().catch(() => null);
      if (!alive) return;
      const transport = createLiveTripTransport({ supabase, tripId, getToken: async () => tokenRef.current, onPresence: (list) => setPresence(list) });
      transport.setPresence({ memberId: me, name: myMember ? myMember.name : "Me", color: myMember ? myMember.color : "#F97316", editing: null });
      transportRef.current = transport;
      let reg = null;
      engine = createLiveTripSync({
        tripId, store, transport,
        onChange: (s) => { if (alive) { setSnap(s); setPhase("ready"); } },
        onNotice: notify,
        isVisible: () => document.visibilityState === "visible",
        requestBackgroundSync: () => { try { if (reg && reg.sync) reg.sync.register("wf-live-trips").catch(() => {}); } catch {} },
      });
      engineRef.current = engine;
      engine.setOnline(typeof navigator === "undefined" ? true : navigator.onLine !== false);
      await engine.start();
      if (!alive) return;
      setPhase("ready");
      // Owner: fetch the invite link (the snapshot carries it only for owners).
      const s = await liveTripRequest("/api/trips/live/" + tripId, { token: tokenRef.current });
      if (alive && s.status === 200 && s.body && s.body.inviteUrl) setInviteUrl(s.body.inviteUrl);

      const onOnline = () => engine.setOnline(true);
      const onOffline = () => engine.setOnline(false);
      const onVis = () => { if (document.visibilityState === "visible") engine.wake(); };
      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);
      document.addEventListener("visibilitychange", onVis);
      cleanups.push(() => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); document.removeEventListener("visibilitychange", onVis); });
      if ("serviceWorker" in navigator) {
        try {
          reg = await navigator.serviceWorker.register("/trips-sw.js", { scope: "/trips/" });
          navigator.serviceWorker.ready.then((ready) => {
            try {
              const urls = performance.getEntriesByType("resource").map((e) => e.name).filter((u) => u.indexOf("/_next/static/") >= 0);
              if (ready.active) ready.active.postMessage({ type: "wf-cache-urls", urls, page: window.location.pathname });
            } catch {}
          }).catch(() => {});
          const onMsg = (e) => { if (e.data && e.data.type === "wf-live-flush") engine.wake(); };
          navigator.serviceWorker.addEventListener("message", onMsg);
          cleanups.push(() => navigator.serviceWorker.removeEventListener("message", onMsg));
        } catch {}
      }
    })();
    return () => { alive = false; for (const c of cleanups) c(); if (engine) engine.stop(); engineRef.current = null; transportRef.current = null; };
  }, [tripId, session && session.user && session.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dispatch = useCallback((op) => { if (engineRef.current) engineRef.current.dispatch(op); }, []);
  const setEditing = useCallback((itemId) => {
    const t = transportRef.current;
    const s = engineRef.current && engineRef.current.snapshot();
    if (!t || !s) return;
    const mine = (s.members || []).find((m) => m.id === s.me);
    t.setPresence({ memberId: s.me, name: mine ? mine.name : "Me", color: mine ? mine.color : "#F97316", editing: itemId });
  }, []);

  const state = snap && snap.state;
  const canEdit = !!(snap && snap.role && snap.role !== "viewer" && snap.status !== "ended" && snap.status !== "removed");
  const isOwner = !!(snap && snap.role === "owner");
  const days = useMemo(() => (state ? daysOf(state) : []), [state]);
  const hereIds = useMemo(() => new Set(presence.map((p) => p.memberId)), [presence]);
  const pendingIds = useMemo(() => new Set((snap && snap.pendingItemIds) || []), [snap]);

  if (phase === "loading" || session === undefined) {
    return <Frame><p className="gp-muted" role="status">Loading your trip…</p></Frame>;
  }
  if (phase === "error") {
    return <Frame><section className="gp-panel"><h1>Trip not available</h1><p className="gp-muted">{error}</p><a className="gp-button" href="/?go=itinerary">Go to my trips</a></section></Frame>;
  }
  if (phase === "preview" && preview) {
    const when = preview.startDate ? dayLabel(preview.startDate) + (preview.endDate && preview.endDate !== preview.startDate ? " – " + dayLabel(preview.endDate) : "") : null;
    return (
      <Frame>
        <section className="gp-panel">
          <p className="gp-step">Wayfind · Plan together</p>
          <h1>{preview.ownerName} invited you to plan {preview.title}</h1>
          <p className="gp-lede">{[preview.city, when, preview.stops + " stop" + (preview.stops === 1 ? "" : "s"), preview.people + " planning"].filter(Boolean).join(" · ")}</p>
          <p className="gp-muted">Add places, move things around and leave notes. Everyone sees changes instantly, even if you lose signal for a while.</p>
          <div className="gp-actions"><a className="gp-button primary" href={signInUrlWithReturn("/trips/" + tripId)}>Sign in free to join</a></div>
          <p className="gp-note">After you sign in, we bring you right back here.</p>
        </section>
      </Frame>
    );
  }
  if (phase === "signin" || !session) {
    return <Frame><section className="gp-panel"><h1>Plan this trip together</h1><p className="gp-muted">Sign in to open this trip. If a friend sent you the link, open it from their message so we know you're invited.</p><div className="gp-actions"><a className="gp-button primary" href={signInUrlWithReturn("/trips/" + tripId)}>Sign in to Wayfind</a></div></section></Frame>;
  }
  if (!state) return <Frame><p className="gp-muted" role="status">Loading your trip…</p></Frame>;

  const members = snap.members || [];
  // Same share chooser as Group Vote (text, email, or the phone's share sheet).
  // The invite code rides in the #j= fragment; the chooser keeps it, and this
  // path is a private group link, so no share token or third-party tag sees it.
  // Loaded on tap through shareIntentSheet's existing lazy chunk (see the note
  // there): importing lib/shareOut.js from this route, statically or lazily,
  // copies ~3KB of shared share code into the homepage's first-load bundle.
  // Opening the chooser needs no user activation (the share sheet is a fresh
  // tap inside it), so awaiting the import is safe.
  const share = async () => {
    if (!inviteUrl) return;
    const text = `Help me plan ${state.title} on Wayfind. Add places and we'll all see the plan update live.`;
    let result = "failed";
    try { const { shareOut } = await import("../../components/shareIntentSheet"); result = shareOut({ title: state.title, text, url: inviteUrl }, () => notify("Invite link copied. Send it to your friends.")); } catch {}
    // Only the chooser copies to the clipboard (site rule). If it could not
    // open, hand the person the link to copy themselves.
    if (result === "failed") window.prompt("Copy this invite link", inviteUrl);
  };
  const admin = async (body, okMsg) => {
    const r = await liveTripRequest("/api/trips/live/" + tripId, { method: "POST", token: tokenRef.current, body });
    if (r.status === 200 && r.body.ok) {
      if (r.body.inviteUrl) setInviteUrl(r.body.inviteUrl);
      if (okMsg) notify(okMsg);
      if (engineRef.current) engineRef.current.resync();
      if (r.body.left || r.body.ended) { try { await storeRef.current.forgetTrip(tripId); } catch {} window.location.assign("/?go=itinerary"); }
    } else notify(r.body.message || "That didn't work. Try again.");
  };
  const lists = [...days, null];

  return (
    <Frame>
      <header>
        <div className="lt-head">
          {editTitle != null && canEdit ? (
            <form style={{ flex: 1, minWidth: 0 }} onSubmit={(e) => { e.preventDefault(); const v = editTitle.trim(); if (v && v !== state.title) dispatch({ type: "meta", field: "title", value: v }); setEditTitle(null); }}>
              <input className="lt-title-input" autoFocus maxLength={140} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== state.title) dispatch({ type: "meta", field: "title", value: v }); setEditTitle(null); }} aria-label="Trip name" />
            </form>
          ) : (
            <h1 style={{ margin: 0, flex: 1, minWidth: 0 }}><button type="button" className="lt-title" onClick={() => canEdit && setEditTitle(state.title)} aria-label={canEdit ? "Rename trip: " + state.title : state.title}>{state.title}</button></h1>
          )}
          {statusPill(snap)}
        </div>
        <div className="lt-sub">
          {state.city ? <span>{state.city}{state.region ? ", " + state.region : ""}</span> : null}
          <span>· {orderedItems(state).length} stops</span>
          <button type="button" className="lt-people" onClick={() => setShowPeople((v) => !v)} aria-expanded={showPeople} aria-label={members.length + " people on this trip. Show who."} style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }}>
            {members.slice(0, 8).map((m) => <span key={m.id} className={"lt-ava " + (hereIds.has(m.id) ? "here" : "away")} style={{ background: m.color }} title={m.name + (hereIds.has(m.id) ? " (here now)" : "")}>{initials(m.name)}</span>)}
            <span className="gp-note" style={{ marginLeft: 4 }}>{presence.length > 1 ? presence.length + " here now" : members.length + " on this trip"}</span>
          </button>
        </div>
        {canEdit ? (
          <div className="lt-dates">
            <label>Starts<input type="date" value={state.startDate || ""} max={state.endDate || undefined} onChange={(e) => dispatch({ type: "meta", field: "startDate", value: e.target.value || null })} /></label>
            <label>Ends<input type="date" value={state.endDate || ""} min={state.startDate || undefined} onChange={(e) => dispatch({ type: "meta", field: "endDate", value: e.target.value || null })} /></label>
          </div>
        ) : null}
        {isOwner && inviteUrl && snap.status !== "ended" ? (
          <div className="lt-share" style={{ margin: "10px 0" }}>
            <button type="button" className="gp-button primary" onClick={share}>Invite friends</button>
          </div>
        ) : null}
        {showPeople ? (
          <section className="gp-panel" aria-label="People on this trip">
            <ul className="lt-members">
              {members.map((m) => (
                <li key={m.id}>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}><span className={"lt-ava " + (hereIds.has(m.id) ? "here" : "")} style={{ background: m.color }}>{initials(m.name)}</span><span>{m.name}{m.id === snap.me ? " (you)" : ""}<br /><span className="gp-note">{m.role === "owner" ? "Owner" : m.role === "viewer" ? "Can view" : "Can edit"}{hereIds.has(m.id) ? " · here now" : ""}</span></span></span>
                  {isOwner && m.id !== snap.me ? <button type="button" className="gp-button danger gp-remove" onClick={() => { if (window.confirm("Remove " + m.name + " from this trip?")) admin({ action: "remove_member", memberId: m.id }, m.name + " removed"); }}>Remove</button> : null}
                </li>
              ))}
            </ul>
            <div className="gp-actions">
              {isOwner ? <button type="button" className="gp-button" onClick={() => { if (window.confirm("Make a new invite link? The old link will stop working.")) admin({ action: "rotate_link" }, "New invite link ready"); }}>New invite link</button> : null}
              {isOwner ? <button type="button" className="gp-button danger" onClick={() => { if (window.confirm("Stop sharing this trip? Everyone loses access to the live version.")) admin({ action: "end" }); }}>End sharing</button> : <button type="button" className="gp-button danger" onClick={() => { if (window.confirm("Leave this trip?")) admin({ action: "leave" }); }}>Leave trip</button>}
            </div>
          </section>
        ) : null}
      </header>

      {snap.status === "removed" ? <p className="gp-status gp-error">You're no longer on this trip. Ask the owner for a new invite link.</p> : null}
      {snap.status === "ended" ? <p className="gp-status gp-error">The owner stopped sharing this trip. This is the last version you saw.</p> : null}
      {snap.status === "auth" ? <p className="gp-status gp-error">Your sign-in expired. <a href={signInUrlWithReturn("/trips/" + tripId)}>Sign in again</a>; your changes are saved on this phone and will send after.</p> : null}

      {lists.map((day) => {
        const list = itemsForDay(state, day);
        if (day === null && !list.length && days.length && !canEdit) return null;
        return (
          <section className="lt-day" key={day || "anytime"} aria-label={dayLabel(day)}>
            <h2>{dayLabel(day)} <small>{list.length ? list.length + " stop" + (list.length === 1 ? "" : "s") : ""}</small></h2>
            <ul className="gp-card-list">
              {list.map((it) => <StopCard key={it.id} it={it} state={state} days={days} canEdit={canEdit} members={members} editors={presence} onDispatch={dispatch} onEditing={setEditing} me={snap.me} pendingIds={pendingIds} />)}
            </ul>
            {canEdit ? (addingDay === (day || null) ? <AddStop day={day} state={state} onDispatch={dispatch} onClose={() => setAddingDay(undefined)} /> : <button type="button" className="lt-add" onClick={() => setAddingDay(day || null)}>+ Add a stop{day ? " on " + dayLabel(day) : ""}</button>) : null}
          </section>
        );
      })}
      {!orderedItems(state).length && !canEdit ? <p className="gp-empty gp-muted">No stops yet.</p> : null}
      <p className="gp-note" style={{ marginTop: 28 }}>Changes save for everyone automatically. Lost signal? Keep planning: edits wait on this phone and send when you're back online.</p>
      {toast ? <div className="lt-toast" role="status" aria-live="polite">{toast}</div> : null}
    </Frame>
  );
}
