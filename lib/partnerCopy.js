// Voice: docs/wayfind-voice.md (owner direction, 2026-09-19).
// Wayfind leads; the action, product and real seller stay clear.
// A recommendation is not a verified lowest-price or exclusive-offer claim.
export function partnerTicketLabel(merchant, { product = "event-ticket", arrow = true } = {}) {
  const action = product === "park-admission" ? "Park tickets" : "Tickets";
  return `Wayfind pick · ${action} at ${merchant}${arrow ? " ↗" : ""}`;
}
