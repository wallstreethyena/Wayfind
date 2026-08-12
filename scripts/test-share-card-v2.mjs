#!/usr/bin/env node
/**
 * test-share-card-v2 — the merged share-card standard, asserted by CALLING.
 *
 * docs/share-card-standard.md is the standard; this is its enforcement. Every
 * number the spec fixes is imported from lib/shareCardV2.js and compared, so a
 * silent drift in geometry or colour fails the build rather than shipping a
 * card nobody looks at closely until it is in someone's iMessage.
 *
 * WHY THE PURE MODULE EXISTS. The layout lives in lib/shareCardV2.js and the
 * route only reads from it, which is what lets this guard assert the system
 * without spinning up an edge runtime. The behavioural half — that the route
 * actually renders a non-trivial, distinct PNG — is test-og-bodies.mjs.
 *
 * TWO THINGS THIS FILE ENCODES THAT COST A RENDER CYCLE TO FIND:
 *   1. Satori silently ignores the `inset` shorthand. The scrim div and the
 *      glass panel's 80% blend both had `inset: 0`, both had zero size, and
 *      neither painted — the card came back with a washed-out headline and a
 *      bright corner where the panel should be. Explicit top/left/width/height
 *      is mandatory, and asserted below.
 *   2. An <img> needs BOTH width and height or Satori fetches it to measure,
 *      and a failed fetch throws AFTER the 200 headers are streaming — a
 *      zero-byte 200 the CDN then caches. Same defect class as the intent card.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { existsSync } from "node:fs";
import * as V2 from "../lib/shareCardV2.js";

let n = 0;
const fails = [];
const ok = (c, m) => { n++; if (!c) fails.push(m); };

// ── the merged standard's fixed values ──────────────────────────────────────
ok(V2.CARD.w === 1200 && V2.CARD.h === 630, "card is 1200x630");
ok(V2.COLOR.cta === "#E8C97A", "the gold CTA colour is the doc's #E8C97A — owner conceded rule 3, the CTA is reinstated");
ok(V2.COLOR.scrim === "#05070E" && V2.COLOR.panel === "#070A12", "v2 supersedes the doc's #040810 for scrim/panel");
ok(V2.COLOR.accent === "#FF7A32", "deal accent");
ok(V2.COLOR.score === "#5EE8B4" && V2.COLOR.rank === "#929DB6" && V2.COLOR.meta === "#9AA4BC", "pick-card palette");
ok(V2.GEO.logo.x === 56 && V2.GEO.logo.y === 40 && V2.GEO.logo.h === 34, "logo composited top-left at (56,40), 34px tall");
ok(V2.GEO.headline.y === 232 && V2.GEO.headline.size === 62 && V2.GEO.headline.step === 2 && V2.GEO.headline.maxWidth === 1088,
  "headline 62px at y=232, shrinks by 2 until it fits 1088");
ok(V2.GEO.subline.y === 318 && V2.GEO.subline.size === 24, "subline 24px at y=318");
ok(V2.GEO.panel.top === 384 && V2.GEO.panel.blur === 22 && V2.GEO.panel.blend === 0.8 && V2.GEO.panel.hairline === 0.18,
  "glass panel y=384, blur 22, 80% blend, 1px white @18% hairline");
ok(V2.GEO.picks.w === 352 && V2.GEO.picks.h === 150 && V2.GEO.picks.gap === 20 && V2.GEO.picks.radius === 22,
  "pick cards 352x150, gap 20, radius 22");
ok(Math.abs(V2.GEO.picks.fill - 0.066) < 1e-9 && Math.abs(V2.GEO.picks.border - 0.15) < 1e-9, "pick card white @6.6% fill / @15% border");
ok(V2.GEO.footer.y === 588, "footer at y=588");
// three 352 cards + two 20 gaps = 1096, centred in 1200
ok(V2.PICK_X[0] === 52 && V2.PICK_X[1] === 424 && V2.PICK_X[2] === 796, "pick columns are centred: 52 / 424 / 796");
ok(V2.PICK_X[2] + V2.GEO.picks.w + 52 === 1200, "the pick row is symmetric within the canvas");

// ── the scrim ───────────────────────────────────────────────────────────────
const g = V2.scrimGradient();
for (const [pct, a] of V2.SCRIM_STOPS) ok(g.includes(`${a}) ${pct}%`), `scrim carries the ${pct}% -> ${a} stop`);
ok(/^linear-gradient\(180deg,/.test(g), "the scrim is a vertical gradient");
ok(g.includes("rgba(5,7,14"), "the scrim is over #05070E");

// ── VERTICAL FOCUS is required, never defaulted ─────────────────────────────
ok(V2.focusFor("/cards/definitely-not-registered.jpg") === null,
  "an UNREGISTERED image must return null — a hardcoded 0.5 is what decapitated every subject in v1");
ok(V2.focusFor(null) === null && V2.focusFor("") === null, "absent art returns null");
const reg = Object.keys(V2.VERTICAL_FOCUS);
// SUPERSEDED 2026-08-12 (owner: "I want every image we have used for text share
// deleted"). VERTICAL_FOCUS is now deliberately EMPTY — the share card renders
// photo-free until the replacement design picks its art. Requiring a registered
// image would fail the build for obeying that.
//
// The claim this line protected is unchanged and still holds below: there is NO
// default crop, and anything registered must be real. What replaces the
// non-empty requirement is the stronger invariant that an empty registry is
// SAFE — focusFor returns null, which is the photo-less path.
ok(V2.focusFor("/brand/orlando-roller-coaster-portrait.jpg") === null,
  "with the registry emptied, even a previously-registered image must now return null — otherwise a stale focus could resurrect a photo on the share card");
for (const k of reg) {
  ok(existsSync(path.resolve("public" + k)), `registered art ${k} must EXIST on disk — a registry of invented paths is the fabrication it exists to prevent`);
  const f = V2.VERTICAL_FOCUS[k];
  ok(typeof f === "number" && f >= 0 && f <= 1, `${k} focus must be a 0..1 number, got ${f}`);
}
ok(V2.objectPosition(0.16) === "50% 16%", "horizontal focus is always centred; vertical is the registered value");
ok(V2.objectPosition(null) === null, "no focus, no object-position");

// ── headline fitting ────────────────────────────────────────────────────────
const short = V2.fitHeadline("Tonight, decided");
ok(short.size === 62 && !short.truncated, "a short headline renders at full 62px");
const longer = V2.fitHeadline("The places locals quietly hope you never find");
ok(longer.size < 62 && longer.size >= V2.GEO.headline.minSize && !longer.truncated, "a longer headline shrinks rather than wrapping");
ok((62 - longer.size) % 2 === 0, "it shrinks in 2px steps");
const huge = V2.fitHeadline("x".repeat(400));
ok(huge.size === V2.GEO.headline.minSize && huge.truncated && huge.text.endsWith("…"),
  "past the floor it ellipsises instead of shrinking into noise");
ok(V2.estimateTextWidth(huge.text, huge.size) <= V2.GEO.headline.maxWidth, "the ellipsised headline actually fits 1088px");
ok(V2.fitPickName("A".repeat(80)).endsWith("…"), "a long pick name ellipsises at cardWidth-44");
ok(V2.estimateTextWidth(V2.fitPickName("A".repeat(80)), 27) <= V2.GEO.picks.w - 44, "the ellipsised pick name fits");

// ── hard rules ──────────────────────────────────────────────────────────────
ok(V2.picksToRender([{ name: "a" }, { name: "b" }]).length === 0,
  "fewer than three picks renders NONE — two cards and a hole reads as broken software");
ok(V2.picksToRender([{ name: "a" }, { name: "b" }, { name: "c" }]).length === 3, "exactly three renders three");
ok(V2.picksToRender([{ name: "a" }, { name: "b" }, { name: "c" }, { name: "d" }]).length === 3, "never more than three");
ok(V2.picksToRender(null).length === 0 && V2.picksToRender([{}, {}, {}]).length === 0, "nameless picks do not count");
ok(V2.dealLabel(0) === null && V2.dealLabel(null) === null && V2.dealLabel(-2) === null,
  'never render "0 local deals" — omit the right footer entirely at zero');
ok(V2.dealLabel(1) === "1 local deal" && V2.dealLabel(4) === "4 local deals", "the deal count is pluralised");

// ── context pill ────────────────────────────────────────────────────────────
const pill = V2.contextPill({ timeBucket: "afternoon", outdoorOK: false, weather: { known: true, tempF: 100 } }, "Orlando");
ok(pill === "TODAY · ORLANDO · 100° · INDOORS", `the pill is the owner's exact shape, got ${JSON.stringify(pill)}`);
ok(V2.contextPill({ timeBucket: "night", weather: {} }, "Sarasota") === "TONIGHT · SARASOTA", "night reads TONIGHT; unknown weather is omitted, not invented");
ok(V2.contextPill(null, "Tampa") === null && V2.contextPill({ timeBucket: "night", weather: {} }, "") === null,
  "no context, no pill — an empty pill is worse than none");

// ── cache ───────────────────────────────────────────────────────────────────
ok(/s-maxage=600/.test(V2.cacheControl(600)), "s-maxage follows the list's own revalidate");
ok(/s-maxage=86400/.test(V2.cacheControl(999999)), "s-maxage is clamped — a card must never outlive the list it promises");
ok(!/immutable/.test(V2.cacheControl(600)), "a data-driven card is NOT immutable; that is how a blank card got pinned for a year");

// ── the route reads from the module, and only from it ───────────────────────
const route = readFileSync(path.resolve("app/api/og/route.js"), "utf8");
const v2block = route.slice(route.indexOf('searchParams.get("v") === "2"'), route.indexOf("// v6.25"));
ok(v2block.length > 500, "the v2 block was located in the route");
ok(!/\binset:\s*0\b/.test(v2block),
  "the v2 block must not use the `inset` shorthand — Satori silently ignores it, so the scrim and the panel blend both painted nothing");
ok(/wayfind-official-white\.png/.test(v2block), "the logo is COMPOSITED from the real asset, never redrawn");
ok(!/<svg/.test(v2block), "no hand-drawn mark in the v2 card — the real mark has an OUTLINED pin with a ring, and drawing it from memory got it wrong");
ok(/width=\{G\.logo\.w\}\s+height=\{G\.logo\.h\}/.test(v2block),
  "the logo <img> carries BOTH dimensions — without them Satori fetches to measure and a failure throws after headers, yielding a zero-byte 200");
ok(/V2\.scrimGradient\(\)/.test(v2block) && /V2\.focusFor\(/.test(v2block) && /V2\.picksToRender\(/.test(v2block) && /V2\.dealLabel\(/.test(v2block),
  "the route reads geometry and rules from lib/shareCardV2.js rather than restating them");
ok(/filter:\s*`blur\(\$\{G\.panel\.blur\}px\)`/.test(v2block), "the panel is blur-BEHIND, not a flat rectangle");
// CACHE-CONTROL MUST BE REBUILT ON THE RESPONSE. Passing `headers` into
// ImageResponse APPENDS after next/og's own `immutable, max-age=31536000`, and
// immutable wins — verified on a production build, the header came back with
// both. A data-driven card pinned for a year is the exact failure that blanked
// the intent cards. Assert the wrapper, not just the helper.
ok(/new Headers\(img\.headers\)/.test(v2block) && /h\.set\("Cache-Control", cc\)/.test(v2block),
  "the v2 response rebuilds Cache-Control from the ImageResponse headers — passing it as an ImageResponse option leaves next/og's immutable in front of it");
ok(!/new ImageResponse\([\s\S]*?headers:\s*\{\s*"Cache-Control"/.test(v2block),
  "Cache-Control must NOT be passed as an ImageResponse option — it is appended, not applied");

// the CTA and the deal count both wanted bottom-right; the CTA won the edge
ok(/C\.cta/.test(v2block) && /right:\s*56/.test(v2block), "the gold CTA holds the bottom-right edge");

if (fails.length) {
  console.error(`test-share-card-v2: FAIL — ${fails.length}/${n}`);
  for (const f of fails) console.error("  · " + f);
  process.exit(1);
}
console.log(`test-share-card-v2: OK — ${n} assertions against the merged standard (docs/share-card-standard.md): geometry, palette, scrim stops, required vertical focus with on-disk proof, headline fitting, the three hard rules, and the route reading only from lib/shareCardV2.js`);
