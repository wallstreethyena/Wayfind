#!/usr/bin/env node
/**
 * check-daypart-art-ready — a poster tile cannot stay grey, and /api/rails
 * cannot wait on locResolved.
 *
 * VERIFIED LIVE 2026-08-29 on 1adf9f23, owner iPhone Safari, Parrish Home:
 *
 *   • /api/rails?lat=27.59&lng=-82.43&band=afternoon&v=2 is 200 in 0.44s,
 *     CDN HIT, covered true, tonight n=46. NOT a hang.
 *   • Box Chrome on the same live SHA: posters get is-art-ready, Shell Key
 *     kayak card populated, zero skeletons after 15s.
 *   • Owner iPhone still showed PlaceCardSkeleton cards on Tonight's Move.
 *
 * Two defects, same screenshot:
 *
 *   1. Poster overlay. Tonight JPG is already in the SSR document
 *      (`/cards-v8/tonight-760.jpg`). The broken look is wf8-tile-sk
 *      PlaceCardSkeleton ON TOP of that image until artReady. iOS Safari
 *      often skips img.onLoad for a cached JPEG and/or an AVIF <picture>,
 *      so artReady stayed {} and the overlay never hid.
 *
 *   2. Rails pending. home.js `center` starts null; DaypartRail only got
 *      a point after locResolved (GPS / manual / /api/geo 2.5s). Until then
 *      it setLive(empty) + LOAD_PENDING. The rails origin must start at
 *      first paint from wf_center / DEFAULT_CENTER / __wfEvPrime.
 *
 * Assertions are EXECUTED against the helpers, then pinned at the call
 * sites. A regex that only asks "does markArtReady appear" would pass
 * while the tile had no path that actually calls it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { firstPaintRailOrigin, DEFAULT_CENTER, centerAgreesWithLabel } from "../lib/locationHonesty.js";
import { posterImgIsReady, bindPosterArtReady, posterImgInTile } from "../lib/posterArtReady.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");

let pass = 0;
const fail = (m) => { console.error("check-daypart-art-ready: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

function mockImg({ complete = false, naturalWidth = 0, decode } = {}) {
  const listeners = {};
  return {
    complete,
    naturalWidth,
    addEventListener(ev, fn) { (listeners[ev] ||= []).push(fn); },
    removeEventListener(ev, fn) { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); },
    dispatch(ev) { (listeners[ev] || []).forEach((f) => f()); },
    decode,
    _listeners: listeners,
  };
}

/* ── 1. EXECUTED: firstPaintRailOrigin ─────────────────────────────────── */
const TAMPA = { lat: 27.9506, lng: -82.4572 };
const PARRISH_STORED = { lat: 27.5859, lng: -82.4254, loc: "Parrish, FL" };
const CORRUPT = { lat: 35.2619678, lng: -81.126481, loc: "Parrish, FL" };
ok(centerAgreesWithLabel(CORRUPT, CORRUPT.loc) === false, "PROBE: the Gastonia/Parrish pair is still corrupt — an empty origin test below is not a broken pairing law");

const resolved = firstPaintRailOrigin({ locResolved: true, resolved: TAMPA, prime: DEFAULT_CENTER, stored: PARRISH_STORED });
ok(Math.abs(resolved.lat - TAMPA.lat) < 1e-6 && Math.abs(resolved.lng - TAMPA.lng) < 1e-6,
  "a resolved visitor point wins over prime / stored / seed");

const fromPrime = firstPaintRailOrigin({ locResolved: false, prime: { lat: 27.59, lng: -82.43 } });
ok(Math.abs(fromPrime.lat - 27.59) < 1e-6 && Math.abs(fromPrime.lng + 82.43) < 1e-6,
  "before locResolved, __wfEvPrime starts the rails fetch");

const fromStored = firstPaintRailOrigin({ locResolved: false, stored: PARRISH_STORED });
ok(Math.abs(fromStored.lat - PARRISH_STORED.lat) < 1e-6,
  "a pairing-valid wf_center starts the rails fetch");

