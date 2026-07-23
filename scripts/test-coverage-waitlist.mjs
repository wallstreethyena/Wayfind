// scripts/test-coverage-waitlist.mjs — #7: out-of-coverage NEVER shows another
// city's data; it captures interest honestly.
import { readFileSync } from "fs";
let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const h = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(h.includes("function outOfCoverage(center)") && h.includes("WF_COVERAGE_METROS"), "the coverage check exists (>75mi from all FL metros)");
// v6.71: the coverage door is now driven by the server gate (wf_gate_status →
// live/unlock/alert) via CityGate, replacing the client outOfCoverage heuristic
// in this render slot. Same INTENT: an uncovered city shows the door, and the
// normal feed is skipped so it never shows another city's data.
ok(h.includes('(gateStatus === "unlock" || gateStatus === "alert") && (') && h.includes('gateStatus !== "unlock" && gateStatus !== "alert" && (() => {'), "uncovered (gate=unlock/alert) shows ONLY the CityGate door — the normal feed is skipped, never another city's data");
ok(h.includes("function CoverageWaitlist") && h.includes("Wayfind isn"), "the honest coming-soon state renders");
ok(h.includes('supabase.from("wf_waitlist").insert'), "email capture writes to the waitlist");
ok(h.includes("won") && h.includes("another city"), "the copy states we never show another city's picks");
ok(/every\(\(m\) => milesBetween\(center, m\) > 75\)/.test(h), "coverage = >75mi from EVERY metro (not just one)");
console.log(`test-coverage-waitlist: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
