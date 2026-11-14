"use client";
// "Reserve a table" sheet. Lazy: lib/reserveOpen.js openReserveSheet() imports this file on the first tap.
// The sheet is only a host: the conversation, times, booking, request and OpenTable handoff all live in
// ReserveConcierge (Claude in the same chat). The OpenTable link always comes from the server (/api/reserve/go), never built here.
import ReserveConcierge from "./ReserveConcierge.js";
import { Shell, showInHost } from "./reserveUi.js";
import { C } from "./kit";
import { timeLabel, dateLabel } from "../../lib/reserveClientApi.js";
import { reserveLabel } from "../../lib/reserveCapability.js";

// A tap on a pick chip hands over what the guest already chose, as plain words for the concierge.
function seedMessage(pf) {
  if (!pf || (!pf.date && !pf.partySize && !pf.time)) return "";
  return ["Table", pf.partySize ? "for " + pf.partySize : "", pf.date ? "on " + dateLabel(pf.date) + " (" + pf.date + ")" : "", pf.time ? "around " + timeLabel(pf.time) : ""].filter(Boolean).join(" ");
}

export function ReserveSheet({ place, surface, lane, prefill, onClose }) {
  const name = (place && place.name) || "this restaurant";
  const openMine = () => { import("./ReserveHistory.js").then((m) => m.showReserveHistory()).catch(() => {}); };
  const header = (
    <button type="button" data-reserve-mine="1" onClick={openMine} style={{ background: "none", border: "none", padding: "0 0", minHeight: 44, color: C.accent, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>My reservations</button>
  );
  return (
    <Shell title={reserveLabel(lane) || "Find a table"} sub={name} onClose={onClose} extra={header}>
      <ReserveConcierge initialPlace={place} initialMessage={seedMessage(prefill)} />
    </Shell>
  );
}

export function showReserveSheet(place, opts) {
  if (typeof document === "undefined" || !place || !place.id) return;
  const o = opts || {};
  showInHost((close) => <ReserveSheet place={place} surface={o.surface || "place_card"} lane={o.lane || null} prefill={o.prefill || null} onClose={close} />);
}

export default ReserveSheet;
