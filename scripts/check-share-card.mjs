#!/usr/bin/env node
/**
 * check-share-card — the one share card, asserted BY CALLING it.
 *
 * The card the owner chose is typographic: one sentence set as large as it will
 * go. That makes the fitting logic the entire product. If a headline overflows
 * the plate, or the type collapses to 48px because the copy is too long, or the
 * foot line runs under the CTA, the card is broken in a way nobody sees until it
 * is already in someone's text message.
 *
 * So this guard does not read app/api/og/card.jsx for the string "fontSize". It
 * imports lib/shareCard.js and lib/shareCardCopy.js and RUNS them: every model
 * builder against fixtures, every fitted line measured against the real Archivo
 * advance widths, every ladder checked for what it is allowed to claim.
 *
 * WHAT THIS FILE ENCODES THAT COST A PRODUCTION RENDER TO FIND:
 *
 *   1. THE PHOTOGRAPH WAS BASE64. The owner asked for every share image to be
 *      deleted; the files under public/ were deleted and the card still showed
 *      the same sunset-palm street scene, because it was a data: URI pasted into
 *      lib/ogbg.js. A guard that bans image PATHS would have passed. Section 6
 *      bans data: URIs and <img> outright.
 *
 *   2. SIZING BY CHARACTER COUNT IS NOT SIZING. The old card stepped the type
 *      down in buckets by string length. In Archivo 900 "W" is 1.000em and "i"
 *      is 0.319em, so "WWWWWWWW" is over three times the width of "iiiiiiii" at
 *      the same count. Section 2 proves the fitter uses widths.
 *
 *   3. AFTER THE ART DELETION TWO ROUTES BUILT THE URL "…gowayfind.comnull"
 *      (`SITE_URL + null`). Satori fetches that, fails, and throws AFTER the 200
 *      headers are streaming — a zero-byte 200 the CDN caches. Section 6 also
 *      fails on a concatenation that can produce the string "null".
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CARD, textWidth, charWidth, wrapToWidth, layoutHeadline, accentLines, ellipsize, buildCard,
} from "../lib/shareCard.js";
import {
  placeModel, listModel, weatherModel, couponModel, intentModel,
  beachesModel, snapshotModel, experienceModel, defaultModel, footFits, humanDate,
} from "../lib/shareCardCopy.js";
import { SHARE_CARDS, shareCardFor } from "../lib/shareCards.js";
import { RAILS, railById } from "../lib/rails.js";
import { fitCta } from "../lib/shareCard.js";
import { railModel } from "../lib/shareCardCopy.js";
import { INTENT_PAGES } from "../lib/intentPages.js";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let n = 0;
const fails = [];
const ok = (c, m) => { n++; if (!c) fails.push(m); };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── 1. THE METRICS ARE REAL ─────────────────────────────────────────────────
// Not "a table exists" — the specific inequality that a count-based sizer gets
// wrong. If these ever come out equal the table has been flattened to a guess.
ok(charWidth("W", 900) > charWidth("i", 900) * 2.5,
   `Archivo 900 "W" (${charWidth("W", 900)}) must be far wider than "i" (${charWidth("i", 900)})`);
ok(charWidth("W", 900) !== charWidth("W", 600), "600 and 900 must not share one width table");
ok(charWidth("★", 900) > 0, "an unmapped glyph must still return a width rather than NaN");
ok(textWidth("WWWWWWWW", 100, 900) > textWidth("iiiiiiii", 100, 900) * 2.5,
   "equal-length strings of different letters must not measure the same");
ok(textWidth("", 100, 900) === 0, "the empty string is zero wide");

// ── 2. THE FITTER ACTUALLY FITS ─────────────────────────────────────────────
// Every headline the site can produce, measured. A line wider than the plate is
// a line hanging off the card.
const HEADLINES = [
  "The 12 best dinners near you tonight",
  "Ulele is a 9.1, and it's 2.3 miles from you",
  "Get $40 of food for $20 at Ulele",
  "It's 94° in Sarasota — here's what's good right now",
  "One beach beat them all",
  "Where to eat",
  "Supercalifragilisticexpialidocious",
  "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
  "Things to do in Punta Gorda, Florida this weekend with the whole family and the dog",
  "A".repeat(400),
];
for (const h of HEADLINES) {
  const L = layoutHeadline(h);
  ok(L.lines.length <= CARD.maxLines, `"${h.slice(0, 32)}…" fitted to ${L.lines.length} lines, max is ${CARD.maxLines}`);
  ok(L.lines.length >= 1, `"${h.slice(0, 32)}…" produced no lines`);
  for (const line of L.lines) {
    const w = textWidth(line, L.size, 900);
    ok(w <= CARD.maxWidth + 0.5, `line "${line}" is ${Math.round(w)}px at ${L.size}px — the plate is ${CARD.maxWidth}px`);
  }
  ok(CARD.sizes.indexOf(L.size) >= 0, `size ${L.size} is not on the ladder`);
}
// Short copy must be set LARGE. A one-word headline rendering at 48px would mean
// the ladder is walking down for no reason.
ok(layoutHeadline("Where to eat").size === CARD.sizes[0],
   `a short headline must take the top size ${CARD.sizes[0]}, got ${layoutHeadline("Where to eat").size}`);
// Long copy must step DOWN rather than overflow.
ok(layoutHeadline(HEADLINES[8]).size < CARD.sizes[0], "a long headline must step down the ladder");
// The impossible case is reported, not hidden.
ok(layoutHeadline("A".repeat(400)).fitted === false, "copy that cannot fit must report fitted:false");
ok(layoutHeadline("Where to eat").fitted === true, "copy that fits must report fitted:true");
ok(layoutHeadline("").lines.length === 0, "empty copy yields no lines rather than a blank row");

// ── 3. WRAPPING AND TRUNCATION ──────────────────────────────────────────────
ok(wrapToWidth("one two three", 1000, 900, 10).length === 3, "a hopeless width still breaks per word rather than looping");
ok(wrapToWidth("  spaced   out  ", 100, 900, 4000).join("|") === "spaced out", "whitespace is normalised, not preserved");
const ell = ellipsize("a very long sentence that will not fit at all", 100, 900, 600);
ok(ell.endsWith("…"), "an over-long string is ellipsised");
ok(textWidth(ell, 100, 900) <= 600.5, `the ellipsised string is ${Math.round(textWidth(ell, 100, 900))}px, over the 600px cap`);
ok(ellipsize("short", 100, 900, 4000) === "short", "a string that fits is returned untouched");

// ── 4. ACCENTS COLOUR LINES, NOT SPANS ──────────────────────────────────────
// Satori reflows words around a coloured inline span, which is how the first
// draft produced "The 12 dinners / best near you". Accents are per line.
ok(accentLines(["The 12 best", "dinners near you"], "12").join() === "0", "the accent lands on the line holding the phrase");
ok(accentLines(["The 12 best", "dinners near you"], "nothing").length === 0, "an absent accent colours nothing");
ok(accentLines(["Get $40 of food", "for $20 at Ulele"], "$20").join() === "1", "a later line can hold the accent");
ok(accentLines(["one", "two"], "one two").length === 0, "an accent covering every line colours none — that is not an accent");
ok(accentLines([], "x").length === 0, "no lines, no accents");
// AN ACCENT IS A CONTRAST WITHIN A HEADLINE, so a set covering every line is not
// an accent — it is a recolour. The rule existed for the word-fallback branch
// and was missing from the whole-phrase one, so the single-line headline "It's a
// date" came back fully accented and rendered entirely white on the blush tone.
// Caught by looking at the rendered card, not by a test.
ok(accentLines(["It's a date"], "date").length === 0,
   "a one-line headline cannot be entirely accent — that is a recolour, not an accent");
ok(accentLines(["Get $40 of food", "for $20"], "for $20").join() === "1",
   "a phrase on one of several lines still accents that line");
for (const h of HEADLINES) {
  const L = layoutHeadline(h);
  const a = accentLines(L.lines, "9.1");
  ok(a.every((i) => i >= 0 && i < L.lines.length), "an accent index must address a real line");
  ok(a.length < L.lines.length || L.lines.length === 0, "the accent must never take every line");
}

// ── 5. EVERY LADDER, AND WHAT IT MAY CLAIM ──────────────────────────────────
const models = {
  "place: score + distance": placeModel({ name: "Ulele", city: "Tampa", mi: "2.3", sc: "9.1", r: "4.6", rev: "8200", cat: "Riverfront American" }),
  "place: score only": placeModel({ name: "Ulele", sc: "9.1" }),
  "place: hook only": placeModel({ name: "Ulele", hook: "The best riverfront table in Tampa" }),
  "place: rating only": placeModel({ name: "Ulele", r: "4.6", rev: "8200" }),
  "place: name only": placeModel({ name: "Ulele" }),
  "place: nothing": placeModel({}),
  "list": listModel({ title: "The 12 best dinners near you tonight", loc: "Tampa", n: "12" }),
  "list: bare": listModel({}),
  "weather": weatherModel({ temp: "94", cond: "Overcast", loc: "Sarasota", take: "Too hot for the beach" }),
  "weather: bare": weatherModel({}),
  "coupon: priced": couponModel({ pay: 20, get: 40, pct: 50, biz: "Ulele", what: "food", exp: "Aug 31" }),
  "coupon: described": couponModel({ biz: "Ulele", deal: "Two for one on every appetiser", code: "WAYFIND" }),
  "coupon: nothing": couponModel({}),
  "intent": intentModel({ eyebrow: "Date night", line1: "Where tonight actually happens", promise: "Candlelight and water views." }, { city: "Tampa" }),
  "beaches": beachesModel({ label: "Tampa Bay", n: 24, reviews: 41000 }),
  "beaches: bare": beachesModel({}),
  "snapshot": snapshotModel({ strip: ["Sarasota", "7:14 PM Sat"], hook: { lines: ["Sarasota’s #1 hot dog", "is at a gas station."], accent: "gas station" }, note: "Updates hourly.", bar_label: "See which one" }),
  "snapshot: bare": snapshotModel({}),
  "rail": railModel(railById("birthday")),
  "rail: bare": railModel({}),
  "default": defaultModel(),
};
for (const [label, m] of Object.entries(models)) {
  ok(Array.isArray(m.lines) && m.lines.length >= 1, `${label}: produced no headline`);
  ok(typeof m.cta === "string" && m.cta.length >= 3, `${label}: produced no CTA`);
  ok(m.cta === m.cta.toUpperCase(), `${label}: the CTA "${m.cta}" is not upper case`);
  ok(m.top >= CARD.bandTop, `${label}: the headline block starts at ${m.top}, above the band`);
  const blockH = m.lines.length * m.size * CARD.lead;
  ok(m.top + blockH <= CARD.ruleY - 6, `${label}: the headline runs into the rule (${Math.round(m.top + blockH)} vs ${CARD.ruleY})`);
  ok(footFits(m.foot), `${label}: the foot "${m.foot}" is wide enough to run under the CTA`);
  ok(!/\bundefined\b|\bnull\b|\bNaN\b/.test([m.eyebrow, m.foot, m.cta, ...m.lines].join(" ")),
     `${label}: a missing value leaked into the copy: ${JSON.stringify(m)}`);
  ok(m.fitted, `${label}: the copy could not be fitted`);
  for (const line of m.lines) ok(textWidth(line, m.size, 900) <= CARD.maxWidth + 0.5, `${label}: "${line}" overflows the plate`);
}
// TRUTH. A ladder may only claim what it was handed.
ok(!/\b9\.1\b/.test(models["place: name only"].lines.join(" ")), "a place with no score must not print one");
ok(!/miles/.test(models["place: score only"].lines.join(" ")), "a place with no distance must not print one");
ok(/9\.1/.test(models["place: score + distance"].lines.join(" ")), "a place WITH a score must lead with it");
ok(/2\.3/.test(models["place: score + distance"].lines.join(" ")), "a place WITH a distance must say it");
ok(/\$20/.test(models["coupon: priced"].lines.join(" ")) && /\$40/.test(models["coupon: priced"].lines.join(" ")),
   "a priced coupon must print both numbers — that pair is the whole reason it gets shared");
ok(/50% OFF/.test(models["coupon: priced"].eyebrow.toUpperCase()), "a priced coupon states the percentage it was given");
ok(!/\$/.test(models["coupon: described"].lines.join(" ")), "a coupon with no price must not invent one");
ok(/94°/.test(models["weather"].lines.join(" ")), "a weather card with a temperature must show it");
// NO STAR GLYPH ANYWHERE. Archivo's Latin subset has no U+2605, and the old
// place card rendered a tofu box next to every rating in production.
for (const [label, m] of Object.entries(models)) {
  ok(!/[★☆⭐]/.test([m.eyebrow, m.foot, m.cta, ...m.lines].join(" ")),
     `${label}: a star glyph would render as a tofu box — the font has no U+2605`);
}

// A FOOT THAT ENDS IN AN ELLIPSIS DID NOT FIT. footFits() only proves it stays
// clear of the CTA; it says nothing about whether it got there by being cut off
// mid-word. The beach card shipped "…no ads, no v…" past a green build.
for (const [label, m] of Object.entries(models)) {
  ok(!/…$/.test(m.foot), `${label}: the foot was truncated to fit ("${m.foot}") — shorten the copy instead`);
  ok(!/…$/.test(m.eyebrow), `${label}: the eyebrow was truncated to fit ("${m.eyebrow}")`);
}
// AN ISO DATE IS NOT A SENTENCE. "good through 2026-08-31" is a database field
// wearing a coupon, and it reached a real render before this assertion existed.
ok(/good through Aug 31/.test(models["coupon: priced"].foot),
   `a coupon expiry must be written for a human, got "${models["coupon: priced"].foot}"`);
ok(!/\d{4}-\d{2}-\d{2}/.test(Object.values(models).map((m) => m.foot + m.eyebrow + m.lines.join(" ")).join(" ")),
   "a raw ISO date reached a share card");
ok(humanDate("not-a-date") === "not-a-date" && humanDate() === "",
   "humanDate must pass through what it cannot parse rather than blanking it");

// ── 5b. EVERY REAL EXPERIENCE CARD AND INTENT PAGE, NOT A SAMPLE ────────────
for (const key of Object.keys(SHARE_CARDS)) {
  const m = experienceModel(shareCardFor(key), { loc: "Tampa" });
  ok(m.fitted, `share card "${key}": its shareLine cannot be fitted on the plate`);
  ok(m.lines.length >= 1 && m.cta.length >= 3, `share card "${key}": produced an empty card`);
  ok(footFits(m.foot), `share card "${key}": the foot runs under the CTA`);
}
let intents = 0;
for (const [key, page] of Object.entries(INTENT_PAGES)) {
  if (!page || !page.card) continue;
  intents++;
  const m = intentModel(page.card, { city: "Punta Gorda" });
  ok(m.fitted, `intent "${key}": its line1 cannot be fitted with a long city name`);
  ok(footFits(m.foot), `intent "${key}": the promise runs under the CTA`);
}
ok(intents >= 6, `expected the intent pages to carry cards, found ${intents}`);

// ── 6. NO PHOTOGRAPH REACHES A SHARE CARD, BY ANY ROUTE ─────────────────────
// PATHS, DATA URIs AND ELEMENTS. The base64 blob in lib/ogbg.js is exactly why
// the first two are not enough on their own.
const OG_FILES = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const f = path.join(d, e);
    if (statSync(f).isDirectory()) walk(f);
    else if (/\.(js|jsx)$/.test(e)) OG_FILES.push(f);
  }
})(path.join(REPO, "app/api/og"));
ok(OG_FILES.length >= 6, `expected the OG routes to be found, got ${OG_FILES.length}`);
for (const f of OG_FILES) {
  const rel = path.relative(REPO, f);
  const src = strip(readFileSync(f, "utf8"));
  // v8.23 — ONE NAMED EXCEPTION, on the owner's direction ("make it look like
  // the actual card"). The rail poster is not stock photography borrowed to
  // decorate a claim; it IS the surface being shared, the owner drew it, and
  // its headline is baked into its own pixels — a preview that redraws that
  // headline in Archivo is a preview of a different object than the one the
  // sender tapped.
  //
  // The exception is narrow and it is mechanical: ONE <img>, in ONE file, whose
  // src is the MODEL FIELD the route already fetched and JPEG-sniffed. It may
  // never be a URL literal Satori resolves mid-render, which is the failure
  // this ban was really protecting against — see check-rail-share.mjs §3, which
  // proves the fetch is awaited before any header is written.
  const imgs = (src.match(/<img\b/g) || []).length;
  if (rel === "app/api/og/card.jsx") {
    ok(imgs <= 1, `${rel} renders ${imgs} <img> elements — the rail poster is the only one allowed`);
    ok(imgs === 0 || /<img src=\{m\.poster\}/.test(src),
       `${rel}: the only permitted <img> src is {m.poster} — a pre-fetched, sniffed data URI from lib/railShareCard.js, never a URL Satori resolves itself`);
  } else {
    ok(imgs === 0, `${rel} renders an <img> — the chosen direction has no photography, and an image is also the only thing in a card that can fail a fetch mid-response`);
  }
  ok(!/data:image\//.test(src), `${rel} embeds a data: image — this is how the deleted sunset photo survived being deleted`);
  ok(!/["'`][^"'`]*\.(png|jpe?g|webp|avif|gif)["'`]/.test(src), `${rel} references an image file`);
  ok(!/\+\s*null\b|\bnull\s*\+/.test(src), `${rel} concatenates null into a string — "SITE_URL + null" is how two routes ended up fetching https://www.gowayfind.comnull`);
}
for (const rel of ["lib/shareCards.js", "lib/shareCard.js", "lib/shareCardCopy.js", "lib/socialMeta.js"]) {
  const src = strip(readFileSync(path.join(REPO, rel), "utf8"));
  ok(!/data:image\//.test(src), `${rel} embeds a data: image`);
  ok(!/["'`]\/(cards|brand)\/[^"'`]+["'`]/.test(src), `${rel} points a share surface at an image again`);
}
// The base64 module itself must stay gone.
let ogbgGone = true;
try { statSync(path.join(REPO, "lib/ogbg.js")); ogbgGone = false; } catch (e) {}
ok(ogbgGone, "lib/ogbg.js is back — that file WAS the photograph the owner asked to delete");

// ── 6b. THE DELETED ART MAY NOT COME BACK ──────────────────────────────────
// Folded in from check-share-card-art.mjs, which is deleted with this commit:
// two guards each half-covering "no photograph in a share card" is how the
// base64 one slipped between them.
const DELETED = [
  "public/card-art.png", "public/share-card.png", "public/cards/nearby-v1.png",
  "public/cards/stays-v1.png", "public/cards/shopping-v1.png", "public/cards/world-cup.png",
  "public/cards/coupon-share.png",
];
for (const f of DELETED) {
  let there = true;
  try { statSync(path.join(REPO, f)); } catch (e) { there = false; }
  ok(!there, `${f} is back in the tree — the owner asked for it deleted`);
}
{
  // The art slots stay DECLARED as null. Deleting the field entirely would hide
  // the decision rather than record it. Asserted on the value shape, not on a
  // count: an earlier draft counted `art:` occurrences and matched runtime code
  // alongside the table.
  const sc = readFileSync(path.join(REPO, "lib/shareCards.js"), "utf8");
  const codeLines = sc.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));
  const withPaths = codeLines.filter((l) => /\b(static)?[Aa]rt:\s*["'`]\//.test(l));
  ok(withPaths.length === 0, `a share card still points at an image: ${withPaths.map((l) => l.trim().slice(0, 70)).join(" | ")}`);
  ok(/\bart:\s*null/.test(sc), "the share-card table must still declare its art slots as null");
}
// The site OG must resolve to something. Deleting share-card.png without
// repointing would leave every link preview on a 404 — worse than the design
// the owner disliked.
{
  const layout = strip(readFileSync(path.join(REPO, "app/layout.js"), "utf8"));
  ok(!/share-card\.png/.test(layout), "app/layout.js still points at the deleted share-card.png");
  ok(/["']\/api\/og["']/.test(layout), "app/layout.js must point og:image at the dynamic card, or previews have no image at all");
  const meta = strip(readFileSync(path.join(REPO, "lib/socialMeta.js"), "utf8"));
  ok(!/share-card\.png/.test(meta), "lib/socialMeta.js still points at the deleted share-card.png");
  const c = strip(readFileSync(path.join(REPO, "app/c/page.js"), "utf8"));
  ok(/api\/og\/coupon/.test(c), "the coupon landing page must unfurl the PER-COUPON image, not one baked poster for every deal ever texted");
}

// ── 7. ONE RENDERER, AND EVERY SURFACE USES IT ──────────────────────────────
const CALLERS = [
  "app/api/og/route.js", "app/api/og/intent/route.js", "app/api/og/beaches/route.js",
  "app/api/og/coupon/route.jsx", "app/api/og/list/card.jsx",
  "app/api/og/rail/route.jsx",
];
for (const rel of CALLERS) {
  const src = readFileSync(path.join(REPO, rel), "utf8");
  ok(/shareCardResponse/.test(src), `${rel} does not go through the one renderer — a second layout is how six surfaces drifted apart`);
  ok(!/new ImageResponse\(/.test(src), `${rel} builds its own ImageResponse instead of calling shareCardResponse`);
}
const card = readFileSync(path.join(REPO, "app/api/og/card.jsx"), "utf8");
ok((card.match(/new ImageResponse\(/g) || []).length === 1, "the renderer must construct exactly one ImageResponse");
ok(/h\.set\("Cache-Control"/.test(card),
   "the renderer must REBUILD Cache-Control — next/og appends an options header AFTER its own `immutable, max-age=31536000`, and immutable wins, which pins a broken card for a year");
ok(/fonts:\s*\[/.test(card), "the renderer must supply the Archivo faces — Satori has no fallback for a missing family");
for (const w of ["600", "700", "900"]) ok(card.includes(`Archivo-${w}-Latin.ttf`), `the renderer must load Archivo ${w}`);
ok(!/lib\/shareCard\.js[\s\S]{0,80}fontSize/.test(card), "sizing must come from the model, not be restated in the markup");

// ── 8. THE CTA HAS A WIDTH BUDGET, NOT A CHARACTER COUNT (v8.23) ───────────
// ctaFrom() used to be str(label, 22).toUpperCase() — a blind slice, no measure,
// no ellipsis. The `drive` rail walked straight into it: "Show me what's worth
// it" is 23 characters, so the pill shipped "SHOW ME WHAT'S WORTH I", a word cut
// mid-letter, past a green build. That is the same mistake section 2 exists for,
// simply never applied to the pill.
//
// fitCta() measures and drops WHOLE WORDS. These assertions say something
// stronger than "it fits": no first-party CTA is trimmed AT ALL. A new CTA that
// outgrows its pill should fail the build so the copy is shortened on purpose.
ok(CARD.ctaMaxWidth > 0, "the CTA needs a width budget, not a character count");
ok(CARD.w - 60 - (CARD.ctaMaxWidth + 60) >= CARD.padX + CARD.footMaxWidth + 20,
   `the CTA pill (${CARD.ctaMaxWidth + 60}px wide, right-aligned at 60) reaches back to ${CARD.w - 60 - (CARD.ctaMaxWidth + 60)}, and the foot already runs to ${CARD.padX + CARD.footMaxWidth}`);
ok(fitCta("Show me what's worth it") === "SHOW ME WHAT'S WORTH IT",
   `the 22-character slice is back: "Show me what's worth it" renders as "${fitCta("Show me what's worth it")}"`);
ok(fitCta("A".repeat(400)).length < 40, "an unbounded label must still be capped — two routes take their CTA from a query string");
ok(!/…/.test(fitCta("A".repeat(400))), "the CTA must never carry an ellipsis glyph — Archivo's Latin subset already gave us one tofu box");
for (const r of RAILS) {
  ok(fitCta(r.cta) === String(r.cta).toUpperCase(),
     `rail "${r.id}": the CTA renders as "${fitCta(r.cta)}" instead of "${String(r.cta).toUpperCase()}" — shorten the copy or widen the pill deliberately`);
}
for (const key of Object.keys(SHARE_CARDS)) {
  const c = shareCardFor(key);
  if (!c || !c.cta) continue;
  ok(fitCta(c.cta) === String(c.cta).toUpperCase(), `share card "${key}": its CTA does not fit the pill`);
}

if (fails.length) {
  console.error(`check-share-card: FAIL — ${fails.length}/${n}`);
  for (const f of fails) console.error("  · " + f);
  process.exit(1);
}
console.log(`check-share-card: OK — ${n} assertions; the fitter measured against real Archivo advances across ${Object.keys(models).length} models, ${Object.keys(SHARE_CARDS).length} share cards and ${intents} intent pages, and no photograph can reach a share card by path, data URI or element`);
