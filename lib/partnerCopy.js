// Voice: docs/wayfind-voice.md (owner direction, 2026-09-19).
// Wayfind leads; the action, product and real seller stay clear.
// A recommendation is not a verified lowest-price or exclusive-offer claim.
// card:true is the short, single-line form for rail/feed cards ("Tickets at
// Undercover Tourist ↗"): the long Wayfind-led form wrapped to two lines there.
// Detail pages keep the long form. The href is untouched either way.
export function partnerTicketLabel(merchant, { product = "event-ticket", arrow = true, card = false } = {}) {
  // card form: "Park tickets at Undercover Tourist ↗" (36 chars) overflowed the ~150px CTA box on
  // the 268px card, so a card says "Tickets" (the card itself already says which park).
  // movie-voucher: a discounted theater ticket good for any movie (not a showtime seat), so it sells
  // exactly that and names no merchant: "Save on movie tickets ↗".
  if (product === "movie-voucher") return `${card ? "" : "Wayfind pick · "}Save on movie tickets${arrow ? " ↗" : ""}`;
  const action = product === "park-admission" && !card ? "Park tickets" : product === "tour" ? "Tours" : product === "transfer" ? "Transfers" : product === "storage" ? "Luggage storage" : "Tickets";
  if (card) return buyCardLabel(merchant, product, arrow);
  return `Wayfind pick · ${action} at ${merchant}${arrow ? " ↗" : ""}`;
}

// 2026-10-25 (owner: "any of these place cards that has an affiliate should
// have a buy button ... at a glance should know that that can be purchased
// right there"). The card form LEADS WITH THE PURCHASE VERB so a glance reads
// "I can buy this here", and still names the real seller (docs/wayfind-voice.md).
// Width law: the old worst case "Tickets at Undercover Tourist ↗" (31 chars)
// was the measured ceiling of the 320px CTA box (check-place-card-standard).
// A label never exceeds that: when "verb product · seller" would, the product
// word drops and the verb + seller stays ("Buy at Undercover Tourist ↗").
export const BUY_CARD_MAX = 29;
export function buyCardLabel(merchant, product = "event-ticket", arrow = true) {
  const verb = product === "tour" || product === "transfer" || product === "storage" ? "Book" : "Buy";
  const thing = product === "tour" ? "a tour" : product === "transfer" ? "a transfer" : product === "storage" ? "storage" : "tickets";
  const tail = arrow ? " ↗" : "";
  const full = `${verb} ${thing} · ${merchant}${tail}`;
  return full.length <= BUY_CARD_MAX + (arrow ? 0 : 2) ? full : `${verb} at ${merchant}${tail}`;
}

// Is this card CTA a PURCHASE (the solid orange Buy button) rather than a
// navigation ("View details", "Read the guide", "Explore event")? An explicit
// flag wins; otherwise a sponsored link or a label that opens with a purchase
// verb. Orange-filled must always mean "you can buy this", never "more info".
const BUY_LABEL_RX = /^\s*(?:\S+\s)?(?:buy|book|get tickets|tickets\b|check rates|reserve)/i;
const NOT_BUY_RX = /^\s*(?:view|explore|read|see|open|directions|learn|more)\b/i;
export function isBuyCta(cta) {
  if (!cta) return false;
  if (cta.buy === false) return false;
  if (cta.buy === true) return true;
  const label = String(cta.label || "");
  if (NOT_BUY_RX.test(label)) return false;
  return !!cta.sponsored || BUY_LABEL_RX.test(label);
}
