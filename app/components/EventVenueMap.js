"use client";

// Event-only Apple Maps surface. The route overlay is added by the same
// MapKit session as the venue and nearby annotations; EventDrivingRoute owns
// only the controls and summary shown below this map.
import { useEffect, useRef, useState } from "react";
import { createAppleMapController, loadAppleMapKit } from "../../lib/appleMapsRuntime.js";
import { appleMapsTokenUsable } from "../../lib/appleMapsToken.js";

const ACCENT = "#F97316";
const PICK = "#2EC9A6";
const CSS = `
.wfev{position:relative;border-radius:20px;overflow:hidden;border:1px solid rgba(148,163,184,.2);background:#0F1520;box-shadow:0 24px 60px rgba(0,0,0,.45),0 0 0 1px rgba(249,115,22,.08);isolation:isolate}
.wfev-canvas{position:absolute;inset:0}.wfev-h{height:clamp(340px,52vw,460px)}
.wfev-chip{position:absolute;left:12px;top:12px;z-index:3;display:inline-flex;align-items:center;gap:9px;padding:9px 13px 9px 11px;border-radius:999px;background:rgba(10,15,23,.82);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(148,163,184,.28);color:#F8FAFC;font-size:13px;font-weight:800;box-shadow:0 10px 30px rgba(0,0,0,.35);max-width:calc(100% - 24px)}
.wfev-chip i{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:999px;background:${ACCENT};color:#0D1117;font-style:normal;font-size:13px;flex:0 0 auto}.wfev-chip small{display:block;font-size:11px;font-weight:700;color:#94A3B8;margin-top:1px}.wfev-chip b{display:block;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wfev-legend{position:absolute;left:12px;bottom:12px;z-index:3;display:flex;gap:10px;padding:7px 11px;border-radius:999px;background:rgba(10,15,23,.78);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(148,163,184,.22);color:#CBD5E1;font-size:11.5px;font-weight:700}.wfev-legend span{display:inline-flex;align-items:center;gap:5px}.wfev-legend em{width:9px;height:9px;border-radius:999px;display:inline-block}
.wfev-card{position:absolute;left:12px;right:12px;bottom:12px;z-index:4;display:flex;gap:12px;align-items:center;padding:10px;border-radius:16px;background:rgba(10,15,23,.9);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(46,201,166,.45);box-shadow:0 18px 40px rgba(0,0,0,.5);text-decoration:none;color:#F8FAFC}.wfev-card img{width:58px;height:58px;border-radius:12px;object-fit:cover;background:linear-gradient(145deg,#1B2433,#0E1520);flex:0 0 auto}.wfev-card b{display:block;font-size:14.5px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wfev-card small{display:block;font-size:12px;color:#94A3B8;font-weight:700;margin-top:3px}.wfev-card u{text-decoration:none;color:#0D1117;background:${PICK};border-radius:999px;padding:2px 8px;font-size:12px;font-weight:800;margin-right:6px}.wfev-card .wfev-x{margin-left:auto;flex:0 0 auto;width:30px;height:30px;border-radius:999px;border:1px solid rgba(148,163,184,.3);background:transparent;color:#CBD5E1;font:inherit;font-size:15px;cursor:pointer}.wfev-card .wfev-go{flex:0 0 auto;padding:9px 13px;border-radius:11px;background:${PICK};color:#0D1117;font-size:13px;font-weight:800}
.wfev-fb{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:22px;text-align:center;background:linear-gradient(145deg,#17212E 0%,#0A111B 72%)}
@media (max-width:600px){.wfev-legend{display:none}}
`;

const thumb = (p) => (p.photoRef ? "/api/photo?ref=" + encodeURIComponent(p.photoRef) + "&w=640" : "/api/photo?place=" + encodeURIComponent(p.id) + "&w=640");

export default function EventVenueMap({ venue, picks = [], onSelect, onMapReady }) {
  const hostRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [gen, setGen] = useState(0);
  const [sel, setSel] = useState(null);
  const pins = picks.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
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
        mapkit, container: hostRef.current, venue, picks: pins,
        onSelect: (id) => { if (!dead) setSel(id); },
      });
      if (dead) { controller.destroy(); return; }
      clearTimeout(watchdog); setFailed(false); setReady(true); onMapReady?.(controller);
    }).catch(() => { if (!dead) { clearTimeout(watchdog); setFailed(true); } });
    return () => {
      dead = true; clearTimeout(watchdog);
      if (controller) controller.destroy();
      onMapReady?.(null);
    };
    // `pins` is intentionally represented by venue coordinates + generation;
    // callers remount this event-only map when the venue changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gen, venue && venue.lat, venue && venue.lng]);

  useEffect(() => { if (onSelect) onSelect(sel); }, [sel, onSelect]);
  const retry = () => { setFailed(false); setReady(false); setSel(null); setGen((g) => g + 1); };
  const selected = sel ? pins.find((p) => p.id === sel) : null;
  // Missing, placeholder, or already-expired: render the fallback at once and
  // never start MapKit (lib/appleMapsToken.js reads the expiry from the JWT).
  const unavailable = !appleMapsTokenUsable(token);
  return (
    <div className="wfev wfev-h" aria-label={`Apple map of ${venue.name}`}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div ref={hostRef} className="wfev-canvas" />
      {ready && pins.length > 0 && !selected ? <div className="wfev-legend" aria-hidden="true"><span><em style={{ background: ACCENT }} />Venue</span><span><em style={{ background: PICK }} />Nearby &amp; worth it</span></div> : null}
      {selected ? <div className="wfev-card" role="dialog" aria-label={selected.name}>
        <img src={thumb(selected)} alt="" loading="lazy" /><span style={{ minWidth: 0, flex: 1 }}><b>{selected.name}</b><small>{Number.isFinite(selected.wfScore) ? <u>{(selected.wfScore / 10).toFixed(1)}</u> : null}{selected.cat || "Nearby"}{selected.distMi != null ? ` · ${selected.distMi.toFixed(1)} mi from the venue` : ""}</small></span>
        <a className="wfev-go" href={selected.href}>Open</a><button type="button" className="wfev-x" aria-label="Close" onClick={() => setSel(null)}>×</button>
      </div> : null}
      {failed || unavailable ? <div className="wfev-fb"><div style={{ width: 42, height: 42, borderRadius: 14, background: "rgba(148,163,184,.14)", border: "1px solid rgba(148,163,184,.38)", display: "grid", placeItems: "center", color: "#FB923C", fontSize: 20 }}>⌁</div><div style={{ fontSize: 14, fontWeight: 800, color: "#F8FAFC" }}>{venue.name}</div><div style={{ maxWidth: 280, color: "#94A3B8", fontSize: 12, lineHeight: 1.5 }}>"The map preview is unavailable right now. The address and external navigation link are still available."</div>{!unavailable ? <button type="button" onClick={retry} style={{ marginTop: 4, padding: "9px 18px", borderRadius: 999, border: "1px solid rgba(249,115,22,.5)", background: "rgba(249,115,22,.14)", color: "#FB923C", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Try again</button> : null}</div> : null}
    </div>
  );
}
