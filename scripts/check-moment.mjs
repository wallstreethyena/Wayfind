// Guardrail: the Moment Builder contract. First-time users get the chooser,
// every directive chip exists, trust copy is present, and exploration never
// requires sign-in.
import { readFileSync } from "fs";
const s = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
const fail = (m) => { console.error("check-moment: FAIL — " + m); process.exit(1); };
for (const id of ["family", "date", "twohrs", "outside", "locals", "drive", "fifty", "visitors", "rainy", "surprise"]) {
  if (!new RegExp('id: "' + id + '"').test(s.slice(s.indexOf("const MOMENT_CHIPS"), s.indexOf("function composeMoment")))) fail("moment chip missing: " + id);
}
if (!s.includes('has("visitors") ? "bestof"')) fail("visitors chip not routed to Best of {city}");
if (!s.includes("spec.indoorOnly = true")) fail("rainy chip missing indoor spec");
if (!s.includes("if (hd.indoorOnly) results = results.filter")) fail("sheet fetch ignores indoorOnly");
if (!s.includes("Your adventure is ready")) fail("adventure-ready copy missing");
if ((s.match(/Rankings are merit-based\. Affiliate links never change placement\./g) || []).length < 2) fail("trust copy must appear in overlay AND sheet");
if (!/what kind of day/i.test(s)) fail("moment header copy missing");
if (!s.includes("Just let me look around")) fail("skip path missing — exploration must not be gated");
if (!s.includes('wf_intro_seen')) fail("first-visit persistence missing");
if (!s.includes('"$".repeat(Math.max(1, Math.min(4,')) fail("price missing from sheet pick rows");
if (!s.includes("Build My Adventure")) fail("gradient CTA missing");
if (!s.includes("See what's possible right now")) fail("live teaser strip missing");
if (!s.includes("introTeasers")) fail("teasers must come from real nearby data");
if (!s.includes('pendingQRef')) fail("?q= deep link handling missing");
if (!s.includes('best\\s+of\\s+')) fail("best-of city rescue missing");
if (!s.includes("INTRO_PATHS")) fail("line-icon set missing (mock look)");
if (!s.includes('sp0.get("intro") === "1"')) fail("?intro=1 preview switch missing");
if (!s.includes("setIntroOpen(true), 120")) fail("intro must show immediately on entry");
if (!s.includes("WebkitBackgroundClip")) fail("gradient headline missing");
if (!s.includes("6D5DF6")) fail("mock gradient CTA missing");
console.log("check-moment: OK — 10 chips, bestof/indoor routing, trust copy x2, skip path, price on picks");