const fromCorrupt = firstPaintRailOrigin({ locResolved: false, stored: CORRUPT });
ok(Math.abs(fromCorrupt.lat - DEFAULT_CENTER.lat) < 1e-6 && Math.abs(fromCorrupt.lng - DEFAULT_CENTER.lng) < 1e-6,
  "a corrupt wf_center does NOT become the rails origin — DEFAULT_CENTER, not Gastonia");

const fromSeed = firstPaintRailOrigin({});
ok(Math.abs(fromSeed.lat - DEFAULT_CENTER.lat) < 1e-6 && Math.abs(fromSeed.lng - DEFAULT_CENTER.lng) < 1e-6,
  "no hint → DEFAULT_CENTER (Parrish 27.5689,-82.4393) so first paint still fetches");

/* ── 2. EXECUTED: poster art-ready lanes ───────────────────────────────── */
ok(posterImgIsReady({ complete: true, naturalWidth: 760 }) === true,
  "complete + naturalWidth is ready (Safari cache skip of onLoad)");
ok(posterImgIsReady({ complete: true, naturalWidth: 0 }) === false,
  "complete with no pixels is NOT ready-success — that is the error lane");
ok(posterImgIsReady({ complete: false, naturalWidth: 0 }) === false,
  "an in-flight img is not ready");
ok(posterImgIsReady(null) === false, "a missing img is not ready");

{
  let n = 0;
  const img = mockImg({ complete: true, naturalWidth: 760 });
  bindPosterArtReady(img, () => { n++; });
  ok(n === 1, "already-complete img with pixels marks ready immediately (no onLoad required)");
  ok(!img._listeners.load, "an already-ready img does not leak a load listener");
}

{
  let n = 0;
  const img = mockImg({ complete: true, naturalWidth: 0 });
  bindPosterArtReady(img, () => { n++; });
  ok(n === 1, "complete + 0 width marks ready-failed so a 404 cannot stick a skeleton");
}

{
  let n = 0;
  const img = mockImg({ complete: false, naturalWidth: 0 });
  bindPosterArtReady(img, () => { n++; });
  ok(n === 0, "PROBE: an in-flight img has not marked yet — the load/error tests below are not vacuous");
  img.dispatch("load");
  ok(n === 1, "onLoad marks ready");
  img.dispatch("load");
  ok(n === 1, "onReady is once — a second load does not re-enter");
}

{
  let n = 0;
  const img = mockImg({ complete: false, naturalWidth: 0 });
  bindPosterArtReady(img, () => { n++; });
  img.dispatch("error");
  ok(n === 1, "onError marks ready so a failed poster cannot leave a mute skeleton");
}

{
  let n = 0;
  const img = mockImg({
    complete: false,
    naturalWidth: 0,
    decode: () => Promise.resolve(),
  });
  bindPosterArtReady(img, () => { n++; });
  await Promise.resolve();
  await Promise.resolve();
  ok(n === 1, "decode() resolve marks ready when the engine exposes it");
}

{
  let n = 0;
  const img = mockImg({
    complete: false,
    naturalWidth: 0,
    decode: () => Promise.reject(new Error("decode failed")),
  });
  bindPosterArtReady(img, () => { n++; });
  await Promise.resolve();
  await Promise.resolve();
  ok(n === 1, "decode() reject still marks ready — same as onError");
}

{
  const tile = {
    querySelector(sel) {
      if (sel === "img.wf8-tim") return { complete: true, naturalWidth: 760 };
      return null;
    },
  };
  ok(posterImgInTile(tile) && posterImgIsReady(posterImgInTile(tile)),
    "tile walk finds img.wf8-tim (the JPEG fallback inside <picture>)");
}
{
  const tile = {
    querySelector(sel) {
      if (sel === "img.wf8-tim") return null;
      if (sel === "picture img") return { complete: true, naturalWidth: 380 };
      return null;
    },
  };
  ok(!!posterImgInTile(tile), "tile walk falls through to picture img when the class is missing");
}

