// Guardrail: CTA truth. "Tickets & tours" may only render when real bookable
// products have been confirmed by the Viator fetch, and must route through
// the exact-product resolver, never a bare search page.
import { readFileSync } from "fs";
const s = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
const fail = (m) => { console.error("check-cta: FAIL — " + m); process.exit(1); };
if (!s.includes("_hasTours && Aff.ticketsUrl(detail)")) fail("tickets CTA no longer gated on confirmed products");
if (!s.includes('"/api/viator/go?q="')) fail("tickets CTA not routed through exact-product resolver");
const ungated = /const _tk = Aff\.ticketsUrl\(detail\);/.test(s);
if (ungated) fail("ungated ticketsUrl CTA reappeared");
console.log("check-cta: OK — Book/Tickets CTAs only when genuinely bookable, via resolver");
