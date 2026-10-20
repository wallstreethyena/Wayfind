"use client";

import { parkingDirectionsUrl } from "../../lib/appleParking.js";

const CSS = `
.wfev-parking{color:#CBD5E1;font-size:13px;line-height:1.5}.wfev-parking p{margin:6px 0}.wfev-parking-list{list-style:none;margin:8px 0 0;padding:0}.wfev-parking-list li{padding:12px 0;border-top:1px solid rgba(148,163,184,.2)}
.wfev-parking-select{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;width:100%;padding:8px 10px;border:1px solid transparent;border-radius:11px;background:transparent;color:#F8FAFC;text-align:left;font:inherit;cursor:pointer}.wfev-parking-select[aria-pressed="true"]{border-color:rgba(249,115,22,.45);background:rgba(249,115,22,.12)}.wfev-parking-select b{font-size:14px;overflow-wrap:anywhere}.wfev-parking-select small{flex:0 0 auto;color:#94A3B8;font-size:12px}.wfev-parking-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.wfev-parking .wfw-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:10px 16px;border-radius:13px;background:rgba(148,163,184,.08);border:1px solid rgba(148,163,184,.3);color:#F1F5F9;font:inherit;font-weight:800;text-decoration:none;cursor:pointer;box-sizing:border-box}.wfev-parking .wfw-btn:hover{border-color:rgba(249,115,22,.6);color:#FDBA74}.wfev-parking button:focus-visible,.wfev-parking a:focus-visible{outline:2px solid #FDBA74;outline-offset:2px}.wfev-parking-note{color:#94A3B8;font-size:12px}
`;

function distanceLabel(meters) {
  if (!Number.isFinite(meters)) return "";
  const miles = meters / 1609.344;
  return miles < 0.1 ? `${Math.round(meters * 3.28084)} ft` : `${miles.toFixed(1)} mi`;
}

// Parking is navigation information, rather than a scored Wayfind place card.
export default function VenueParkingResults({ venue, places = [], status = "idle", selectedId, onSelect, onRetry, message, radiusMeters }) {
  const statusText = status === "loading" || status === "idle" ? "Finding parking near the venue…"
    : status === "error" ? (message || "Parking could not be loaded right now. Please try again.")
      : places.length ? `${places.length} parking ${places.length === 1 ? "option" : "options"} near ${venue.name}.`
        : `No parking found${Number.isFinite(radiusMeters) ? ` within ${(radiusMeters / 1609.344).toFixed(1)} mi` : " nearby"}. Try checking Apple Maps for more options.`;
  return <section className="wfev-parking" aria-label={`Parking near ${venue.name}`} aria-busy={status === "loading" || status === "idle"}>
    <style dangerouslySetInnerHTML={{ __html: CSS }} />
    <p role="status" aria-live="polite">{statusText}</p>
    {status === "error" ? <button type="button" className="wfw-btn wfw-site" onClick={onRetry}>Try parking again</button> : null}
    {status === "success" && places.length ? <>
      <p className="wfev-parking-note">Distances are straight-line to the venue, not walking routes. Check access, hours and fees.</p>
      <ul className="wfev-parking-list">{places.map((place) => <li key={place.id}>
        <button type="button" className="wfev-parking-select" aria-label={`Show ${place.name} on the map`} aria-pressed={String(selectedId) === String(place.id)} onClick={() => onSelect?.(place.id)}><b>{place.name}</b><small>{distanceLabel(place.distanceMeters)}</small></button>
        <div className="wfev-parking-actions">
          <a className="wfw-btn wfw-site" href={parkingDirectionsUrl(place, venue, "drive")} target="_blank" rel="noopener noreferrer" aria-label={`Drive to ${place.name}`}>Drive here ↗</a>
          <a className="wfw-btn wfw-site" href={parkingDirectionsUrl(place, venue, "walk")} target="_blank" rel="noopener noreferrer" aria-label={`Walk from ${place.name} to ${venue.name}`}>Walk to venue ↗</a>
        </div>
      </li>)}</ul>
    </> : null}
  </section>;
}
