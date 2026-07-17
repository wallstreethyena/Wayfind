// scripts/test-card-booking.mjs — locks the card-level PAID booking link
// (owner: "multiple of these cards can be booked and they are not offering
// that to the user... no tracking will be generated"). Bookable Activities
// cards must carry the Tickets CTA through the verified /api/viator/go gate,
// and the card's kind gate must stay IDENTICAL to the Detail sheet's.
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-card-booking: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");

ok(/src: "place_card"/.test(home) && /\/api\/viator\/go\?q=/.test(home),
  "PlaceCard carries the paid booking CTA through /api/viator/go (attributed on every click)");
const sheet = home.match(/const kinds = \[([^\]]+)\];/);
const card = home.match(/const CARD_BOOKABLE_KINDS = \[([^\]]+)\];/);
ok(sheet && card, "both kind gates exist (sheet + card)");
const norm = (s) => s.split(",").map((x) => x.trim().replace(/["']/g, "")).filter(Boolean).sort().join("|");
ok(norm(sheet[1]) === norm(card[1]),
  "card gate kinds are IDENTICAL to the Detail-sheet tour gate — the two surfaces can never drift apart");
ok(/cardBookingHref\(p\)/.test(home), "CTA href is built by cardBookingHref (name + city + kind + placeId)");

const ctaLine = home.split("\n").find((l) => l.includes('src: "place_card"')) || "";
ok(/e\.stopPropagation\(\)/.test(ctaLine), "CTA click never hijacks the card tap (stopPropagation)");
ok(/target="_blank"/.test(ctaLine), "CTA opens in a new tab");
ok(/tickets_out/.test(ctaLine), "CTA click logs tickets_out for revenue tracking");
ok(/CARD_BOOKABLE_KINDS\.includes\(placeKind\(p\)\)/.test(home),
  "the CTA renders ONLY on bookable-kind cards (never restaurants/bars)");

console.log(`test-card-booking: OK — ${pass} assertions (paid booking link on bookable cards; gate locked to the sheet's)`);
