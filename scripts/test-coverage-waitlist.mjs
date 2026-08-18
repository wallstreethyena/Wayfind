// scripts/test-coverage-waitlist.mjs — #7: out-of-coverage NEVER shows another
// city's data; it captures interest honestly.
import { readFileSync } from "fs";
let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const h = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(h.includes("function outOfCoverage(center)") && h.includes("WF_COVERAGE_METROS"), "the coverage check exists (>75mi from all FL metros)");
// v6.72: the coverage door is driven by the server gate (wf_gate_status →
// live/unlock/alert) via CityGate. SIGNED-IN users (unlock) get the live feed —
// only SIGNED-OUT + uncovered ('alert') is walled behind the waitlist so it
// never shows another market's data to a logged-out visitor.
// RE-POINTED v8.11 (owner, 2026-08-18: "get rid of this"): the door is
// unmounted from "/" and the 'alert' wall is gone — the feed renders for
// everyone. The waitlist capture below (wf_waitlist, the component, the
// unlock endpoint) stays intact for a future deliberate placement; what this
// line now pins is that neither the door nor the wall quietly returns.
ok(!h.includes("<CityGate ") && !h.includes('gateStatus !== "alert" && (() => {'), "the coverage door/wall is back on the homepage (owner removed both 2026-08-18)");
ok(h.includes("function CoverageWaitlist") && h.includes("Wayfind isn"), "the honest coming-soon state renders");
ok(h.includes('supabase.from("wf_waitlist").insert'), "email capture writes to the waitlist");
ok(h.includes("won") && h.includes("another city"), "the copy states we never show another city's picks");
ok(/every\(\(m\) => milesBetween\(center, m\) > 75\)/.test(h), "coverage = >75mi from EVERY metro (not just one)");
console.log(`test-coverage-waitlist: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
