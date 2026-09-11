"use client";

// Event-only Apple Maps surface. The route overlay is added by the same
// MapKit session as the venue and nearby annotations; EventDrivingRoute owns
// only the controls and summary shown below this map.
import { useEffect, useMemo, useRef, useState } from "react";
import { createAppleMapController, loadAppleMapKit } from "../../lib/appleMapsRuntime.js";
import { appleMapsTokenUsable } from "../../lib/appleMapsToken.js";
import { EVENT_MAP_FAMILY, eventMapFamily } from "../../lib/eventMapPlaces.js";

const ACCENT = "#F97316";
const PICK = "#2EC9A6";
const CSS = `
.wfev-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;align-items:stretch}
.wfev-cats{display:flex;gap:6px;min-width:0;overflow-x:auto;overscroll-behavior-x:contain;padding:7px;border-radius:16px;background:#0F1520;border:1px solid rgba(148,163,184,.2);-webkit-overflow-scrolling:touch;scrollbar-width:none}.wfev-cats::-webkit-scrollbar{display:none}
.wfev-cat{display:flex;align-items:center;gap:8px;width:auto;min-width:0;flex:0 0 auto;margin:0;padding:9px 10px;border-radius:11px;border:1px solid transparent;background:transparent;color:#94A3B8;font:inherit;font-size:13px;font-weight:750;text-align:left;white-space:nowrap;cursor:pointer}
.wfev-cat:hover{background:rgba(148,163,184,.08);color:#CBD5E1}.wfev-cat[aria-pressed="true"]{border-color:rgba(249,115,22,.45);background:rgba(249,115,22,.12);color:#FDBA74}
.wfev-cat i{display:grid;place-items:center;width:19px;flex:0 0 19px;font-size:15px;font-style:normal}.wfev-cat span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wfev-cat b{margin-left:auto;color:#F8FAFC;font-variant-numeric:tabular-nums}
.wfev{position:relative;border-radius:20px;overflow:hidden;border:1px solid rgba(148,163,184,.2);background:#0F1520;box-shadow:0 24px 60px rgba(0,0,0,.45),0 0 0 1px rgba(249,115,22,.08);isolation:isolate}
.wfev-canvas{position:absolute;inset:0}.wfev-h{height:clamp(340px,52vw,460px)}
.wfev-chip{position:absolute;left:12px;top:12px;z-index:3;display:inline-flex;align-items:center;gap:9px;padding:9px 13px 9px 11px;border-radius:999px;background:rgba(10,15,23,.82);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(148,163,184,.28);color:#F8FAFC;font-size:13px;font-weight:800;box-shadow:0 10px 30px rgba(0,0,0,.35);max-width:calc(100% - 24px)}
.wfev-chip i{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:999px;background:${ACCENT};color:#0D1117;font-style:normal;font-size:13px;flex:0 0 auto}.wfev-chip small{display:block;font-size:11px;font-weight:700;color:#94A3B8;margin-top:1px}.wfev-chip b{display:block;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wfev-legend{position:absolute;left:12px;bottom:12px;z-index:3;display:flex;gap:10px;padding:7px 11px;border-radius:999px;background:rgba(10,15,23,.78);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(148,163,184,.22);color:#CBD5E1;font-size:11.5px;font-weight:700}.wfev-legend span{display:inline-flex;align-items:center;gap:5px}.wfev-legend em{width:9px;height:9px;border-radius:999px;display:inline-block}
.wfev-card{position:absolute;left:12px;right:12px;bottom:12px;z-index:4;display:flex;gap:12px;align-items:center;padding:10px;border-radius:16px;background:rgba(10,15,23,.9);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(46,201,166,.45);box-shadow:0 18px 40px rgba(0,0,0,.5);text-decoration:none;color:#F8FAFC}.wfev-card img{width:58px;height:58px;border-radius:12px;object-fit:cover;background:linear-gradient(145deg,#1B2433,#0E1520);flex:0 0 auto}.wfev-card b{display:block;font-size:14.5px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wfev-card small{display:block;font-size:12px;color:#94A3B8;font-weight:700;margin-top:3px}.wfev-card u{text-decoration:none;color:#0D1117;background:${PICK};border-radius:999px;padding:2px 8px;font-size:12px;font-weight:800;margin-right:6px}.wfev-card .wfev-x{margin-left:auto;flex:0 0 auto;width:30px;height:30px;border-radius:999px;border:1px solid rgba(148,163,184,.3);background:transparent;color:#CBD5E1;font:inherit;font-size:15px;cursor:pointer}.wfev-card .wfev-go{flex:0 0 auto;padding:9px 13px;border-radius:11px;background:${PICK};color:#0D1117;font-size:13px;font-weight:800}
.wfev-fb{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:22px;text-align:center;background:linear-gradient(145deg,#17212E 0%,#0A111B 72%)}
@media (max-width:700px){.wfev-legend{display:none}}
`;

const thumb = (p) => p.photo || (p.photoRef ? "/api/photo?ref=" + encodeURIComponent(p.photoRef) + "&w=640" : "/api/photo?place=" + encodeURIComponent(p.id) + "&w=640");

