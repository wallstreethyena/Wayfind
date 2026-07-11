// Guardrail + unit tests: honest small-market handling.
import { readFileSync } from "fs";
import { shellSrc } from "./lib/shellSrc.mjs";
import { bucketize, strongWithin } from "../lib/radius.js";
const fail = (m) => { console.error("check-radius: FAIL — " + m); process.exit(1); };
const P = (d, r = 4.5, rv = 200) => ({ id: String(d) + Math.random(), distMi: d, rating: r, reviews: rv });

// Bucket maths: 4 buckets, ranked order preserved inside each.
const bk = bucketize([P(2), P(55), P(12), P(8), P(25), P(17)], "Parrish");
if (bk.sections.map((s) => s.label).join("|") !== "In Parrish|A short drive away|Nearby cities|Worth the drive") fail("bucket labels wrong: " + bk.sections.map((s) => s.label).join("|"));
if (bk.sections.map((s) => s.count).join(",") !== "2,2,1,1") fail("bucket counts wrong");
if (bk.places[0].distMi !== 2 || bk.places[1].distMi !== 8) fail("in-bucket ranking not preserved");

// Unknown distances sink into the last non-empty bucket, never vanish.
const bk2 = bucketize([P(3), { id: "u", distMi: null }], "Parrish");
if (bk2.places.length !== 2) fail("unknown-distance place was dropped");

// Quality floor: weak or far results do not count as strong-local.
if (strongWithin([P(5), P(5, 4.0), P(5, 4.8, 20), P(15)], 10) !== 1) fail("quality floor wrong");

// Wiring: composites must use the honest path.
const page = shellSrc(); // G0: greps the whole home shell (home.js + kit + screens + sheets)
if (!page.includes("Radius.strongWithin(out, 10) < 10")) fail("thin-market detection missing from composites");
if (!page.includes("Radius.bucketize(out, town)")) fail("radius sections missing from composites");
if (!page.includes("smaller market")) fail("honest small-market copy missing");
console.log("check-radius: OK — buckets, ranking preserved, quality floor, thin-market honesty wired");