/* ── 3. PINNED: DaypartRail actually uses every lane ───────────────────── */
const RAIL_RAW = read("app/components/DaypartRail.js");
const RAIL = strip(RAIL_RAW);
const tileStart = RAIL.indexOf("const tileClass");
ok(tileStart > -1, "PROBE: the tile render block exists — a -1 here makes every overlay assert vacuous");
const tileBlock = tileStart > -1 ? RAIL.slice(tileStart, RAIL.indexOf("wf8-nav l")) : "";
ok(/className="wf8-tim"/.test(tileBlock), "PROBE: the tile still paints img.wf8-tim — the Tonight poster");
ok(/onLoad=\{/.test(tileBlock) && /markArtReady\(id\)/.test(tileBlock),
  "the poster img's onLoad CALLS markArtReady (the handler, not a mention)");
ok(/onError=\{/.test(tileBlock) && /markArtReady\(id\)/.test(tileBlock),
  "the poster img's onError CALLS markArtReady — a 404 cannot stick the overlay");
ok(/bindPosterArtReady\(/.test(RAIL),
  "DaypartRail CALLS bindPosterArtReady — complete / decode / error lanes are not comments");
ok(/posterImgIsReady\(/.test(RAIL) && /requestAnimationFrame\(mark\)/.test(RAIL),
  "the rAF complete scan CALLS posterImgIsReady (picture/source-robust walk)");
ok(/posterImgInTile\(/.test(RAIL),
  "the rAF scan walks tiles via posterImgInTile, not a single img.wf8-tim query that misses <picture>");
ok(/is-art-ready/.test(tileBlock),
  "is-art-ready is still applied for CSS — we dropped the overlay, not the class");
ok(!/wf8-tile-sk/.test(tileBlock),
  "a present img.wf8-tim is not covered by wf8-tile-sk — that overlay is the iPhone stuck-skeleton look");
ok(!/<PlaceCardSkeleton count=\{1\} as="div" \/>/.test(tileBlock),
  "the tile-level PlaceCardSkeleton overlay is gone — drop loading may still use PlaceCardSkeleton");
ok(/<PlaceCardSkeleton count=\{3\} \/>/.test(RAIL),
  "PROBE: the drop still paints three card skeletons while ranking — we did not delete PlaceCardSkeleton");

/* ── 4. PINNED: home.js starts rails at first paint, honesty intact ────── */
const HOME_RAW = read("app/home.js");
const HOME = strip(HOME_RAW);
ok(/const \[center, setCenter\] = useState\(null\)/.test(HOME),
  "center still starts null — DEFAULT_CENTER is not a visitor location (#1020-era honesty)");
ok(/function readInlineRailHints\(/.test(HOME_RAW) || /function readInlineRailHints\(/.test(HOME),
  "readInlineRailHints is DECLARED (the function, not a mention)");
ok(/window\.__wfEvPrime/.test(HOME) && /localStorage\.getItem\("wf_center"\)/.test(HOME),
  "the inline hints actually read __wfEvPrime and wf_center");
ok(/firstPaintRailOrigin\(/.test(HOME),
  "home.js CALLS firstPaintRailOrigin — a helper nobody calls is decoration");
ok(/center=\{railCenter\}/.test(HOME),
  "DaypartRail receives railCenter (first-paint origin), not locResolved ? center : null");
ok(!/<DaypartRail[\s\S]{0,800}center=\{locResolved \? center : null\}/.test(HOME),
  "DaypartRail no longer waits on locResolved before a rails origin");
ok(/<LocalEdit center=\{locResolved \? center : null\}/.test(HOME),
  "LocalEdit still waits for locResolved — the seed is not 'local'");
ok(/sponsor=\{locResolved && center \? sponsorRailNear/.test(HOME),
  "the sponsor tile stays locResolved-gated — a seed must not mint a paid unit");

console.log(`check-daypart-art-ready: OK — ${pass} assertions (executed origin + art-ready lanes; poster overlay gone; rails start at first paint; LocalEdit/sponsor still honest)`);
