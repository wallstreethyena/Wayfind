// Guardrail + unit tests: only true lodging wears the Hotels label or gets
// a rates button. Runs the real engine against the exact production case.
import { readFileSync } from "fs";
import { isTrueLodging } from "../lib/lodging.js";
const fail = (m) => { console.error("check-lodging: FAIL — " + m); process.exit(1); };
const outpost = { name: "Canoe Outpost-Little Manatee River", types: ["lodging", "campground", "park", "point_of_interest"] };
if (isTrueLodging(outpost)) fail("the Canoe Outpost case passed as a hotel");
if (!isTrueLodging({ name: "Hampton Inn Ellenton", types: ["lodging"] })) fail("real hotel failed");
if (!isTrueLodging({ name: "Zota Beach Resort", types: ["lodging", "resort_hotel"] })) fail("resort failed");
if (isTrueLodging({ name: "Happy Trails RV Park", types: ["rv_park", "lodging"] })) fail("RV park passed");
if (!isTrueLodging({ name: "The Resort at Longboat Key Club", types: ["lodging"] })) fail("resort-named lodging failed");
const page = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
if (!page.includes('=== "stays") results = results.filter(isTrueLodging)')) fail("stays sheet not filtered");
if (!page.includes('any(["campground", "rv_park"])) return "Activities"')) fail("campground still classifies as Hotels");
const aff = readFileSync(new URL("../lib/affiliates.js", import.meta.url), "utf8");
if (!aff.includes("canoe|kayak|paddle|outpost")) fail("rates CTA not guarded against outdoor operations");
console.log("check-lodging: OK — outpost case fails hotels, real lodging passes, CTA guarded");
