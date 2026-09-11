// app/components/EventWhere.js — THE ONE "WHERE" BLOCK FOR EVERY EVENT PAGE.
//
// Owner, 2026-09-06: "the events page does not have the address nor the
// website for the place … a map … showing the location of the place and the
// direction already mapped out … the recommendation of nearby worth it to be
// display in the map also make this look premium … this will be the rule
// globally to every event page."
//
// So there is one block, and both event surfaces render it:
//   /florida-events/[slug]   (curated wf_events rows)
//   /events/[city]/[slug]    (live provider rows)
// It takes the fields lib/placeWhere.js already derives — the human address
// line, the directions URL, the website — plus the ranked nearby places from
// lib/eventPairings.js, and draws: venue name, FULL address, the two buttons
// a reader actually needs (directions, official site), the interactive map
// (EventVenueMap) and the numbered "Nearby & worth it" cards whose numbers
// match the pins. A page that only knows the city (no coordinates) still gets
// the address card and the buttons; the map simply is not drawn, because a
// pin in the middle of a city is a claim we cannot back.
//
// Server component. The map is client-only behind EventVenueMapLoader.
import EventVenueMapLoader from "./EventVenueMapLoader.js";
import EventRouteJump from "./EventRouteJump.js";
import EventNearbyCards from "./EventNearbyCards.js";
import EventStays from "./EventStays.js";
import { WF_PLACE_CARD_CSS } from "./css.js";
import { websiteHost } from "../../lib/placeWhere.js";
import { Suspense } from "react";

const ACCENT = "#F97316";
const PICK = "#2EC9A6";

const CSS = `
.wfw,.wfw *{box-sizing:border-box}
.wfw{min-width:0;margin:22px 0 8px}
.wfw-card{position:relative;border-radius:22px;border:1px solid rgba(148,163,184,.18);background:linear-gradient(180deg,rgba(23,32,46,.92),rgba(13,19,28,.96));box-shadow:0 24px 60px rgba(0,0,0,.4),0 0 0 1px rgba(249,115,22,.06);overflow:hidden}
.wfw-card:before{content:"";position:absolute;inset:0 0 auto 0;height:1px;background:linear-gradient(90deg,transparent,rgba(249,115,22,.7),transparent);pointer-events:none}
.wfw-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:14px 18px;padding:18px 18px 14px}
.wfw-k{font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:${ACCENT};margin:0 0 6px}
.wfw-name{font-size:clamp(19px,2.6vw,24px);font-weight:850;letter-spacing:-.3px;color:#F8FAFC;line-height:1.15;margin:0}
.wfw-addr{margin:6px 0 0;font-size:14.5px;line-height:1.5;color:#CBD5E1}
.wfw-addr a{color:inherit;text-decoration:none;border-bottom:1px dotted rgba(203,213,225,.45)}
.wfw-addr a:hover{color:#FDBA74;border-bottom-color:#FDBA74}
.wfw-acts{min-width:0;max-width:100%;display:flex;flex:1 1 320px;flex-wrap:wrap;justify-content:flex-end;gap:10px}
.wfw-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-width:0;padding:12px 18px;border-radius:13px;font-size:14.5px;font-weight:800;text-decoration:none;max-width:100%;white-space:normal;overflow-wrap:anywhere;line-height:1.4;transition:transform .15s ease,box-shadow .15s ease}
.wfw-btn:hover{transform:translateY(-1px)}
.wfw-dir{background:${ACCENT};border:1px solid ${ACCENT};color:#0D1117;box-shadow:0 10px 26px rgba(249,115,22,.28)}
.wfw-site{background:rgba(148,163,184,.08);border:1px solid rgba(148,163,184,.3);color:#F1F5F9}
.wfw-site:hover{border-color:rgba(249,115,22,.6);color:#FDBA74}
.wfw-official{flex-direction:column;gap:1px}
.wfw-official small{display:block;max-width:100%;font-weight:700;color:#94A3B8;font-size:12px;line-height:1.35;overflow-wrap:anywhere}
.wfw-map{padding:0 10px 10px}
.wfw-nearcard{margin:14px 10px 10px;border-radius:18px;border:1px solid rgba(46,201,166,.26);background:linear-gradient(180deg,rgba(46,201,166,.06),rgba(13,19,28,.95));box-shadow:0 18px 44px rgba(0,0,0,.32);overflow:hidden}
.wfw-near{padding:22px 18px 18px}
.wfw-near-k{font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:${PICK};margin:0 0 6px}
.wfw-near h3{margin:0 0 4px;font-size:17px;font-weight:850;color:#F8FAFC;letter-spacing:-.2px}
.wfw-near p{margin:0 0 16px;font-size:13.5px;line-height:1.5;color:#94A3B8}
.wf-event-nearby-rail{margin:0;padding-block:4px 12px}
.wfw-foot{padding:0 18px 16px;font-size:11.5px;color:#64748B}
@media (max-width:560px){.wfw-head{align-items:stretch;padding:16px 14px 12px}.wfw-acts{width:100%;flex:1 1 100%;display:grid;grid-template-columns:minmax(0,1fr)}.wfw-btn{width:100%}.wfw-map{padding:0 6px 6px}.wfw-near{padding:14px 14px 14px}}
`;

