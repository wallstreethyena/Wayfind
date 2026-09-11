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
import EventPlacePhoto from "./EventPlacePhoto.js";
import EventVenueMapLoader from "./EventVenueMapLoader.js";
import EventRouteJump from "./EventRouteJump.js";
import { Suspense } from "react";
import EventStays from "./EventStays.js";
import { websiteHost } from "../../lib/placeWhere.js";

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
.wfw-nearcard{margin-top:14px;border-radius:22px;border:1px solid rgba(46,201,166,.26);background:linear-gradient(180deg,rgba(46,201,166,.06),rgba(13,19,28,.95));box-shadow:0 18px 44px rgba(0,0,0,.32);overflow:hidden}
.wfw-near{padding:18px 18px 18px}
.wfw-near-k{font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:${PICK};margin:0 0 6px}
.wfw-near h3{margin:0 0 4px;font-size:17px;font-weight:850;color:#F8FAFC;letter-spacing:-.2px}
.wfw-near p{margin:0 0 12px;font-size:13.5px;line-height:1.5;color:#94A3B8}
.wfw-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(250px,100%),1fr));gap:10px}
.wfw-p{display:flex;gap:12px;align-items:center;padding:8px;border-radius:14px;background:rgba(148,163,184,.06);border:1px solid rgba(148,163,184,.14);text-decoration:none;color:#F8FAFC;transition:border-color .15s ease,background .15s ease}
.wfw-p:hover{border-color:rgba(46,201,166,.55);background:rgba(46,201,166,.07)}
.wfw-p img{width:60px;height:60px;border-radius:11px;object-fit:cover;background:linear-gradient(145deg,#1B2433,#0E1520);flex:0 0 auto}
.wfw-n{position:absolute;left:-6px;top:-6px;width:22px;height:22px;border-radius:999px;background:${PICK};color:#0D1117;font-size:12px;font-weight:800;display:grid;place-items:center;border:2px solid #0F1520}
.wfw-th{display:block;position:relative;flex:0 0 60px;width:60px;height:60px}
.wfw-b{min-width:0;flex:1}
.wfw-b b{display:block;font-size:14.5px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wfw-b small{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin-top:4px;font-size:12.5px;font-weight:700;color:#94A3B8}
.wfw-b u{text-decoration:none;color:#0D1117;background:${PICK};border-radius:999px;padding:2px 8px;font-size:12px;font-weight:800}
.wfw-foot{padding:0 18px 16px;font-size:11.5px;color:#64748B}
@media (max-width:560px){.wfw-head{align-items:stretch;padding:16px 14px 12px}.wfw-acts{width:100%;flex:1 1 100%;display:grid;grid-template-columns:minmax(0,1fr)}.wfw-btn{width:100%}.wfw-map{padding:0 6px 6px}.wfw-near{padding:14px 14px 14px}}
`;

const thumbUrl = (p) => (p.photoRef
  ? "/api/photo?ref=" + encodeURIComponent(p.photoRef) + "&w=640"
  : "/api/photo?place=" + encodeURIComponent(p.id) + "&w=640");

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
  const pins = hasPoint ? picks.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng)) : [];
  return (
    <section className="wfw" aria-label="Where it is and how to get there">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
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
      </div>
      {/* v9.00 (owner, 2026-09-07, on the premium event page): "near this
          event" recommendations must be "clearly separated … and cannot be
          mistaken for the venue the user is buying a ticket to". Before this
          the nearby cards sat INSIDE the same .wfw-card as the venue's own
          address and buttons — one bordered box, one accent color, nothing
          telling a reader that photo #2 in the grid is a different business
          down the street, not part of what they are about to pay for. This
          is now its own card: a different accent (teal, the same color as
          the numbered pins, never the venue card's orange), its own border
          and background, and a heading that says in words that these are
          not the venue. */}
      {pins.length > 0 ? (
        <div className="wfw-nearcard" aria-label={"Other places near " + (venue || "the venue") + " — not the venue itself"}>
          <div className="wfw-near">
            <p className="wfw-near-k">Nearby — not the venue</p>
            <h3>Worth a stop near {venue || "here"}</h3>
            <p>Separate places, not part of {venue || "the event"} — ranked by Wayfind. The numbers match the pins on the map above.</p>
            <div className="wfw-grid">
              {pins.map((p, i) => (
                <a key={p.id} className="wfw-p" href={p.href}>
                  <span className="wfw-th">
                    <EventPlacePhoto src={thumbUrl(p)} name={p.name} />
                    <span className="wfw-n" aria-hidden="true">{i + 1}</span>
                  </span>
                  <span className="wfw-b">
                    <b>{p.name}</b>
                    <small>
                      {Number.isFinite(p.wfScore) ? <u>{(p.wfScore / 10).toFixed(1)}</u> : null}
                      <span>{p.cat || "Nearby"}{p.distMi != null ? ` · ${p.distMi.toFixed(1)} mi` : ""}</span>
                    </small>
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {hasPoint ? <Suspense fallback={null}><EventStays lat={lat} lng={lng} venue={venue} /></Suspense> : null}
    </section>
  );
}
