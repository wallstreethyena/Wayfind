// scripts/test-red-tide.mjs — locks the FWC red tide pipeline: FWC's OWN
// categories verbatim-mapped, distance + date always carried, silence over
// guess when no sample is near, and the chip contract.
import { readFileSync } from "fs";
import { rtLevel, nearestSample, rtDistMi, RED_TIDE_MAX_MI, FWC_HAB_URL } from "../lib/redTide.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };

// FWC category strings → levels (order matters: "very low" before "low")
ok(rtLevel("not present/background (0-1,000)").level === "none", "background maps to none");
ok(rtLevel("very low (>1,000-10,000)").level === "very_low" && rtLevel("very low (>1,000-10,000)").tone === "good", "very low is its own level, not 'low'");
ok(rtLevel("low (>10,000-100,000)").level === "low" && rtLevel("low (>10,000-100,000)").tone === "warn", "low warns");
ok(rtLevel("medium (>100,000-1,000,000)").tone === "bad" && rtLevel("high (>1,000,000)").tone === "bad", "medium/high are bad");
ok(rtLevel("") === null && rtLevel(null) === null && rtLevel("weird") === null, "unknown category → null, never a guess");

// nearest-sample honesty
const F = (lat, lng, ab, ms) => ({ attributes: { LATITUDE: lat, LONGITUDE: lng, Abundance: ab, SAMPLE_DATE: ms, LOCATION: "x" } });
const at = { lat: 27.2652, lng: -82.5531 }; // Siesta
const near = F(27.27, -82.55, "low (>10,000)", 200); // ~0.4mi
const far = F(27.9, -82.8, "high (>1,000,000)", 300); // ~45mi — outside cap
const s = nearestSample([far, near], at.lat, at.lng);
ok(s && s.level === "low" && s.mi < 1, "picks the nearest in-cap sample, ignores far ones");
ok(nearestSample([far], at.lat, at.lng) === null, "no sample within the cap → null (no chip), NEVER the far reading");
ok(s.sampledAt === "1970-01-01" || /^\d{4}-\d{2}-\d{2}$/.test(s.sampledAt), "sample date carried in ISO");
ok(RED_TIDE_MAX_MI === 10, "the 10-mile cap is the rule");
ok(Math.abs(rtDistMi(27.0, -82.5, 27.0, -82.5)) < 1e-9, "zero distance sanity");
ok(FWC_HAB_URL.includes("HAB_Current_Web_Layer/FeatureServer/0"), "source is FWC's own 8-day layer");

// route + chip contracts
const route = readFileSync(new URL("../app/api/beach/conditions/route.js", import.meta.url), "utf8");
ok(route.includes("getRedTide"), "conditions route lost the red tide ride-along");
ok(route.includes("redTide: redTide || null"), "route must send null (no chip), never fabricate");
const parts = readFileSync(new URL("../app/best-beaches/[metro]/parts.js", import.meta.url), "utf8");
ok(parts.includes('label="Red tide"'), "the red tide chip is gone");
ok(parts.includes("lite.redTide.mi + \" mi\""), "the chip must carry the sample distance — the reading is for the sample point, not the sand");
const lib = readFileSync(new URL("../lib/redTide.js", import.meta.url), "utf8");
ok(!/Math\.random|clear water|no seaweed/i.test(lib), "no invented clarity claims anywhere");

console.log(`test-red-tide: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
