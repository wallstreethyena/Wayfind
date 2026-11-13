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

export default function ReservePicks({ placeId, intent, point, title, exclude, onOpen, picks: given, onPick }) {
  // `picks` (from the concierge's alternatives card) skips the lookup; `onPick` keeps the tap inside the chat.
  const fixed = Array.isArray(given) ? given.filter((p) => p && p.placeId && p.name && p.placeId !== exclude).slice(0, 3) : null;
  const [state, setState] = useState(fixed ? { s: "ready", picks: fixed } : { s: "loading", picks: [] });
  const key = JSON.stringify([placeId || "", intent || null]);
  useEffect(() => {
    if (fixed) return undefined;
    let stop = false;
    const body = placeId
      ? { placeId, date: intent && intent.date, time: intent && intent.time, party: intent && intent.partySize }
      : { query: intent && intent.query, cuisine: intent && intent.cuisine, date: intent && intent.date, time: intent && intent.time, party: intent && intent.partySize };
    if (point && Number.isFinite(point.lat) && Number.isFinite(point.lng)) { body.lat = point.lat; body.lng = point.lng; }
    for (const k of Object.keys(body)) if (body[k] == null || body[k] === "") delete body[k];
    setState({ s: "loading", picks: [] });
    reserveFind(body).then((r) => {
      if (stop) return;
      const picks = r && r.ok && Array.isArray(r.picks) ? r.picks.filter((p) => p && p.placeId && p.name && p.placeId !== exclude).slice(0, 3) : null;
      setState(picks ? { s: "ready", picks } : { s: "error", picks: [] });
    });
    return () => { stop = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (state.s === "error") return null;
  const prefill = intent ? { date: intent.date || "", time: intent.time || "", partySize: intent.partySize || null } : null;
  return (
    <div data-reserve-picks="1" style={{ margin: "10px 0 4px" }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 8 }}>{title || "Try one of these"}</div>
      {state.s === "loading" ? <div style={{ fontSize: 13, color: C.muted }}>Looking for good spots</div> : null}
      {state.s === "ready" && !state.picks.length ? <div style={{ fontSize: 13, color: C.muted }}>No close matches right now.</div> : null}
      <div style={{ display: "grid", gap: 8 }}>
        {state.picks.map((p) => (
          <button key={p.placeId} type="button" data-reserve-pick={p.placeId} onClick={() => { if (onOpen) onOpen(p); if (onPick) onPick(p); else openPick(p, prefill); }}
            style={{ width: "100%", minHeight: 52, padding: "8px 14px", textAlign: "left", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, color: C.text, cursor: "pointer", fontFamily: "inherit", boxSizing: "border-box" }}>
            <div style={{ fontSize: 15, fontWeight: 800, overflowWrap: "anywhere" }}>{p.name}</div>
            <div style={{ fontSize: 12.5, color: C.muted, overflowWrap: "anywhere" }}>{[p.locality, Array.isArray(p.cuisines) ? p.cuisines.slice(0, 2).join(", ") : ""].filter(Boolean).join(" · ")}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
