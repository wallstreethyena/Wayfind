"use client";

// Nearby venue map. Actual driving directions live in EventDrivingRoute;
// this map never substitutes a two-point line for a road route.
import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, Marker, NavigationControl, LngLatBounds, setWorkerUrl } from "maplibre-gl";
import { safeRemoveMap } from "../../lib/mapTeardown";

// Same worker fix as MapView (v6.43): maplibre v6 derives its worker URL from
// import.meta.url, which Next rewrites to a file:// literal. Vendored copy.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const STYLE = "https://tiles.openfreemap.org/styles/positron";
const ACCENT = "#F97316";
const PICK = "#2EC9A6";

// A teardrop the reader can tell apart from the basemap at a glance: white
// stroke, soft shadow, and a white disc in the head that carries either the
// venue star or a rank numeral. Tip sits on the coordinate (anchor: bottom).
function teardropSvg({ w, h, fill, glyph, glyphSize }) {
  const cx = w / 2, headR = w * 0.36, headY = h * 0.33;
  return (
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>` +
    `<defs><filter id='s' x='-30%' y='-20%' width='160%' height='150%'><feDropShadow dx='0' dy='2' stdDeviation='2' flood-color='rgba(5,10,18,.55)'/></filter></defs>` +
    `<path filter='url(#s)' d='M${cx} ${h - 1} C ${cx - headR * 0.55} ${h * 0.74} ${cx - headR} ${h * 0.58} ${cx - headR} ${headY} A ${headR} ${headR} 0 1 1 ${cx + headR} ${headY} C ${cx + headR} ${h * 0.58} ${cx + headR * 0.55} ${h * 0.74} ${cx} ${h - 1} Z' fill='${fill}' stroke='#FFFFFF' stroke-width='2'/>` +
    `<circle cx='${cx}' cy='${headY}' r='${headR * 0.72}' fill='#FFFFFF'/>` +
    `<text x='${cx}' y='${headY + glyphSize * 0.36}' text-anchor='middle' font-family='-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif' font-weight='800' font-size='${glyphSize}' fill='#0B0F14'>${glyph}</text>` +
    `</svg>`
  );
}

function pinEl({ label, svg, cls }) {
  const el = document.createElement("div");
  el.className = cls;
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", label);
  el.innerHTML = svg;
  return el;
}

// No block comments inside this template: prose in a template literal ships to
// every reader (check-css-comment-bytes). Reasoning lives in the JS comments.
const CSS = `
.wfev{position:relative;border-radius:20px;overflow:hidden;border:1px solid rgba(148,163,184,.2);background:#0F1520;box-shadow:0 24px 60px rgba(0,0,0,.45),0 0 0 1px rgba(249,115,22,.08);isolation:isolate}
.wfev-canvas{position:absolute;inset:0}
.wfev-h{height:clamp(340px,52vw,460px)}
.wfev .maplibregl-ctrl-group{background:rgba(15,21,32,.92);border:1px solid rgba(148,163,184,.25);border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.35)}
.wfev .maplibregl-ctrl-group button{width:34px;height:34px;background:transparent}
.wfev .maplibregl-ctrl-group button+button{border-top:1px solid rgba(148,163,184,.2)}
.wfev .maplibregl-ctrl-group button .maplibregl-ctrl-icon{filter:invert(1) brightness(1.6)}
.wfev .maplibregl-ctrl-attrib{background:rgba(15,21,32,.7);color:#94A3B8;font-size:10px;border-radius:8px 0 0 0}
.wfev .maplibregl-ctrl-attrib a{color:#CBD5E1}
.wfev-pin{width:44px;height:58px;line-height:0;cursor:default}
.wfev-pin svg{display:block;width:44px;height:58px}
.wfev-pick{width:32px;height:42px;line-height:0;cursor:pointer;transition:transform .18s ease}
.wfev-pick svg{display:block;width:32px;height:42px}
.wfev-pick:hover,.wfev-pick[data-on="1"]{transform:translateY(-3px) scale(1.12)}
.wfev-you{position:relative;width:30px;height:34px;font-size:26px;line-height:34px;text-align:center;filter:drop-shadow(0 2px 3px rgba(15,23,35,.35))}
.wfev-you:before{content:"";position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:radial-gradient(circle,rgba(252,95,6,.85) 0%,rgba(252,95,6,0) 70%);animation:wfevGlow 2.6s ease-in-out infinite;pointer-events:none;will-change:opacity}
@keyframes wfevGlow{0%,100%{opacity:.35}50%{opacity:.9}}
@media (prefers-reduced-motion: reduce){.wfev-you:before{animation:none}.wfev-pick{transition:none}}
.wfev-chip{position:absolute;left:12px;top:12px;z-index:3;display:inline-flex;align-items:center;gap:9px;padding:9px 13px 9px 11px;border-radius:999px;background:rgba(10,15,23,.82);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(148,163,184,.28);color:#F8FAFC;font-size:13px;font-weight:800;box-shadow:0 10px 30px rgba(0,0,0,.35);max-width:calc(100% - 24px)}
.wfev-chip i{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:999px;background:${ACCENT};color:#0D1117;font-style:normal;font-size:13px;flex:0 0 auto}
.wfev-chip small{display:block;font-size:11px;font-weight:700;color:#94A3B8;margin-top:1px}
.wfev-chip b{display:block;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wfev-loc{position:absolute;right:12px;bottom:12px;z-index:3;display:inline-flex;align-items:center;gap:7px;padding:10px 14px;border-radius:999px;border:1px solid rgba(249,115,22,.55);background:rgba(249,115,22,.16);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:#FDBA74;font:inherit;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.35)}
.wfev-loc:hover{background:rgba(249,115,22,.26)}
.wfev-legend{position:absolute;left:12px;bottom:12px;z-index:3;display:flex;gap:10px;padding:7px 11px;border-radius:999px;background:rgba(10,15,23,.78);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(148,163,184,.22);color:#CBD5E1;font-size:11.5px;font-weight:700}
.wfev-legend span{display:inline-flex;align-items:center;gap:5px}
.wfev-legend em{width:9px;height:9px;border-radius:999px;display:inline-block}
.wfev-card{position:absolute;left:12px;right:12px;bottom:12px;z-index:4;display:flex;gap:12px;align-items:center;padding:10px;border-radius:16px;background:rgba(10,15,23,.9);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(46,201,166,.45);box-shadow:0 18px 40px rgba(0,0,0,.5);text-decoration:none;color:#F8FAFC}
.wfev-card img{width:58px;height:58px;border-radius:12px;object-fit:cover;background:linear-gradient(145deg,#1B2433,#0E1520);flex:0 0 auto}
.wfev-card b{display:block;font-size:14.5px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wfev-card small{display:block;font-size:12px;color:#94A3B8;font-weight:700;margin-top:3px}
.wfev-card u{text-decoration:none;color:#0D1117;background:${PICK};border-radius:999px;padding:2px 8px;font-size:12px;font-weight:800;margin-right:6px}
.wfev-card .wfev-x{margin-left:auto;flex:0 0 auto;width:30px;height:30px;border-radius:999px;border:1px solid rgba(148,163,184,.3);background:transparent;color:#CBD5E1;font:inherit;font-size:15px;cursor:pointer}
.wfev-card .wfev-go{flex:0 0 auto;padding:9px 13px;border-radius:11px;background:${PICK};color:#0D1117;font-size:13px;font-weight:800}
.wfev-fb{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:22px;text-align:center;background:linear-gradient(145deg,#17212E 0%,#0A111B 72%)}
@media (max-width:600px){.wfev-legend{display:none}.wfev-card .wfev-go{display:none}}
`;

function fitTo(map, points, pad) {
  if (!points.length) return;
  const b = new LngLatBounds([points[0].lng, points[0].lat], [points[0].lng, points[0].lat]);
  for (const p of points) b.extend([p.lng, p.lat]);
  const reduce = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  map.fitBounds(b, { padding: pad, maxZoom: 15.5, duration: reduce ? 0 : 700 });
}

const thumb = (p) => (p.photoRef
  ? "/api/photo?ref=" + encodeURIComponent(p.photoRef) + "&w=640"
  : "/api/photo?place=" + encodeURIComponent(p.id) + "&w=640");

/**
 * @param {{ venue: {name:string, lat:number, lng:number},
 *           picks?: Array<{id:string,name:string,lat:number,lng:number,cat?:string,wfScore?:number,distMi?:number,photoRef?:string,href:string}>,
 *           onSelect?: (id:string|null)=>void }} props
 */
export default function EventVenueMap({ venue, picks = [], onSelect }) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const pickEls = useRef(new Map());
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [gen, setGen] = useState(0);
  const [sel, setSel] = useState(null);

  const pins = picks.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng));

  // THE MAP. Built once per `gen` (Try again remounts it), torn down on unmount.
  useEffect(() => {
    if (!hostRef.current || !venue || !Number.isFinite(venue.lat) || !Number.isFinite(venue.lng)) return undefined;
    let map;
    let dead = false;
    const watchdog = setTimeout(() => { if (!dead) setFailed(true); }, 9000);
    try {
      map = new MapLibreMap({
        container: hostRef.current, style: STYLE,
        center: [venue.lng, venue.lat], zoom: 13.6,
        attributionControl: { compact: true }, cooperativeGestures: true,
        pitchWithRotate: false, dragRotate: false, touchPitch: false,
      });
    } catch (e) { clearTimeout(watchdog); setFailed(true); return undefined; }
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.on("error", (ev) => { if (ev && ev.error && /style|Failed to fetch/i.test(String(ev.error.message || ""))) setFailed(true); });
    map.on("load", () => {
      if (dead) return;
      clearTimeout(watchdog);
      pins.forEach((p, i) => {
        const el = pinEl({ label: `${i + 1}. ${p.name}`, cls: "wfev-pick", svg: teardropSvg({ w: 32, h: 42, fill: PICK, glyph: String(i + 1), glyphSize: 12 }) });
        el.setAttribute("role", "button"); el.tabIndex = 0;
        const pick = () => { setSel((cur) => (cur === p.id ? null : p.id)); };
        el.addEventListener("click", pick);
        el.addEventListener("keydown", (k) => { if (k.key === "Enter" || k.key === " ") { k.preventDefault(); pick(); } });
        pickEls.current.set(p.id, el);
        new Marker({ element: el, anchor: "bottom" }).setLngLat([p.lng, p.lat]).addTo(map);
      });
      // THE VENUE IS ADDED LAST so it paints ABOVE the picks. Seen on the
      // preview build: 3 Daughters sits 0.1 mi from pick #1, and drawn first
      // the star was buried under three teal pins — the one pin the page is
      // about was the one you could not see.
      new Marker({ element: pinEl({ label: `Venue: ${venue.name}`, cls: "wfev-pin", svg: teardropSvg({ w: 44, h: 58, fill: ACCENT, glyph: "★", glyphSize: 16 }) }), anchor: "bottom" })
        .setLngLat([venue.lng, venue.lat]).addTo(map);
      fitTo(map, [venue, ...pins], { top: 70, bottom: 60, left: 50, right: 50 });
      setReady(true);
    });
    return () => {
      dead = true; clearTimeout(watchdog);
      pickEls.current = new Map();
      mapRef.current = null;
      safeRemoveMap(map);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gen, venue && venue.lat, venue && venue.lng]);

  // Selection: the pin lifts, the card shows, the list under the map hears it.
  useEffect(() => {
    for (const [id, el] of pickEls.current) el.setAttribute("data-on", id === sel ? "1" : "0");
    if (onSelect) onSelect(sel);
    const map = mapRef.current, p = pins.find((x) => x.id === sel);
    if (map && p) {
      const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      map.easeTo({ center: [p.lng, p.lat], duration: reduce ? 0 : 450, offset: [0, -40] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  // Retry creates a fresh map and clears the previous selection.
  const retry = () => { setFailed(false); setReady(false); setSel(null); setGen((g) => g + 1); };
  const selected = sel ? pins.find((p) => p.id === sel) : null;

  return (
    <div className="wfev wfev-h" aria-label={`Map of ${venue.name}`}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div ref={hostRef} className="wfev-canvas" />
      {ready && pins.length > 0 && !selected ? (
        <div className="wfev-legend" aria-hidden="true">
          <span><em style={{ background: ACCENT }} />Venue</span>
          <span><em style={{ background: PICK }} />Nearby &amp; worth it</span>
        </div>
      ) : null}
      {selected ? (
        <div className="wfev-card" role="dialog" aria-label={selected.name}>
          <img src={thumb(selected)} alt="" loading="lazy" />
          <span style={{ minWidth: 0, flex: 1 }}>
            <b>{selected.name}</b>
            <small>
              {Number.isFinite(selected.wfScore) ? <u>{(selected.wfScore / 10).toFixed(1)}</u> : null}
              {selected.cat || "Nearby"}{selected.distMi != null ? ` · ${selected.distMi.toFixed(1)} mi from the venue` : ""}
            </small>
          </span>
          <a className="wfev-go" href={selected.href}>Open</a>
          <button type="button" className="wfev-x" aria-label="Close" onClick={() => setSel(null)}>×</button>
        </div>
      ) : null}
      {failed ? (
        <div className="wfev-fb">
          <div style={{ width: 42, height: 42, borderRadius: 14, background: "rgba(148,163,184,.14)", border: "1px solid rgba(148,163,184,.38)", display: "grid", placeItems: "center", color: "#FB923C", fontSize: 20 }}>⌁</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#F8FAFC" }}>{venue.name}</div>
          <div style={{ maxWidth: 260, color: "#94A3B8", fontSize: 12, lineHeight: 1.5 }}>The map could not load right now. The address and the directions button still work.</div>
          <button type="button" onClick={retry} style={{ marginTop: 4, padding: "9px 18px", borderRadius: 999, border: "1px solid rgba(249,115,22,.5)", background: "rgba(249,115,22,.14)", color: "#FB923C", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Try again</button>
        </div>
      ) : null}
    </div>
  );
}
