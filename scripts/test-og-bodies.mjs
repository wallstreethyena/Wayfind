#!/usr/bin/env node
/**
 * test-og-bodies — FETCH every OG route and assert it returns a real, distinct image.
 *
 * OWNER (2026-07-31): ship the fix "TOGETHER with the guard that fetches every OG
 * route and asserts (a) body length > 5000 bytes and (b) distinct hash per input.
 * Do not ship the fix and then add the guard — the guard is the proof."
 *
 * WHY A STATIC CHECK CANNOT COVER THIS. Two defects shipped here, and neither is
 * visible in the source:
 *   · <img height={30}> with no width made Satori fetch the asset to infer the
 *     missing dimension. On failure it throws AFTER the 200 headers are already
 *     streaming, so the response cannot be downgraded — the client receives a
 *     200 with a ZERO-LENGTH body, and Cache-Control: immutable pins that blank
 *     image for a year. The JSX is perfectly valid.
 *   · six intents were absent from the card map, so they rendered one shared
 *     fallback. Six byte-identical images. Every one returned HTTP 200 with a
 *     plausible content-type and ~18KB of real PNG.
 *
 * A 200 proves nothing. A content-type proves nothing. Only the BODY does.
 *
 * Needs a running server; skips with a LOUD notice (never a silent pass) when
 * OG_BASE is unset, so it cannot masquerade as coverage in a build that did not
 * run it.
 *
 *   OG_BASE=http://localhost:3124 node scripts/test-og-bodies.mjs
 */
import { createHash } from "node:crypto";
import { INTENT_PAGES } from "../lib/intentPages.js";

const BASE = process.env.OG_BASE || "";
const MIN_BYTES = 5000;

if (!BASE) {
  console.log("test-og-bodies: SKIPPED — OG_BASE is not set, so no OG route was fetched.");
  console.log("  This is NOT a pass. Run it against a built server:");
  console.log("    npx next build && npx next start -p 3124 &");
  console.log("    OG_BASE=http://localhost:3124 node scripts/test-og-bodies.mjs");
  console.log("  check-intent-cards covers the static half at build time.");
  process.exit(0);
}

const keys = Object.keys(INTENT_PAGES).concat(["trending"]);
const fails = [];
const seen = new Map(); // hash -> first key that produced it
const results = [];

for (const k of keys) {
  const url = `${BASE}/api/og/intent?intent=${encodeURIComponent(k)}&city=Orlando`;
  let res, buf;
  try {
    res = await fetch(url);
    buf = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    fails.push(`${k}: request failed outright (${e.message}) — this is the zero-byte class: the stream dies after headers`);
    continue;
  }
  const hash = createHash("sha256").update(buf).digest("hex").slice(0, 16);
  results.push({ k, status: res.status, bytes: buf.length, hash });

  if (res.status !== 200) { fails.push(`${k}: HTTP ${res.status} (expected 200 — every intent page must have a card)`); continue; }
  const ct = res.headers.get("content-type") || "";
  if (!/image\/(png|jpeg)/.test(ct)) fails.push(`${k}: content-type "${ct}" is not an image`);
  // (a) a real body
  if (buf.length < MIN_BYTES) {
    fails.push(`${k}: body is ${buf.length} bytes (< ${MIN_BYTES}). A 200 with a tiny or empty body is the failure mode that gets cached immutable for a year.`);
    continue;
  }
  // PNG magic — a 200 of the right length can still be an error page.
  if (!(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)) {
    fails.push(`${k}: body is not a PNG (magic bytes ${[...buf.slice(0, 4)].map((b) => b.toString(16)).join(" ")})`);
    continue;
  }
  // (b) distinct per input
  if (seen.has(hash)) fails.push(`${k}: byte-identical to "${seen.get(hash)}" (sha ${hash}) — identical cards mean the route is rendering ONE fallback for several inputs, which is exactly how six broken intents hid`);
  else seen.set(hash, k);
}

// An unknown intent must 404, not render art.
try {
  const r = await fetch(`${BASE}/api/og/intent?intent=definitely-not-an-intent`);
  if (r.status !== 404) fails.push(`unknown intent returned HTTP ${r.status}, expected 404 — a fallback card is what hid six broken routes for months`);
} catch (e) { fails.push(`unknown-intent probe failed: ${e.message}`); }