// One admission boundary feeds both children. If a row cannot produce a real
// scored place card or a truthful map pin, it belongs in neither. Keeping this
// as one ordered array makes card rank N and map pin N the same place by
// construction, including after malformed provider rows are removed.
export function eventNearbyPlaces(picks, hasPoint) {
  if (!hasPoint || !Array.isArray(picks)) return [];
  return picks.filter((place) => place
    && place.id
    && place.name
    && typeof place.href === "string"
    && place.href.length > 0
    && Number.isFinite(place.lat)
    && Number.isFinite(place.lng)
    && Number.isFinite(place.distMi)
    && place.distMi >= 0
    && Number.isFinite(place.wfScore)
    && place.wfScore > 0
    && place.wfScore <= 100);
}

/**
 * @param {{
 *   venue: string,                 // venue name (falls back to the event name)
 *   address: string,               // lib/placeWhere.addressLine(row)
 *   directionsHref: string|null,   // lib/placeWhere.appleDirectionsUrl(row)
 *   website: string|null,          // gated URL, or null
 *   lat?: number, lng?: number,
 *   picks?: object[],              // lib/eventPairings rows + href
 *   sponsoredWebsite?: boolean,    // rel=sponsored when the link earns
 * }} props
 */
export default function EventWhere({ venue, address, directionsHref, website, lat, lng, picks = [], sponsoredWebsite = false }) {
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  if (!venue && !address) return null;
  const host = website ? websiteHost(website) : "";
  const pins = eventNearbyPlaces(picks, hasPoint);
  return (
    <section id="event-location" data-event-section="Map & directions" tabIndex={-1} className="wfw" aria-label="Where it is and how to get there">
      <style dangerouslySetInnerHTML={{ __html: WF_PLACE_CARD_CSS + CSS }} />
      <div className="wfw-card">
        <div className="wfw-head">
          <div style={{ minWidth: 0, flex: "1 1 260px" }}>
            <p className="wfw-k">Where it is</p>
            <h2 className="wfw-name">{venue || address}</h2>
            {address && address !== venue ? (
              <p className="wfw-addr">{directionsHref
                ? <a href={directionsHref} target="_blank" rel="noopener nofollow" aria-label={"Open " + address + " in Apple Maps"}>{address}</a>
                : address}</p>
            ) : null}
          </div>
          {hasPoint || directionsHref || website ? (
            <div className="wfw-acts">
              {hasPoint ? (
                <EventRouteJump>→ Plan your drive</EventRouteJump>
              ) : directionsHref ? (
                <a className="wfw-btn wfw-dir" href={directionsHref} target="_blank" rel="noopener nofollow" aria-label={"Get directions to " + (venue || address)}>{"→ Get directions"}</a>
              ) : null}
              {hasPoint && directionsHref ? (
                <a className="wfw-btn wfw-site" href={directionsHref} target="_blank" rel="noopener nofollow" aria-label={"Open directions to " + (venue || address) + " in Apple Maps"}>Open in Apple Maps ↗</a>
              ) : null}
              {website ? (
                <a className="wfw-btn wfw-site wfw-official" href={website} target="_blank" rel={(sponsoredWebsite ? "sponsored " : "") + "nofollow noopener"} aria-label={"Official site for " + (venue || address)}>
                  <span>Official site ↗</span>{host ? <small>{host}</small> : null}
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
        {hasPoint ? (
          <div className="wfw-map">
            <EventVenueMapLoader venue={{ name: venue || address, lat, lng }} picks={pins} directionsHref={directionsHref} />
          </div>
        ) : null}
        {hasPoint ? <div className="wfw-foot">The orange pin marks the event venue. Numbered teal pins match the nearby places below.</div> : null}
        {/* v9.01 (owner, 2026-09-11): map results belong inside the map
            panel as the standard horizontal IconicPlaceCard rail. They remain
            unmistakably separate from the ticketed venue through the teal
            pin color, border, label, heading, and explicit "not the venue"
            copy. The prior portrait-photo grid and its second standalone
            panel are gone. */}
        {pins.length > 0 ? (
          <section id="event-nearby" data-event-section="Nearby places" tabIndex={-1} className="wfw-nearcard" aria-label={"Other places near " + (venue || "the venue") + " — not the venue itself"}>
            <div className="wfw-near">
              <p className="wfw-near-k">Nearby — not the venue</p>
              <h3>Worth a stop near {venue || "here"}</h3>
              <p>Separate places, not part of {venue || "the event"} — ranked by Wayfind. The numbers match the pins on the map above.</p>
              <EventNearbyCards places={pins} />
            </div>
          </section>
        ) : null}
      </div>
      {hasPoint ? <Suspense fallback={null}><EventStays lat={lat} lng={lng} venue={venue} /></Suspense> : null}
    </section>
  );
}
