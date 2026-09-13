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
  const description = `Hotels within 12 miles of ${destination.name}, ordered by Wayfind Score.`;
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
      description={description} label={`Hotels near ${destination.name}`} surface="fall_destination_stays" rankingAnchor={destination.name}
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
  const selector = valid.length > 1 ? <label style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#FFF7ED", fontSize: 13, fontWeight: 800 }}>
      Stay near
      <select aria-label="Stay near" value={selected.id} onChange={(event) => { setSelectedId(event.target.value); setRetry(0); }}
        style={{ maxWidth: "min(68vw, 360px)", border: "1px solid #7C2D12", borderRadius: 999, background: "#1C1014", color: "#FFF7ED", padding: "7px 11px", fontWeight: 700 }}>
        {valid.map((item) => <option key={item.id} value={item.id}>{item.name}{item.city ? ` · ${item.city}` : ""}</option>)}
      </select>
    </label> : null;
  return <div className="wf-fall-destination-stays">
    <style dangerouslySetInnerHTML={{ __html: `
      .wf-fall-destination-stays .wf-rail-heading{align-items:flex-start;flex-wrap:wrap}
      .wf-fall-destination-stays .wf-rail-heading-controls{flex:0 1 auto;max-width:100%;flex-wrap:wrap}
      @media(max-width:520px){.wf-fall-destination-stays .wf-rail-heading-controls{width:100%;flex-basis:100%;margin-left:0;justify-content:space-between}.wf-fall-destination-stays select{max-width:calc(100vw - 132px)!important}}
    ` }} />
    <DestinationStaysContent state={state} currentKey={key} destination={selected} selector={selector} onRetry={() => setRetry((value) => value + 1)} />
  </div>;
}
