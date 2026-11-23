"use client";
// "Reserve a table" — the wide button that fills the place card's EXISTING
// .wf-place-card-cta slot (the one hotel "Check rates" uses). Same compact
// place-card CTA look as BookingCTA inside the 268px card (bordered 11px
// radius, 11.5px 800 weight, C.light text, accent arrow; 30px desktop / 28px
// at <=430px via WF_PLACE_CARD_CSS). Inline height matches the slot's anchor
// rule because this is a <button>, not an <a>.
// No new colours, sizes or fonts. It never says a table is booked.
import { C } from "./kit";
import { openReserveSheet } from "../../lib/reserveOpen.js";
import { reserveLabel } from "../../lib/reserveCapability.js";

// lane picks the honest label (instant, request, handoff, ask); every lane opens the same concierge with this place selected.
export function ReserveCta({ place, surface = "place_card", lane = "instant" }) {
  const name = (place && place.name) || "this restaurant";
  const label = reserveLabel(lane) || reserveLabel("instant");
  return (
    <button
      type="button"
      data-reserve-cta="1"
      data-reserve-lane={lane}
      aria-label={label + " at " + name}
      onClick={(e) => { e.stopPropagation(); openReserveSheet(place, { surface, lane }); }}
      style={{ flex: 1, width: "100%", minWidth: 0, height: 30, minHeight: 30, padding: "0 12px", background: "linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.018))", border: `1px solid ${C.border}`, borderRadius: 11, color: C.light, fontSize: 11.5, fontWeight: 800, lineHeight: 1, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", boxSizing: "border-box", fontFamily: "inherit" }}
    >
      <span>{label}</span>
      <span aria-hidden="true" style={{ color: C.accent, fontSize: 14, lineHeight: 1 }}>{"›"}</span>
    </button>
  );
}

// DEFAULT export: the whole slot (wrapper plus button). The card loads this lazily, so the stopPropagation wrapper lives here too.
export default function ReserveCtaSlot({ place, surface, lane }) {
  return <div className="wf-place-card-cta" style={{ pointerEvents: "auto" }} onClick={(e) => e.stopPropagation()}><ReserveCta place={place} surface={surface} lane={lane} /></div>;
}
