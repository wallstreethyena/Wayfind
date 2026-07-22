// scripts/test-booking-audit.mjs — locks the Viator watchdog (the Coquina fix).
import { readFileSync } from "fs";
import { isTicketyPlace } from "../lib/affiliates.js";
let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
// the invariant the cron guards, proven here too:
ok(isTicketyPlace({ types: ["beach", "natural_feature", "tourist_attraction"], category: "beach", name: "Coquina Beach" }) === false, "a beach is never bookable — no Viator CTA (Coquina->Mumbai fixed)");
ok(isTicketyPlace({ types: ["natural_feature", "park"], name: "Emerson Point" }) === false, "a natural feature is never bookable");
ok(isTicketyPlace({ types: ["museum", "tourist_attraction"], category: "attractions", name: "The Ringling" }) === true, "a museum stays bookable");
const cron = readFileSync(new URL("../app/api/cron/booking-audit/route.js", import.meta.url), "utf8");
ok(cron.includes("CRON_SECRET"), "watchdog is secret-gated");
ok(cron.includes("isTicketyPlace") && cron.includes("nonbookable_cta_leak"), "the watchdog flags non-bookable CTA leaks");
ok(cron.includes("wf_booking_audit"), "anomalies are recorded for review");
const v = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
ok(v.crons.some((c) => c.path === "/api/cron/booking-audit"), "the watchdog cron is scheduled");
console.log(`test-booking-audit: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
