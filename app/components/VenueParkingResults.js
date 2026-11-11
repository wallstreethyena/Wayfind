"use client";

import { useId } from "react";
import { parkingDirectionsUrl, parkingMapsUrl } from "../../lib/appleParking.js";

const CSS = `
.wfev-parking{color:#CBD5E1;font-size:13px;line-height:1.5}.wfev-parking p{margin:6px 0}.wfev-parking h3{margin:14px 0 4px;color:#F8FAFC;font-size:18px}.wfev-parking-list{list-style:none;margin:8px 0 0;padding:0}.wfev-parking-list li{padding:12px 0;border-top:1px solid rgba(148,163,184,.2)}
.wfev-parking-select{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;width:100%;padding:8px 10px;border:1px solid transparent;border-radius:11px;background:transparent;color:#F8FAFC;text-align:left;font:inherit;cursor:pointer}.wfev-parking-select[aria-pressed="true"]{border-color:rgba(249,115,22,.45);background:rgba(249,115,22,.12)}.wfev-parking-select b{display:block;font-size:14px;overflow-wrap:anywhere}.wfev-parking-select small{display:block;overflow-wrap:anywhere;color:#94A3B8;font-size:12px}.wfev-parking-identity{min-width:0}.wfev-parking-distance{flex:0 0 auto;text-align:right}.wfev-parking-rank{color:#FDBA74;font-size:12px;font-weight:800}.wfev-parking-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.wfev-parking .wfw-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:10px 16px;border-radius:13px;background:rgba(148,163,184,.08);border:1px solid rgba(148,163,184,.3);color:#F1F5F9;font:inherit;font-weight:800;text-decoration:none;cursor:pointer;box-sizing:border-box}.wfev-parking .wfw-btn:hover{border-color:rgba(249,115,22,.6);color:#FDBA74}.wfev-parking button:focus-visible,.wfev-parking a:focus-visible,.wfev-parking summary:focus-visible{outline:2px solid #FDBA74;outline-offset:2px}.wfev-parking-note{color:#94A3B8;font-size:12px}.wfev-parking-guide{margin-top:14px;border-top:1px solid rgba(148,163,184,.2)}.wfev-parking-guide summary{min-height:44px;padding:12px 0;cursor:pointer;color:#F8FAFC;font-weight:800}.wfev-parking-guide ul{padding-left:20px}.wfev-parking-guide li{margin:8px 0}
`;

function distanceLabel(meters) {
  if (!Number.isFinite(meters)) return "";
  const miles = meters / 1609.344;
  return miles < 0.1 ? `${Math.round(meters * 3.28084)} ft` : `${miles.toFixed(1)} mi`;
}

// Parking is navigation information, rather than a scored Wayfind place card.
export default function VenueParkingResults({ venue, places = [], status = "idle", selectedId, onSelect, onRetry, message, radiusMeters }) {
  const guideId = useId();
  const statusText = status === "loading" || status === "idle" ? "Finding parking near the venue…"
    : status === "error" ? (message || "Parking could not be loaded right now. Please try again.")
      : places.length ? `${places.length} parking ${places.length === 1 ? "option" : "options"} near ${venue.name}.`
        : `No parking found${Number.isFinite(radiusMeters) ? ` within ${(radiusMeters / 1609.344).toFixed(1)} mi` : " nearby"}. Check Apple Maps or the venue for other options.`;
  return <section className="wfev-parking" aria-label={`Parking near ${venue.name}`} aria-busy={status === "loading" || status === "idle"}>
    <style dangerouslySetInnerHTML={{ __html: CSS }} />
    <h3>Your parking guide</h3>
    <p>Choose a location, drive there, then open the walking route to {venue.name}.</p>
    <p role="status" aria-live="polite">{statusText}</p>
    {status === "error" && onRetry ? <button type="button" className="wfw-btn wfw-site" onClick={onRetry}>Try parking again</button> : null}
    {status === "success" && places.length ? <>
      <p className="wfev-parking-note">Closest listed first. Distances are straight-line to the venue, not walking routes{Number.isFinite(radiusMeters) ? `; searched within ${(radiusMeters / 1609.344).toFixed(1)} mi` : ""}.</p>
      <ol className="wfev-parking-list">{places.map((place, index) => <li key={place.id}>
        <button type="button" className="wfev-parking-select" aria-label={`Show ${place.name} on the map`} aria-describedby={`${guideId}-${index}`} aria-pressed={String(selectedId) === String(place.id)} onClick={() => onSelect?.(place.id)}><span className="wfev-parking-identity"><span className="wfev-parking-rank">{index === 0 ? "1 · Closest listed" : `${index + 1} · Alternative`}</span><b>{place.name}</b><small id={`${guideId}-${index}`}>{place.address || "Address not supplied. Check the location pin."}</small></span><span className="wfev-parking-distance">{distanceLabel(place.distanceMeters)}<small>to venue</small></span></button>
        <div className="wfev-parking-actions">
          <a className="wfw-btn wfw-site" href={parkingDirectionsUrl(place, venue, "drive")} target="_blank" rel="noopener noreferrer" aria-label={`Drive to ${place.name}`}>Drive here ↗</a>
          <a className="wfw-btn wfw-site" href={parkingDirectionsUrl(place, venue, "walk")} target="_blank" rel="noopener noreferrer" aria-label={`Walk from ${place.name} to ${venue.name}`}>Walk to venue ↗</a>
          <a className="wfw-btn wfw-site" href={parkingMapsUrl(place)} target="_blank" rel="noopener noreferrer" aria-label={`Check ${place.name} in Apple Maps`}>Location details ↗</a>
        </div>
      </li>)}</ol>
    </> : null}
    <div className="wfev-parking-actions">{parkingMapsUrl(venue, true) ? <a className="wfw-btn wfw-site" href={parkingMapsUrl(venue, true)} target="_blank" rel="noopener noreferrer">Find more parking in Apple Maps ↗</a> : null}</div>
    <p className="wfev-parking-note">Locations from Apple Maps. Fees, opening hours, accessible spaces and live availability are not supplied by this search. Nearby does not mean public or event-approved parking.</p>
    <details className="wfev-parking-guide">
      <summary>Before you park</summary>
      <ul>
        <li><b>Check access.</b> Follow the venue’s official parking instructions and posted signs. A nearby lot may be private or reserved for customers.</li>
        <li><b>Check the total cost.</b> Confirm the rate, payment method, time limit and closing time with the operator, including event pricing and re-entry rules.</li>
        <li><b>Check your route.</b> Use Walk to venue to see the actual route. The closest pin may have an entrance on another street or a longer walk.</li>
        <li><b>Check your needs.</b> Confirm accessible bays, a step-free route, garage height clearance or EV charging with the operator before relying on them.</li>
        <li><b>Plan the return.</b> Note your garage level or parking zone and make sure you can retrieve your car after the event.</li>
      </ul>
    </details>
  </section>;
}