export default function EventVenueMap({ venue, picks = [], onSelect, onMapReady }) {
  const hostRef = useRef(null);
  const controllerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [gen, setGen] = useState(0);
  const [sel, setSel] = useState(null);
  const [active, setActive] = useState(null);
  const pins = useMemo(() => picks.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng)), [picks]);
  const groups = useMemo(() => {
    const counts = new Map();
    for (const place of pins) {
      const family = eventMapFamily(place);
      counts.set(family, (counts.get(family) || 0) + 1);
    }
    return Array.from(counts, ([family, count]) => ({ family, count, ...(EVENT_MAP_FAMILY[family] || EVENT_MAP_FAMILY.other) }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [pins]);
  const shown = useMemo(() => active ? pins.filter((place) => eventMapFamily(place) === active) : pins, [active, pins]);
  const token = process.env.NEXT_PUBLIC_APPLE_MAPS_TOKEN;

  useEffect(() => {
    if (!hostRef.current || !venue || !Number.isFinite(venue.lat) || !Number.isFinite(venue.lng)) return undefined;
    let dead = false;
    let controller = null;
    const watchdog = setTimeout(() => { if (!dead) setFailed(true); }, 12000);
    setReady(false); setFailed(false); setSel(null);
    loadAppleMapKit(token).then((mapkit) => {
      if (dead || !hostRef.current) return;
      controller = createAppleMapController({
        mapkit, container: hostRef.current, venue, picks: shown,
        onSelect: (id) => { if (!dead) setSel(id); },
      });
      if (dead) { controller.destroy(); return; }
      controllerRef.current = controller;
      clearTimeout(watchdog); setFailed(false); setReady(true); onMapReady?.(controller);
    }).catch(() => { if (!dead) { clearTimeout(watchdog); setFailed(true); } });
    return () => {
      dead = true; clearTimeout(watchdog);
      if (controller) controller.destroy();
      controllerRef.current = null;
      onMapReady?.(null);
    };
    // `pins` is intentionally represented by venue coordinates + generation;
    // callers remount this event-only map when the venue changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gen, venue && venue.lat, venue && venue.lng]);

  const pinIdentity = JSON.stringify(shown.map(p => [p.id, p.lat, p.lng, p.name, p.cat, p.primaryType, p.mapKind, p.mapRank]));
  useEffect(() => { controllerRef.current?.setPicks(shown); }, [pinIdentity, ready]);
  useEffect(() => {
    if (active && !groups.some((group) => group.family === active)) setActive(null);
  }, [active, groups]);
  useEffect(() => {
    if (sel && !shown.some((place) => String(place.id) === String(sel))) setSel(null);
  }, [sel, shown]);

  useEffect(() => { if (onSelect) onSelect(sel); }, [sel, onSelect]);
  const retry = () => { setFailed(false); setReady(false); setSel(null); setGen((g) => g + 1); };
  const selected = sel ? shown.find((p) => String(p.id) === String(sel)) : null;
  // Missing, placeholder, or already-expired: render the fallback at once and
  // never start MapKit (lib/appleMapsToken.js reads the expiry from the JWT).
  const unavailable = !appleMapsTokenUsable(token);
  return (
    <div className="wfev-grid">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {pins.length ? <div className="wfev-cats" aria-label="Map categories">
        <button type="button" className="wfev-cat" aria-pressed={active === null} onClick={() => { setActive(null); setSel(null); }}><i aria-hidden="true">⌖</i><span>All places</span><b>{pins.length}</b></button>
        {groups.map((group) => <button key={group.family} type="button" className="wfev-cat" aria-pressed={active === group.family} onClick={() => { setActive(active === group.family ? null : group.family); setSel(null); }}><i aria-hidden="true">{group.icon}</i><span>{group.label}</span><b>{group.count}</b></button>)}
      </div> : null}
      <div className="wfev wfev-h" aria-label={`Apple map of ${venue.name}`}>
        <div ref={hostRef} className="wfev-canvas" />
        {ready && shown.length > 0 && !selected ? <div className="wfev-legend" aria-hidden="true"><span><em style={{ background: ACCENT }} />Event</span><span>{shown.length} {active ? (EVENT_MAP_FAMILY[active]?.label || "places") : "places"}</span></div> : null}
        {selected ? <div className="wfev-card" role="region" aria-label={selected.name}>
          <img src={thumb(selected)} alt="" loading="lazy" /><span style={{ minWidth: 0, flex: 1 }}><b>{selected.name}</b><small>{Number.isFinite(selected.wfScore) ? <u>{(selected.wfScore / 10).toFixed(1)}</u> : null}{selected.cat || "Nearby"}{selected.distMi != null ? ` · ${selected.distMi.toFixed(1)} mi from the venue` : ""}</small></span>
          <a className="wfev-go" href={selected.href}>Open</a><button type="button" className="wfev-x" aria-label="Close" onClick={() => setSel(null)}>×</button>
        </div> : null}
        {failed || unavailable ? <div className="wfev-fb"><div style={{ width: 42, height: 42, borderRadius: 14, background: "rgba(148,163,184,.14)", border: "1px solid rgba(148,163,184,.38)", display: "grid", placeItems: "center", color: "#FB923C", fontSize: 20 }}>⌁</div><div style={{ fontSize: 14, fontWeight: 800, color: "#F8FAFC" }}>{venue.name}</div><div style={{ maxWidth: 280, color: "#94A3B8", fontSize: 12, lineHeight: 1.5 }}>The map preview is unavailable right now. The address and external navigation link are still available.</div>{!unavailable ? <button type="button" onClick={retry} style={{ marginTop: 4, padding: "9px 18px", borderRadius: 999, border: "1px solid rgba(249,115,22,.5)", background: "rgba(249,115,22,.14)", color: "#FB923C", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Try again</button> : null}</div> : null}
      </div>
    </div>
  );
}
