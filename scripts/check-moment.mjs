// Guardrail: the Moment Builder contract. First-time users get the chooser,
// every directive chip exists, trust copy is present, and exploration never
// requires sign-in.
import { readFileSync } from "fs";
const s = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
const fail = (m) => { console.error("check-moment: FAIL — " + m); process.exit(1); };
for (const id of ["family", "date", "twohrs", "outside", "locals", "drive", "fifty", "visitors", "rainy", "surprise"]) {
  if (!new RegExp('id: "' + id + '"').test(s.slice(s.indexOf("const MOMENT_CHIPS"), s.indexOf("function composeMoment")))) fail("moment chip missing: " + id);
}
if (!s.includes('has("visitors") ? "entertainment"')) fail("visitors chip must route to attractions");
if (!s.includes('has("visitors") || base === "bestof"')) fail("visitors must keep Best of {city} title");
if (!s.includes("spec.indoorOnly = true")) fail("rainy chip missing indoor spec");
if (!s.includes("if (hd.indoorOnly) results = results.filter")) fail("sheet fetch ignores indoorOnly");
if (!s.includes("Your curated list is ready")) fail("curated-ready copy missing");
if ((s.match(/Rankings are merit-based\. Affiliate links never change placement\./g) || []).length < 2) fail("trust copy must appear in overlay AND sheet");
if (!s.includes("What would interest you today?")) fail("mood kicker copy missing");
if (!s.includes("Just let me look around")) fail("skip path missing — exploration must not be gated");
if (!s.includes('wf_intro_seen')) fail("first-visit persistence missing");
if (!s.includes('"$".repeat(Math.max(1, Math.min(4,')) fail("price missing from sheet pick rows");
if (!s.includes("Let's Wayfind it</button>")) fail("Wayfind-it CTA missing");
if (s.includes("See what's possible right now")) fail("teaser strip must stay removed (popup height)");
if (!s.includes('pendingQRef')) fail("?q= deep link handling missing");
if (!s.includes('best\\s+of\\s+')) fail("best-of city rescue missing");
if (!s.includes("INTRO_PATHS")) fail("line-icon set missing (mock look)");
if (!s.includes('sp0.get("intro") === "1"')) fail("?intro=1 preview switch missing");
if (!s.includes("setIntroOpen(true), 120")) fail("intro must show immediately on entry");
if (!s.includes("WebkitBackgroundClip")) fail("gradient headline missing");
if (!s.includes("F97316 0%, #FF8A3D")) fail("brand gradient CTA missing");
if (!s.includes("function feelingToMoment")) fail("feelings-to-moment translation missing");
if (!s.includes("feelingToMoment(ql)")) fail("search not routing feelings into the moment engine");
for (const sub of ["bored", "relax|unwind", "rain(y|ing)", "on a date"]) { if (!s.includes(sub)) fail("feeling pattern missing: " + sub); }
if (!s.includes("MOMENT_GROUPS")) fail("chip priority groups missing");
if (!s.includes("Who's going".replace("'", String.fromCharCode(39)))) fail("who group missing");
if (!s.includes("Under $50")) fail("budget chip must read as a filter");
if (!s.includes("Up to 1 hour away")) fail("drive chip must be time-based");
if (!s.includes("Good afternoon")) fail("live intelligence greeting missing");
if (s.includes("I have $50")) fail("conversational budget label resurfaced");
console.log("check-moment: OK — 10 chips, bestof/indoor routing, trust copy x2, skip path, price on picks");
