// Guardrail + unit tests: only true lodging wears the Hotels label or gets
// a rates button. Runs the real engine against the exact production case.
import { readFileSync } from "fs";
import { shellSrc } from "./lib/shellSrc.mjs";
import { isTrueLodging } from "../lib/lodging.js";
import { primaryCategory } from "../lib/placeCategory.js";
const fail = (m) => { console.error("check-lodging: FAIL — " + m); process.exit(1); };
const outpost = { name: "Canoe Outpost-Little Manatee River", types: ["lodging", "campground", "park", "point_of_interest"] };
if (isTrueLodging(outpost)) fail("the Canoe Outpost case passed as a hotel");
// v6.15: the classifier lives in lib/placeCategory.js now — execute it. Outdoor
// lodging is Activities, never Hotels; a real hotel stays Hotels.
if (primaryCategory(outpost) !== "Activities") fail("campground still classifies as " + primaryCategory(outpost) + ", must be Activities");
if (primaryCategory({ name: "Happy Trails RV Park", types: ["rv_park", "lodging"] }) !== "Activities") fail("RV park must classify as Activities, not Hotels");
if (primaryCategory({ name: "Hampton Inn Ellenton", types: ["lodging"] }) !== "Hotels") fail("a real hotel must classify as Hotels");
if (!isTrueLodging({ name: "Hampton Inn Ellenton", types: ["lodging"] })) fail("real hotel failed");
if (!isTrueLodging({ name: "Zota Beach Resort", types: ["lodging", "resort_hotel"] })) fail("resort failed");
if (isTrueLodging({ name: "Happy Trails RV Park", types: ["rv_park", "lodging"] })) fail("RV park passed");
if (!isTrueLodging({ name: "The Resort at Longboat Key Club", types: ["lodging"] })) fail("resort-named lodging failed");
const page = shellSrc(); // G0: greps the whole home shell (home.js + kit + screens + sheets)
if (!page.includes('=== "stays") results = results.filter(isTrueLodging)')) fail("stays sheet not filtered");
const aff = readFileSync(new URL("../lib/affiliates.js", import.meta.url), "utf8");
if (!aff.includes("canoe|kayak|paddle|outpost")) fail("rates CTA not guarded against outdoor operations");
console.log("check-lodging: OK — outpost case fails hotels, real lodging passes, CTA guarded");
