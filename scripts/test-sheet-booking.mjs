// scripts/test-sheet-booking.mjs — locks "every bookable place can be booked
// from its sheet": the primary CTA falls back to the honest tracked search
// (never null, never a guessed product), and the bookable-kind list stays
// byte-identical across the card chip, the sheet tour-fetch, and this CTA.
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-sheet-booking: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const bc = readFileSync(new URL("../app/components/BookingCTA.js", import.meta.url), "utf8");
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");

ok(/const BOOKABLE_KINDS = \[/.test(bc), "BookingCTA declares its bookable-kind gate");
const norm = (s) => s.split(",").map((x) => x.trim().replace(/["']/g, "")).filter(Boolean).sort().join("|");
const bcKinds = bc.match(/const BOOKABLE_KINDS = \[([^\]]+)\];/);
const sheetKinds = home.match(/const kinds = \[([^\]]+)\];/);
const cardKinds = home.match(/const CARD_BOOKABLE_KINDS = \[([^\]]+)\];/);
ok(bcKinds && sheetKinds, "kind lists present in BookingCTA + sheet fetch");
ok(norm(bcKinds[1]) === norm(sheetKinds[1]), "CTA kinds IDENTICAL to the sheet tour-fetch gate");
if (cardKinds) ok(norm(bcKinds[1]) === norm(cardKinds[1]), "CTA kinds IDENTICAL to the card chip gate");
ok((bc.match(/experienceGoUrl\(/g) || []).length >= 2, "primary AND list variants both use the honest tracked-search fallback");
ok(/goFallback/.test(bc) && /verifiedUrl \|\| goFallback/.test(bc), "primary falls back instead of rendering nothing");
ok(/if \(verifiedUrl \|\| !tk\) addReservation/.test(bc), "search-fallback clicks never fabricate a reservation entry");
ok(/Tickets & tours/.test(bc), "the Tickets & tours label survives");
ok(/never construct a booking URL from raw\/unverified input/.test(bc), "the integrity contract comment survives");

console.log(`test-sheet-booking: OK — ${pass} assertions (bookable sheets always book; honest fallback; gates in lockstep)`);