// ── /api/og/hero (v9, owner 2026-09-23; v9.1, audit 2026-09-23) — the SAME
// zero-byte-body class this file exists to catch, now for the node-runtime
// photo route. A guide with a real reviewed photo, its own typographic
// fallback, two DIFFERENT real places, and a real event must each return a
// real, distinct image — never a shared blank.
//
// The two place cases are deliberately different id/name/category/city/
// rating (La Natural, Miami; Bern's Steak House, Tampa — both real Google
// Place ids) — this is the live, end-to-end proof that the photo layout's
// headline is THIS place's own name and its kicker's city is resolved per-id,
// not a hardcoded test city. (An earlier draft of this fixture used a single
// placeholder — `t=A Real Wayfind Place&loc=Sarasota` — for every place case;
// that placeholder was mistaken for a real rendered sample during audit and
// is exactly why this fixture is now two real, named businesses instead.)
const heroCases = [
  { k: "hero:guide-photo", url: `${BASE}/api/og/hero?kind=guide&id=swim-with-manatees-crystal-river&t=${encodeURIComponent("Swim With Manatees in Crystal River")}&cat=Guide&loc=Florida` },
  { k: "hero:guide-fallback", url: `${BASE}/api/og/hero?kind=guide&id=does-not-exist-2026&t=${encodeURIComponent("A Guide With No Reviewed Photo")}&cat=Guide&loc=Florida` },
  { k: "hero:place-la-natural", url: `${BASE}/api/og/hero?kind=place&id=ChIJaeBbjZmx2YgRI0Yb0-WQtPU&t=${encodeURIComponent("La Natural")}&cat=${encodeURIComponent("Wine Bar")}&loc=Miami&r=4.5&rev=310` },
  { k: "hero:place-berns", url: `${BASE}/api/og/hero?kind=place&id=ChIJKQXHdmfDwogRJFCLuT7eJ6I&t=${encodeURIComponent("Bern's Steak House")}&cat=Steakhouse&loc=Tampa&r=4.6&rev=8400` },
  { k: "hero:event", url: `${BASE}/api/og/hero?kind=event&id=mobius-night-market-2026-08&t=${encodeURIComponent("Mobius Night Market")}&cat=Event&loc=Sarasota` },
  { k: "hero:event-fallback", url: `${BASE}/api/og/hero?kind=event&id=does-not-exist-2026&t=${encodeURIComponent("An Event With No Consented Photo")}&cat=Event&loc=Sarasota` },
  { k: "hero:town", url: `${BASE}/api/og/hero?kind=town&id=miami&t=${encodeURIComponent("Miami, Florida")}&cat=Town` },
];
// v9.1 — every hero response is JPEG (the route re-encodes shareCardResponse's
// PNG output specifically to keep the body small); ~300KB is the owner's own
// budget for a card that used to ship as a ~1MB PNG.
const HERO_MAX_OUTPUT_BYTES = 300 * 1024;
const heroResults = [];
const heroSeen = new Map();
for (const { k, url } of heroCases) {
  let res, buf;
  try {
    res = await fetch(url);
    buf = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    fails.push(`${k}: request failed outright (${e.message}) — this is the zero-byte class: the stream dies after headers`);
    continue;
  }
  const hash = createHash("sha256").update(buf).digest("hex").slice(0, 16);
  const ct = res.headers.get("content-type") || "";
  heroResults.push({ k, status: res.status, bytes: buf.length, hash, ct });
  if (res.status !== 200) { fails.push(`${k}: HTTP ${res.status} (expected 200 — the hero route never throws past its own boundary)`); continue; }
  if (ct !== "image/jpeg") fails.push(`${k}: content-type "${ct}" — the hero route must always respond image/jpeg (it re-encodes shareCardResponse's PNG output before returning)`);
  if (buf.length < MIN_BYTES) {
    fails.push(`${k}: body is ${buf.length} bytes (< ${MIN_BYTES}) — a 200 with a tiny or empty body is the failure mode that gets cached immutable`);
    continue;
  }
  if (buf.length > HERO_MAX_OUTPUT_BYTES) {
    fails.push(`${k}: body is ${buf.length} bytes, over the ~${HERO_MAX_OUTPUT_BYTES} byte JPEG budget — a card this heavy is a slow link preview on a cellular connection`);
  }
  if (!(buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF)) {
    fails.push(`${k}: body is not a JPEG (magic bytes ${[...buf.slice(0, 4)].map((b) => b.toString(16)).join(" ")})`);
    continue;
  }
  if (heroSeen.has(hash)) fails.push(`${k}: byte-identical to "${heroSeen.get(hash)}" (sha ${hash}) — a photo card and a fallback card rendering the same bytes means one of them is not actually running`);
  else heroSeen.set(hash, k);
}

console.log(`\n  ${"INTENT".padEnd(18)}${"HTTP".padEnd(7)}${"BYTES".padEnd(9)}HASH`);
for (const r of results) console.log(`  ${r.k.padEnd(18)}${String(r.status).padEnd(7)}${String(r.bytes).padEnd(9)}${r.hash}`);
console.log(`\n  ${"HERO CASE".padEnd(24)}${"HTTP".padEnd(6)}${"TYPE".padEnd(12)}${"BYTES".padEnd(9)}HASH`);
for (const r of heroResults) console.log(`  ${r.k.padEnd(24)}${String(r.status).padEnd(6)}${String(r.ct).padEnd(12)}${String(r.bytes).padEnd(9)}${r.hash}`);

if (fails.length) {
  console.error(`\ntest-og-bodies: FAIL — ${fails.length} issue(s):\n`);
  for (const f of fails) console.error("  · " + f);
  process.exit(1);
}
console.log(`\ntest-og-bodies: OK — ${results.length} intent routes (PNG) + ${heroResults.length} hero routes (JPEG, <= ${HERO_MAX_OUTPUT_BYTES}B) fetched; every body > ${MIN_BYTES} bytes and valid, ${seen.size}/${results.length} distinct intent hashes and ${heroSeen.size}/${heroResults.length} distinct hero hashes; unknown intent 404s`);
