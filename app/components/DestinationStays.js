"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchJsonWithDeadline } from "../../lib/clientJson.js";
import { validStayOrigin } from "../../lib/stayOrigin.js";
import EventStayCards from "./EventStayCards.js";
import RailLoading from "./RailLoading.js";
import RailHeading from "./RailHeading.js";
import { WF_PLACE_CARD_CSS } from "./css.js";

const REQUEST_DEADLINE_MS = 9500;
const MUTED = "#A99FA8";

export function destinationStaysParams(destination) {
  if (!destination || !validStayOrigin(Number(destination.lat), Number(destination.lng))) return null;
  return new URLSearchParams({ mode: "stays", lat: String(Number(destination.lat)), lng: String(Number(destination.lng)) });
}

export function DestinationStaysContent({ state, currentKey, destination, onRetry, selector = null }) {
  if (!currentKey || state.key !== currentKey || state.status === "idle") return null;
  const description = `Great stays a short drive from ${destination.name}, best rated first.`;
  if (state.status === "loading") return <section aria-label="Stay Near the Action" style={{ marginTop: 22 }}><RailHeading title="Stay Near the Action" description={description}>{selector}</RailHeading><RailLoading label={`Finding stays near ${destination.name}`} /></section>;
  if (state.status === "failed" || state.unavailable) return <section aria-label="Stay Near the Action" style={{ marginTop: 22 }}>
    <RailHeading title="Stay Near the Action" description={description}>{selector}</RailHeading>
    <p style={{ color: MUTED, fontSize: 13, margin: "8px 0" }}>Stays near {destination.name} couldn&apos;t load.</p>
    <button type="button" onClick={onRetry} style={{ border: "1px solid #7C2D12", borderRadius: 999, background: "#1C1014", color: "#FFF7ED", padding: "7px 12px", fontWeight: 800 }}>Try again</button>
  </section>;
  if (!state.places.length) return <section aria-label="Stay Near the Action" style={{ marginTop: 22 }}><RailHeading title="Stay Near the Action" description={description}>{selector}</RailHeading><p style={{ color: MUTED, fontSize: 13, margin: "8px 0" }}>No stays found within 12 miles of {destination.name}.</p></section>;
  return <section style={{ marginTop: 22 }} aria-label="Stay Near the Action">
    <style dangerouslySetInnerHTML={{ __html: WF_PLACE_CARD_CSS }} />
    <EventStayCards places={state.places} title="Stay Near the Action"
      description={description} label={`Hotels near ${destination.name}`} surface="fall_destination_stays"
      headingAction={selector} />
  </section>;
}

export default function DestinationStays({ destinations = [] }) {
  const valid = useMemo(() => (Array.isArray(destinations) ? destinations : []).filter((item) => destinationStaysParams(item)), [destinations]);
  const [selectedId, setSelectedId] = useState("");
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState({ key: "", status: "idle", places: [] });
  const selected = valid.find((item) => item.id === selectedId) || valid[0] || null;
  const params = destinationStaysParams(selected);
  const key = params ? params.toString() : "";

  useEffect(() => {
    if (!key) { setState({ key: "", status: "idle", places: [] }); return undefined; }
    let current = true;
    setState({ key, status: "loading", places: [] });
    fetchJsonWithDeadline("/api/trip-connections?" + key, { timeoutMs: REQUEST_DEADLINE_MS })
      .then((body) => {
        if (!current) return;
        if (!body || !Array.isArray(body.places)) throw new Error("Malformed destination stays response");
        setState({ key, status: "ready", places: body.places, unavailable: body?.unavailable === true });
      })
      .catch(() => { if (current) setState({ key, status: "failed", places: [] }); });
    return () => { current = false; };
  }, [key, retry]);

  if (!selected) return null;
  const selector = valid.length > 1 ? <label style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0, color: "#FFF7ED", fontSize: 13, fontWeight: 800 }}>
      Stay near
      <select aria-label="Stay near" value={selected.id} onChange={(event) => { setSelectedId(event.target.value); setRetry(0); }}
        style={{ minWidth: 0, maxWidth: "min(68vw, 360px)", border: "1px solid #7C2D12", borderRadius: 999, background: "#1C1014", color: "#FFF7ED", padding: "7px 11px", fontWeight: 700 }}>
        {valid.map((item) => {
          // A place-kind destination's city is a stored metro SLUG (e.g.
          // "manatee-sarasota"), never fit for a reader-facing label, and its
          // market name ("Manatee and Sarasota Counties, Florida") is far too
          // long for a one-line picker. An event-kind destination's city is a
          // real town name ("Tampa") and is kept. A slug shows the destination
          // name alone.
          const rawCity = String(item.city || "").trim();
          const cityLabel = rawCity && !/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(rawCity) && rawCity.length <= 24 ? rawCity : "";
          return <option key={item.id} value={item.id}>{item.name}{cityLabel ? ` · ${cityLabel}` : ""}</option>;
        })}
      </select>
    </label> : null;
  return <div className="wf-fall-destination-stays">
    {/* Stay-card value fix — .wf-rail-heading-controls holds the selector
        <label> and <RailNav> (the rail arrows) as two SIBLING children, but
        the shared base rule (css.js) never makes it a flex container: with
        no display:flex there, a block-level RailNav falls onto its own line
        below the inline-flex label, which is the dead gap the owner saw. This
        makes the whole controls row one true flex line (label first, arrows
        pinned to the end) at every width, and lets the label/select SHRINK
        instead of wrapping. At narrow widths the row itself still moves
        below the title/description (that is `.wf-rail-heading`'s own wrap,
        untouched) — but once it is on its own line, nothing inside it wraps
        again. */}
    <style dangerouslySetInnerHTML={{ __html: `
      .wf-fall-destination-stays .wf-rail-heading{align-items:flex-start;flex-wrap:wrap}
      .wf-fall-destination-stays .wf-rail-heading-controls{display:flex;align-items:center;justify-content:space-between;flex-wrap:nowrap;gap:10px;flex:0 1 auto;max-width:100%;min-width:0}
      .wf-fall-destination-stays .wf-rail-heading-controls>label{flex:1 1 auto;min-width:0;max-width:100%}
      .wf-fall-destination-stays .wf-rail-heading-controls select{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .wf-fall-destination-stays .wf-rail-heading-controls .wf-rail-nav{flex:0 0 auto}
      @media(max-width:520px){.wf-fall-destination-stays .wf-rail-heading-controls{width:100%;flex-basis:100%;margin-left:0}}
    ` }} />
    <DestinationStaysContent state={state} currentKey={key} destination={selected} selector={selector} onRetry={() => setRetry((value) => value + 1)} />
  </div>;
}
