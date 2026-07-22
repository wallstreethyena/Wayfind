// scripts/test-beaches-page.mjs — locks the /beaches/[metro] shareable
// ranking (owner, 2026-07-21): real-metric why-lines, curated share photos
// with recorded reasons, honest conditions (no water-quality until sourced),
// OG card from the curated best picture.
import { readFileSync } from "fs";
import { BEACH_METROS, BEACH_SHARE_PHOTO, rankBeaches, beachWhy } from "../lib/beaches.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };

ok(Object.keys(BEACH_METROS).length === 3, "three metro groups");
for (const k of Object.keys(BEACH_METROS)) {
  const p = BEACH_SHARE_PHOTO[k];
  ok(p && /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(p.photo_ref), k + ": curated share photo is a real Google resource ref");
  ok(p && p.why && p.why.length > 20, k + ": the pick's reason is recorded (a standard to beat)");
}

const ranked = rankBeaches([
  { name: "A", rating: 4.8, reviews: 6457 },
  { name: "B", rating: 5, reviews: 21 },
  { name: "C", rating: 4.7, reviews: 9074 },
]);
ok(ranked[0].name !== "B", "a 5.0 from a handful never outranks proven depth (Bayesian)");
ok(ranked.every((b, i) => b.rank === i + 1), "ranks are 1..n");
const why = beachWhy(ranked[0], "Sarasota");
ok(/\/10/.test(why) && /reviews/.test(why), "why-line speaks the metric");
ok(!/sand|water|crowd|clear|beautiful/i.test(why), "why-line never invents physical claims");

const page = readFileSync(new URL("../app/best-beaches/[metro]/page.js", import.meta.url), "utf8");
ok(page.includes("wf_nearest_beaches"), "page reads the real beach engine");
ok(page.includes("generateStaticParams"), "three pages prerender (shareable, fast)");
ok(page.includes("/api/og/beaches?metro="), "OG share card wired into metadata");
const parts = readFileSync(new URL("../app/best-beaches/[metro]/parts.js", import.meta.url), "utf8");
ok(/rip current\|beach hazard/i.test(parts), "rip-current status reads the NWS alert feed verbatim");
ok(parts.includes('"no advisories"') && !/["']safe["']/i.test(parts), "absence of advisories is never phrased as 'safe'");
ok(/water QUALITY[\s\S]{0,80}no wired source/i.test(parts), "water quality stays absent until a real source is wired");
ok(parts.includes("navigator.share"), "native share with clipboard fallback");
// the inlined formula must never drift from lib/google's wayfindScore
const gsrc = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");
const bsrc = readFileSync(new URL("../lib/beaches.js", import.meta.url), "utf8");
const consts = (src) => { const m = src.match(/const m = (\d+);\s*\n?\s*const C = ([\d.]+);/); return m && m[1] + "/" + m[2]; };
ok(consts(gsrc) === "60/3.9" && consts(bsrc) === "60/3.9", "beaches.js formula constants match lib/google wayfindScore (60/3.9)");
const og = readFileSync(new URL("../app/api/og/beaches/route.js", import.meta.url), "utf8");
ok(og.includes("BEACH_SHARE_PHOTO"), "share card uses the curated best picture");
ok(og.includes("ImageResponse"), "real OG image, not a static fallback");

console.log(`test-beaches-page: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
