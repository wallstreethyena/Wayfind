// Voice: docs/wayfind-voice.md (owner direction, 2026-09-19).
// Wayfind leads; the action, product and real seller stay clear.
// A recommendation is not a verified lowest-price or exclusive-offer claim.
// card:true is the short, single-line form for rail/feed cards ("Tickets at
// Undercover Tourist ↗"): the long Wayfind-led form wrapped to two lines there.
// Detail pages keep the long form. The href is untouched either way.
export function partnerTicketLabel(merchant, { product = "event-ticket", arrow = true, card = false } = {}) {
  // card form: "Park tickets at Undercover Tourist ↗" (36 chars) overflowed the ~150px CTA box on
  // the 268px card, so a card says "Tickets" (the card itself already says which park).
  const action = product === "park-admission" && !card ? "Park tickets" : product === "tour" ? "Tours" : "Tickets";
  return `${card ? "" : "Wayfind pick · "}${action} at ${merchant}${arrow ? " ↗" : ""}`;
}
