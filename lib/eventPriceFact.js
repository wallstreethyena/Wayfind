// lib/eventPriceFact.js
//
// THE PRICE LINE ON AN EVENT CARD (owner, 2026-10-08): "Use 'Free admission',
// 'Free admission · paid activities', 'Free tickets available · conditions
// apply' and 'Check ticket price'. Never imply the whole experience is free."
//
// The feed already carries the source-supported wording in e.price (curated
// rows through lib/eventVisitFacts.eventCostSummary). This only decides what a
// card prints when that string is missing or is a bare provider "Free":
//   - a bare "Free" reads "Free admission" (the same words the detail page uses);
//   - a ticketed event with no price reads "Check ticket price";
//   - anything else prints nothing. "Not ticketed" is NOT evidence of free: a
//     library talk or a scraped listing with no price stays silent.
export function eventPriceFact(e) {
  const p = String(e?.price ?? "").trim();
  if (p) return /^free$/i.test(p) ? "Free admission" : p;
  if (e?.ticketed === true) return "Check ticket price";
  return null;
}
