"use client";
// "Reserve a table" — the wide button that fills the place card's EXISTING
// .wf-place-card-cta slot (the one hotel "Check rates" uses). Same look as that
// button (BookingCTA variant="primary" in the slot: bordered 14px radius, 13.5px
// 800 weight, C.light text, accent arrow); the slot's CSS pins anchors to 38px,
// so the same height is set inline because this is a <button>, not an <a>.
// No new colours, sizes or fonts. It never says a table is booked.
import { C } from "./kit";
import { openReserveSheet } from "../../lib/reserveOpen.js";

export function ReserveCta({ place, surface = "place_card" }) {
  const name = (place && place.name) || "this restaurant";
  return (
    <button
      type="button"
      data-reserve-cta="1"
      aria-label={"Reserve a table at " + name}
      onClick={(e) => { e.stopPropagation(); openReserveSheet(place, { surface }); }}
      style={{ flex: 1, width: "100%", minWidth: 0, height: 38, minHeight: 38, padding: "0 14px", background: "linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.018))", border: `1px solid ${C.border}`, borderRadius: 14, color: C.light, fontSize: 13.5, fontWeight: 800, lineHeight: 1.15, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", boxSizing: "border-box", fontFamily: "inherit" }}
    >
      <span>Reserve a table</span>
      <span aria-hidden="true" style={{ color: C.accent, fontSize: 16, lineHeight: 1 }}>{"›"}</span>
    </button>
  );
}

// DEFAULT export: the whole slot (wrapper plus button). The card loads this lazily, so the stopPropagation wrapper lives here too.
export default function ReserveCtaSlot({ place, surface }) {
  return <div className="wf-place-card-cta" onClick={(e) => e.stopPropagation()}><ReserveCta place={place} surface={surface} /></div>;
}
