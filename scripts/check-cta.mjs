// Guardrail: CTA truth. "Tickets & tours" may only render when real bookable
// products have been confirmed by the Viator fetch, and must route through
// the exact-product resolver, never a bare search page.
import { readFileSync } from "fs";
import { shellSrc } from "./lib/shellSrc.mjs";
const s = shellSrc(); // G0: greps the whole home shell (home.js + kit + screens + sheets)
const fail = (m) => { console.error("check-cta: FAIL — " + m); process.exit(1); };
if (!s.includes("_hasTours && Aff.ticketsUrl(detail)")) fail("tickets CTA no longer gated on confirmed products");
if (!s.includes('"/api/viator/go?q="')) fail("tickets CTA not routed through exact-product resolver");
const ungated = /const _tk = Aff\.ticketsUrl\(detail\);/.test(s);
if (ungated) fail("ungated ticketsUrl CTA reappeared");
if (s.includes("viatorSearchUrl(")) fail("raw Viator search link resurfaced in the app shell");
if (!s.includes('Aff.experienceGoUrl(detail.name')) fail("detail tour CTA must route through the exact-product resolver");
console.log("check-cta: OK — Book/Tickets CTAs only when genuinely bookable, via resolver");
