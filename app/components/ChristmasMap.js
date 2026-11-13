"use client";
// The Christmas Map view: every verified pin in the current result set on
// Apple Maps (free pins, owner rule), loaded only when the visitor opens it.
// Pins come from /api/christmas/browse?pins=1 (lib/christmasMap.js): a listing
// without an exact location is never pinned, so it is only in the list. The
// selected pin's name and link sit BELOW the map, never over it.
import { useEffect, useMemo, useState } from "react";
import AppleExplorerMap from "./AppleExplorerMap.js";

const CSS = `
.xmap{margin:14px 0 0}
.xmap-box{position:relative;height:340px;overflow:hidden;border:1px solid #E8B48A40;border-radius:16px;background:#F3F0E8}
.xmap-note{margin:10px 0 0;color:#E1C6B6;font-size:13px;line-height:1.45}
.xmap-pick{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin:10px 0 0;padding:12px 14px;border:1px solid #E8B48A55;border-radius:14px;background:linear-gradient(160deg,#3E0C19,#230710 80%);color:#FFF7ED}
.xmap-pick strong{display:block;font-family:Georgia,serif;font-size:16px;font-weight:500;line-height:1.25}.xmap-pick span{display:block;margin-top:3px;color:#E1C6B6;font-size:13px}
.xmap-open{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border:1px solid #E8B48A;border-radius:12px;background:linear-gradient(180deg,#FFE9C8,#E8C395);color:#3D0914;font-size:14px;font-weight:800;text-decoration:none}
.xmap-open:focus-visible{outline:2px solid #FFE9C8;outline-offset:3px}
@media(min-width:720px){.xmap-box{height:440px}}
`;
const FLORIDA = { lat: 28.2, lng: -82.3 };
const KEYS = ["region", "category", "when", "date", "price", "audience", "undated", "q", "lat", "lng", "sort"];

export function pinsUrl(query) {
  const params = new URLSearchParams();
  for (const k of KEYS) if (query && query[k] !== undefined && query[k] !== "" && query[k] !== false && query[k] !== null) params.set(k, query[k] === true ? "1" : String(query[k]));
  params.set("pins", "1");
  return "/api/christmas/browse?" + params.toString();
}

export default function ChristmasMap({ query }) {
  const [pins, setPins] = useState(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState(null);
  const url = pinsUrl(query);
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false); setPicked(null);
    fetch(url, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("status " + r.status))))
      .then((json) => setPins(Array.isArray(json.pins) ? json.pins : []))
      .catch((error) => { if (error?.name !== "AbortError") setFailed(true); });
    return () => controller.abort();
  }, [url]);
  const events = useMemo(() => (pins || []).map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, name: p.title, city: p.city })), [pins]);
  const center = query && query.lat && query.lng ? { lat: Number(query.lat), lng: Number(query.lng) } : FLORIDA;
  const chosen = picked ? (pins || []).find((p) => p.id === picked) : null;
  return <div className="xmap" data-christmas-map="" data-map-pins={pins ? pins.length : ""}>
    <style dangerouslySetInnerHTML={{ __html: CSS }} />
    {failed ? <p className="xmap-note" role="status">We could not load the map. Try again in a moment.</p>
      : pins === null ? <p className="xmap-note" role="status">Loading the map…</p>
      : !pins.length ? <p className="xmap-note" role="status">No places with an exact location match this filter. They are all in the list below.</p>
      : <>
        <div className="xmap-box"><AppleExplorerMap events={events} center={center} fit showOrigin={false} selectedId={picked} onSelectEvent={(e) => setPicked(e && e.id ? String(e.id) : null)} /></div>
        <p className="xmap-note" role="status">{pins.length} {pins.length === 1 ? "place" : "places"} on the map. Listings without an exact spot are only in the list.</p>
        {chosen ? <div className="xmap-pick" data-map-pick="">
          <div><strong>{chosen.title}</strong>{chosen.city ? <span>{chosen.city}</span> : null}</div>
          {chosen.href ? <a className="xmap-open" href={chosen.href} {...(chosen.href.startsWith("/") ? {} : { target: "_blank", rel: "noopener noreferrer" })}>Open details</a> : null}
        </div> : null}
      </>}
  </div>;
}
