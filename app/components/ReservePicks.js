"use client";
// Up to three "pick" chips from POST /api/reserve/find. Used three ways: similar places inside the reserve sheet
// (placeId mode), and table picks for a request typed to Santa or Boo (intent mode). A tap reopens the Reserve sheet for
// that place, prefilled with the day, time and party. Lazy: the sheet and the companion import it on demand.
import { useEffect, useState } from "react";
import { C } from "./kit";
import { reserveFind } from "../../lib/reserveClientApi.js";

export function openPick(pick, prefill) {
  return import("./ReserveSheet.js").then((m) => m.showReserveSheet({ id: pick.placeId, name: pick.name }, { surface: "reserve_picks", prefill: prefill || null }));
}

// What each pick can honestly do (owner 2026-11-14): book here, hand off to OpenTable, or no online route.
const PATH_NOTE = { wayfind: "Book on Wayfind", opentable: "Book on OpenTable", none: "No online booking" };

export default function ReservePicks({ placeId, intent, point, area, title, exclude, onOpen, picks: given, onPick }) {
  // `picks` (from the concierge's alternatives card) skips the lookup; `onPick` keeps the tap inside the chat.
  const fixed = Array.isArray(given) ? given.filter((p) => p && p.placeId && p.name && p.placeId !== exclude).slice(0, 3) : null;
  const [state, setState] = useState(fixed ? { s: "ready", picks: fixed } : { s: "loading", picks: [] });
  const [wide, setWide] = useState(false); // the visitor's explicit "look wider" choice, never automatic
  const where = area && Number.isFinite(area.lat) && Number.isFinite(area.lng) ? area : point;
  const key = JSON.stringify([placeId || "", intent || null, where ? [where.lat, where.lng] : null, wide]);
  useEffect(() => {
    if (fixed) return undefined;
    let stop = false;
    const body = placeId
      ? { placeId, date: intent && intent.date, time: intent && intent.time, party: intent && intent.partySize }
      : { query: intent && intent.query, cuisine: intent && intent.cuisine, date: intent && intent.date, time: intent && intent.time, party: intent && intent.partySize };
    if (where && Number.isFinite(where.lat) && Number.isFinite(where.lng)) { body.lat = where.lat; body.lng = where.lng; }
    if (wide) body.wide = true;
    for (const k of Object.keys(body)) if (body[k] == null || body[k] === "") delete body[k];
    setState({ s: "loading", picks: [] });
    reserveFind(body).then((r) => {
      if (stop) return;
      const picks = r && r.ok && Array.isArray(r.picks) ? r.picks.filter((p) => p && p.placeId && p.name && p.placeId !== exclude).slice(0, 3) : null;
      setState(picks ? { s: "ready", picks, needsArea: Boolean(r.needsArea) } : { s: "error", picks: [] });
    });
    return () => { stop = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (state.s === "error") return null;
  const prefill = intent ? { date: intent.date || "", time: intent.time || "", partySize: intent.partySize || null } : null;
  return (
    <div data-reserve-picks="1" style={{ margin: "10px 0 4px" }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 8 }}>{title || "Try one of these"}</div>
      {state.s === "loading" ? <div style={{ fontSize: 13, color: C.muted }}>Looking for good spots</div> : null}
      {state.s === "ready" && !state.picks.length && state.needsArea ? <div data-reserve-picks-empty="area" style={{ fontSize: 13, color: C.muted }}>Tell me which city and I'll look there.</div> : null}
      {state.s === "ready" && !state.picks.length && !state.needsArea ? (
        <div data-reserve-picks-empty="none" style={{ fontSize: 13, color: C.muted }}>
          {wide ? "Nothing within an hour's drive either. Try another city or a restaurant name." : "Nothing good within 25 miles right now."}
          {!wide && where && !placeId ? (
            <button type="button" data-reserve-picks-wider="1" onClick={() => setWide(true)}
              style={{ display: "block", marginTop: 8, minHeight: 44, padding: "8px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 999, color: C.text, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Look up to 60 miles away
            </button>
          ) : null}
        </div>
      ) : null}
      <div style={{ display: "grid", gap: 8 }}>
        {state.picks.map((p) => (
          <button key={p.placeId} type="button" data-reserve-pick={p.placeId} onClick={() => { if (onOpen) onOpen(p); if (onPick) onPick(p); else openPick(p, prefill); }}
            style={{ width: "100%", minHeight: 52, padding: "8px 14px", textAlign: "left", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, color: C.text, cursor: "pointer", fontFamily: "inherit", boxSizing: "border-box" }}>
            <div style={{ fontSize: 15, fontWeight: 800, overflowWrap: "anywhere" }}>{p.name}</div>
            <div style={{ fontSize: 12.5, color: C.muted, overflowWrap: "anywhere" }}>{[p.locality, Array.isArray(p.cuisines) ? p.cuisines.slice(0, 2).join(", ") : "", PATH_NOTE[p.path] || ""].filter(Boolean).join(" · ")}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
