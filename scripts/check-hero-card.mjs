#!/usr/bin/env node
/**
 * check-hero-card — the photo-led hero share card, asserted BY CALLING it.
 *
 * v9 (owner, 2026-09-23): "the share cards for all of the guide and blogs
 * needs to look premium i dont like the way it looks right now it looks
 * cheap … everything on wayfind that is sharable looks premium and looks
 * good on social media." His own Facebook preview of
 * /guides/sarasota-restaurants showed a tiny left-aligned PORTRAIT thumbnail
 * next to "www.gowayfind.com", because og:image pointed straight at the
 * reviewed guide asset — a raw 1067x1600 webp — with no card, no crop and no
 * brand around it.
 *
 * See docs/proposals/claude-sonnet-hero-photo-standard.md (proposed rule 9) for the amendment this guard enforces,
 * and scripts/check-rail-share.mjs for the sibling guard this one is modelled
 * on (the rail poster was the first photo ever let onto a share card; this
 * is the second, and it must be exactly as safe).
 */
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  HERO_CARD, HERO_SRC_ALLOWED_HOSTS, isAllowedHeroSrc, absoluteHeroUrl,
  isJpeg, bytesToDataUri, heroCountLabel, heroRatingLine, heroCardModel, heroFallbackModel, heroLineFits,
} from "../lib/heroCard.js";
import { textWidth } from "../lib/shareCard.js";
import { footFits } from "../lib/shareCardCopy.js";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let n = 0;
const fails = [];
const ok = (c, m) => { n++; if (!c) fails.push(m); };
const read = (rel) => readFileSync(path.join(REPO, rel), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── 1. THE PLATE, GEOMETRICALLY ─────────────────────────────────────────────
ok(HERO_CARD.w === 1200 && HERO_CARD.h === 630, "the hero plate must be 1200x630 — the standard OG size every platform agrees on");
ok(HERO_CARD.padX >= 48, "the safe margin must survive a tight crop — 48px is the floor every platform's own crop leaves alone");
ok(HERO_CARD.maxWidth === HERO_CARD.w - HERO_CARD.padX * 2, "maxWidth must equal the plate width minus both safe margins, not a separately-typed number that can drift from them");
ok(HERO_CARD.textBottom < HERO_CARD.h, "the headline's baseline must sit above the bottom edge, not on it");
ok(HERO_CARD.minTextTop > HERO_CARD.markY + HERO_CARD.markSize, "the headline block's floor must sit below the brand mark, or a long headline can climb over it");

// ── 2. THE SRC ALLOWLIST IS BOUNDED (SSRF / open-proxy guard) ───────────────
// This route is public. An unbounded ?src= would make it fetch, decode and
// re-serve any https URL on the internet, at Wayfind's expense, inside a
// Wayfind-branded card. The allowlist is what keeps ?src= a narrow escape
// hatch for the two known credited-photo-outside-a-registry cases rather
// than an open image proxy.
ok(HERO_SRC_ALLOWED_HOSTS.length >= 1 && HERO_SRC_ALLOWED_HOSTS.length <= 4,
   `HERO_SRC_ALLOWED_HOSTS has ${HERO_SRC_ALLOWED_HOSTS.length} entries — this is meant to stay a SHORT, reviewed list, not grow into an open allowlist`);
ok(isAllowedHeroSrc("https://images.unsplash.com/photo-1", "www.gowayfind.com"), "the Unsplash allowlist entry must actually pass");
ok(isAllowedHeroSrc("https://upload.wikimedia.org/x.jpg", "www.gowayfind.com"), "the Wikimedia allowlist entry must actually pass");
ok(isAllowedHeroSrc("https://www.gowayfind.com/x.jpg", "www.gowayfind.com"), "the site's own origin must be allowed (a ?src= re-pointing at our own asset)");
ok(!isAllowedHeroSrc("https://evil.example.com/x.jpg", "www.gowayfind.com"), "an arbitrary https host must be refused — this is the open-image-proxy / SSRF guard");
ok(!isAllowedHeroSrc("http://images.unsplash.com/photo-1", "www.gowayfind.com"), "a non-https URL must be refused even on an allowed host");
ok(!isAllowedHeroSrc("https://images.unsplash.com.evil.com/x.jpg", "www.gowayfind.com"), "a lookalike hostname must not pass a substring-style check");
ok(!isAllowedHeroSrc("", "www.gowayfind.com"), "an empty src must be refused, not treated as \"no override\" some other way that skips validation");
ok(!isAllowedHeroSrc("not a url", "www.gowayfind.com"), "a malformed src must be refused rather than throwing inside a render");
ok(!isAllowedHeroSrc(null, "www.gowayfind.com"), "a null src must be refused without throwing");

// ── 3. absoluteHeroUrl NEVER CONCATENATES ───────────────────────────────────
// "SITE_URL + null" is the exact string shape that produced
// "https://www.gowayfind.comnull" and a cached zero-byte 200 (see
// check-share-card.mjs §1 and lib/railShareCard.js's railPosterUrl).
ok(absoluteHeroUrl(null, "/x.webp") === null, "no origin must yield null, never a concatenation");
ok(absoluteHeroUrl("https://www.gowayfind.com", null) === null, "no path must yield null");
ok(absoluteHeroUrl("https://www.gowayfind.com", "") === null, "an empty path must yield null");
ok(absoluteHeroUrl("https://www.gowayfind.com", "/guides/x/hero.webp") === "https://www.gowayfind.com/guides/x/hero.webp",
   "a same-origin path must resolve absolute");
ok(absoluteHeroUrl("https://www.gowayfind.com", "https://upload.wikimedia.org/x.jpg") === "https://upload.wikimedia.org/x.jpg",
   "an already-absolute https url must pass through unchanged");
ok(absoluteHeroUrl("https://www.gowayfind.com", "not-a-path") === null, "a path with no leading slash and no https scheme must be refused, not guessed at");
for (const bad of [absoluteHeroUrl(null, "/x"), absoluteHeroUrl("https://x.test", null), absoluteHeroUrl(undefined, undefined)]) {
  // The CORRECT result for every one of these is the null primitive — that
  // is the refusal. What must never happen is a STRING that merely contains
  // "null"/"undefined" (the "https://…comnull" shape), so a bare `null`
  // return must not itself trip this check.
  ok(bad === null || !/null|undefined|NaN/.test(String(bad)),
     "a missing half must never leak into the resolved url as the literal substring \"null\"/\"undefined\" — expected the null primitive, got a string");
}

// ── 4. THE JPEG SNIFF AND ENCODER ───────────────────────────────────────────
const htmlBody = new TextEncoder().encode("<!doctype html><title>404</title>");
ok(isJpeg(htmlBody) === false, "isJpeg must refuse a body that is not a JPEG — a 200 is not a format");
ok(isJpeg(new Uint8Array(0)) === false, "isJpeg must refuse empty bytes");
ok(isJpeg(null) === false, "isJpeg must refuse null rather than throw inside a render");
ok(isJpeg(new Uint8Array([0xFF, 0xD8])) === false, "two bytes are not a JPEG");
ok(isJpeg(new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 0])) === true, "a real JPEG SOI marker must pass");
ok(bytesToDataUri(htmlBody) === null, "bytesToDataUri must refuse a non-JPEG body rather than encode it anyway");
ok(bytesToDataUri(null) === null, "bytesToDataUri must refuse null without throwing");
{
  // A REAL JPEG, off disk (the rail poster fixture — any first-party JPEG in
  // the repo proves the chunked encoder against real bytes, the same fixture
  // shape check-rail-share.mjs already trusts).
  const fixtures = [
    "public/cards-v8/birthday-760.jpg", "public/cards-v8/beach-760.jpg",
  ];
  let bytes = null, used = null;
  for (const f of fixtures) {
    try { bytes = readFileSync(path.join(REPO, f)); used = f; break; } catch {}
  }
  ok(!!bytes, "expected at least one rail-poster JPEG fixture on disk to prove the encoder against real bytes");
  if (bytes) {
    const uri = bytesToDataUri(new Uint8Array(bytes));
    ok(typeof uri === "string" && uri.startsWith("data:image/jpeg;base64,"), `a real JPEG (${used}) must encode to a base64 data uri`);
    ok(uri && uri.length > bytes.length, "the encoded uri must actually carry the bytes");
    ok(bytes.length > 80000, `the fixture ${used} is ${bytes.length} bytes — too small to prove the 32KB-chunked encoder`);
    const decoded = Buffer.from(uri.split(",")[1], "base64");
    ok(decoded.equals(bytes), "the chunked encoder must round-trip the file byte for byte");
  }
}

// ── 5. heroCountLabel — TRUTHFUL, AND NEVER A "1 PLACE" BADGE ───────────────
ok(heroCountLabel(12) === "12 PLACES", `expected "12 PLACES", got "${heroCountLabel(12)}"`);
ok(heroCountLabel(2) === "2 PLACES", `expected "2 PLACES", got "${heroCountLabel(2)}"`);
ok(heroCountLabel(1) === "", "a count of 1 must render no badge — \"1 place\" answers a question nobody asked");
ok(heroCountLabel(0) === "", "a count of 0 must render no badge");
ok(heroCountLabel(null) === "" && heroCountLabel(undefined) === "" && heroCountLabel("x") === "",
   "a missing or non-numeric count must render no badge, never NaN");

// ── 6. heroCardModel — EVERY TITLE LENGTH FITS, NEVER CLIPPED ───────────────
const TITLES = [
  "Sarasota", "The 12 Best Restaurants in Sarasota, Florida",
  "The Best Restaurants in Disney Springs: Where to Eat Before or After the Parks",
  "Things to Do in Punta Gorda, Florida This Weekend With the Whole Family and the Dog",
  "A".repeat(300), "",
];
for (const t of TITLES) {
  const m = heroCardModel({ title: t, cat: "Restaurants", loc: "Sarasota, FL", n: 12, hero: "data:image/jpeg;base64,AAAA" });
  ok(m.variant === "hero", `"${t.slice(0, 24)}…": the model must declare its plate`);
  ok(m.lines.length <= HERO_CARD.maxLines, `"${t.slice(0, 24)}…" produced ${m.lines.length} lines, max is ${HERO_CARD.maxLines}`);
  ok(m.lines.length >= 1 || t === "", `"${t.slice(0, 24)}…" produced no lines`);
  for (const line of m.lines) {
    ok(heroLineFits(line, m.size), `"${line}" is ${Math.round(textWidth(line, m.size, 900))}px at ${m.size}px — the plate is ${HERO_CARD.maxWidth}px`);
  }
  ok(m.top >= HERO_CARD.minTextTop - 0.5, `"${t.slice(0, 24)}…": the headline block starts at ${m.top}, above its floor`);
  ok(m.top + m.lines.length * m.size * HERO_CARD.lead <= HERO_CARD.textBottom + 0.5,
     `"${t.slice(0, 24)}…": the headline runs past its own baseline`);
  ok(m.kickerTop < m.top, `"${t.slice(0, 24)}…": the kicker must sit above the headline, not overlap it`);
  ok(m.accent.every((i) => i >= 0 && i < m.lines.length), `"${t.slice(0, 24)}…": an accent index addresses no real line`);
  ok(!/\bundefined\b|\bnull\b|\bNaN\b/.test([m.kicker, m.count, ...m.lines].join(" ")),
     `"${t.slice(0, 24)}…": a missing value leaked into the copy`);
}
// A short title must be set LARGE, exactly like the typographic ladder.
ok(heroCardModel({ title: "Sarasota" }).size === HERO_CARD.sizes[0],
   `a short title must take the top size ${HERO_CARD.sizes[0]}, got ${heroCardModel({ title: "Sarasota" }).size}`);
// The count badge only appears when it was given a real, plural count.
ok(heroCardModel({ title: "x", n: 12 }).count === "12 PLACES", "a real count must produce the badge");
ok(heroCardModel({ title: "x" }).count === "", "no count given must produce no badge");
ok(heroCardModel({ title: "x", n: 1 }).count === "", "a count of exactly 1 must produce no badge");
// The kicker composes category + place, and degrades cleanly with either
// half missing — the same eyebrowFrom() every other ladder uses.
ok(heroCardModel({ title: "x", cat: "Restaurants", loc: "Tampa" }).kicker.includes("RESTAURANTS"), "the kicker must carry the category");
ok(heroCardModel({ title: "x", cat: "Restaurants", loc: "Tampa" }).kicker.includes("TAMPA"), "the kicker must carry the place");
ok(heroCardModel({ title: "x" }).kicker === "", "no category or place given must produce no kicker rather than a bare separator");
// The default position, and a passed-through reviewed focal point.
ok(heroCardModel({ title: "x" }).position === "50% 50%", "with no focal point given, the model must default to a centred crop");
ok(heroCardModel({ title: "x", position: "30% 48%" }).position === "30% 48%", "a reviewed focal point must survive into the model unchanged");
// A null hero must survive into the model as null (never coerced to a
// truthy placeholder the JSX would then try to render as a src).
ok(heroCardModel({ title: "x" }).hero === null, "a model built with no hero must carry hero:null, not an empty string or a placeholder");

// ── 6b. THE PLACE PHOTO CARD — NAME HEADLINE, RATING, "SEE THE SPOT" ───────
// Audit (2026-09-23): the sample the owner's complaint pointed at was a
// synthetic test fixture, not this file — heroCardModel's headline is
// already the route's own `t=` (this place's real name) for every kind. The
// REAL gap: the route never passed kind/r/rev into the PHOTO-path model at
// all, so a place's rating never reached the plate and there was no CTA.
ok(heroRatingLine("4.2", "690") === "4.2 · 690 Google reviews", `expected "4.2 · 690 Google reviews", got "${heroRatingLine("4.2", "690")}"`);
ok(heroRatingLine("4.6", "1") === "4.6 · 1 Google review", "a single review must not read as plural");
ok(heroRatingLine("4.5", null) === "4.5 rating", "a rating with no review count still says something real, never blank");
ok(heroRatingLine(null, "690") === "", "a review count with no rating must not render — an unrated popularity claim is not one this route can back");
ok(heroRatingLine("0", "10") === "" && heroRatingLine("bad", "10") === "", "a zero or non-numeric rating must render nothing, never NaN or 0.0");
ok(!/★/.test(heroRatingLine("4.2", "690")), "heroRatingLine must NEVER embed the star glyph (U+2605) in its string — Archivo's Latin subset has no U+2605 (the exact tofu-box regression lib/shareCardCopy.js#placeModel already paid for); the star is drawn by the JSX Star component instead");
{
  const withPhoto = heroCardModel({ kind: "place", title: "Bern's Steak House", cat: "Steakhouse", loc: "Tampa", r: "4.6", rev: "8400", hero: "data:image/jpeg;base64,AAAA" });
  ok(/bern/i.test(withPhoto.lines.join(" ")), `the place PHOTO card's headline must be the business's own name, got lines=${JSON.stringify(withPhoto.lines)}`);
  ok(withPhoto.kicker.includes("STEAKHOUSE") && withPhoto.kicker.includes("TAMPA"), `the place PHOTO card's kicker must carry category + city, got "${withPhoto.kicker}"`);
  ok(withPhoto.rating === "4.6 · 8,400 Google reviews", `the place PHOTO card must carry the rating, got "${withPhoto.rating}"`);
  ok(withPhoto.cta === "SEE THE SPOT", `the place PHOTO card must carry the "SEE THE SPOT" pill, got "${withPhoto.cta}"`);
  ok(withPhoto.ratingTop != null && withPhoto.kickerTop < withPhoto.ratingTop && withPhoto.ratingTop < withPhoto.top,
     `the rating row must sit strictly between the kicker and the headline (kickerTop=${withPhoto.kickerTop}, ratingTop=${withPhoto.ratingTop}, top=${withPhoto.top})`);
  ok(withPhoto.top >= HERO_CARD.minTextTop - 0.5, "reserving room for the rating row must never push the headline above its own floor");

  const noRating = heroCardModel({ kind: "place", title: "Bern's Steak House", cat: "Steakhouse", loc: "Tampa", hero: "data:image/jpeg;base64,AAAA" });
  ok(noRating.rating === "" && noRating.ratingTop === null, "a place with no rating data must render no rating row, never a blank one");
  ok(noRating.kickerTop === noRating.top - HERO_CARD.kickerGap,
     "with no rating, the kicker must use the ORIGINAL (shorter) gap — the taller gap is reserved for when there is a second line to fit");
  ok(withPhoto.kickerTop === withPhoto.top - HERO_CARD.kickerGapRating,
     "with a rating, the kicker must use the TALLER gap so the rating row has room between it and the headline");

  // Gated on kind, not on the mere presence of r/rev — a stray query param
  // on a GUIDE card must never paint a rating or a place-only CTA onto it.
  const guideWithNumbers = heroCardModel({ kind: "guide", title: "The 12 Best Restaurants", r: "4.6", rev: "8400", hero: "data:image/jpeg;base64,AAAA" });
  ok(guideWithNumbers.rating === "" && guideWithNumbers.cta === "", "a guide card must never carry a rating row or the place-only CTA, even if r/rev are present in the query string");
  const noKind = heroCardModel({ title: "x", r: "4.6", rev: "8400", hero: "data:image/jpeg;base64,AAAA" });
  ok(noKind.rating === "" && noKind.cta === "", "a hero card with no kind at all must never carry the place-only rating/CTA");
}

// ── 7. heroFallbackModel — PER-PAGE TITLE, NEVER THE GENERIC HOMEPAGE LINE ──
// This is the other half of the owner's complaint: a card with no photo must
// still say something specific to the page it came from.
{
  const g = heroFallbackModel({ kind: "guide", title: "The 12 Best Restaurants in Sarasota", loc: "Sarasota", n: 12 });
  ok(g.fitted, "the guide fallback must fit its own title");
  ok(g.lines.join(" ").includes("Sarasota") || g.eyebrow.includes("SARASOTA"), "the guide fallback must carry the guide's own place, not go generic");
  ok(footFits(g.foot), "the guide fallback's foot must not run under the CTA");
  ok(!/best places near you, ranked before you ask/i.test(g.lines.join(" ")), "the fallback must never be the site-wide default headline — that IS the \"looks cheap, says nothing about this page\" complaint");

  const p = heroFallbackModel({ kind: "place", title: "Ulele", cat: "Riverfront American", loc: "Tampa", r: "4.6", rev: "8200" });
  ok(p.fitted, "the place fallback must fit");
  ok(/ulele/i.test(p.lines.join(" ")) || /ulele/i.test(p.eyebrow || ""), "the place fallback must name the actual place");
  ok(footFits(p.foot), "the place fallback's foot must not run under the CTA");
  ok(p.cta === "SEE THE SPOT", `the place fallback must carry the "SEE THE SPOT" CTA too (placeModel's own default), got "${p.cta}"`);
  // v9.1 — app/p/[id]/page.js has always supported a Wayfind score + distance
  // or a hook line for its richer headline (placeModel's own ladder); wiring
  // /p/[id] through this route must not silently drop that richness.
  const pScore = heroFallbackModel({ kind: "place", title: "Ulele", loc: "Tampa", sc: "9.1", mi: "3.2" });
  ok(/9\.1/.test(pScore.lines.join(" ")), `sc/mi must reach placeModel's score+distance headline, got lines=${JSON.stringify(pScore.lines)}`);
  const pHook = heroFallbackModel({ kind: "place", title: "Ulele", hook: "The best sunset view on the river" });
  ok(/sunset/i.test(pHook.lines.join(" ")), `hook must reach placeModel's hook headline, got lines=${JSON.stringify(pHook.lines)}`);
  const pFall = heroFallbackModel({ kind: "place", title: "Gasparilla Distillery", loc: "Tampa", tone: "fall" });
  ok(pFall.tone === "fall", "tone must reach placeModel unchanged — the season has to survive this route too (scripts/check-fall-share.mjs owns the fuller contract)");

  const e = heroFallbackModel({ kind: "event", title: "Möbius Sarasota Night Market", loc: "Sarasota" });
  ok(e.fitted && e.lines.length >= 1, "the event fallback must produce a real card");

  // v9.1 — a distinct, non-bare town card: named as a town guide, and a real
  // subline about what's inside, never the bare sitewide "Ranked by Wayfind"
  // line every OTHER kind already carried before this.
  const t1 = heroFallbackModel({ kind: "town", title: "Sarasota, Florida", loc: "Sarasota", n: 24 });
  ok(t1.fitted, "the town fallback must fit");
  ok(t1.eyebrow.includes("FLORIDA TOWN GUIDE"), `the town card must carry a distinct kicker naming what it is, got eyebrow="${t1.eyebrow}"`);
  ok(/sarasota/i.test(t1.lines.join(" ")), "the town card's headline must still carry the actual town");
  ok(/24 spots/.test(t1.foot), `a real spot count must reach the subline, got foot="${t1.foot}"`);
  ok(!/^Ranked by Wayfind · never paid placement$/.test(t1.foot), "a town card's subline must say what's actually inside, not the bare sitewide default");
  const t2 = heroFallbackModel({ kind: "town", title: "Naples, Florida" });
  ok(/restaurants|beaches|things to do/i.test(t2.foot), `with no spot count, the town card must still name real categories, got foot="${t2.foot}"`);
  const tBare = heroFallbackModel({ kind: "town" });
  ok(tBare.fitted && tBare.lines.length >= 1 && tBare.cta, "even a bare town fallback must produce a complete card, not a hole");

  const bare = heroFallbackModel({});
  ok(bare.fitted && bare.lines.length >= 1 && bare.cta, "even a bare fallback call must produce a complete card, not a hole");
}

// ── 8. THE ROUTE: BYTES BEFORE ANY RESPONSE, NEVER ITS OWN ImageResponse ────
{
  const rel = "app/api/og/hero/route.js";
  ok(existsSync(path.join(REPO, rel)), rel + " is missing");
  const src = read(rel);
  ok(/runtime = "nodejs"/.test(src), rel + ": must declare the node runtime — sharp is a native addon the edge runtime cannot bundle");
  ok(/import sharp from "sharp"/.test(src), rel + ": must convert the source photo with sharp, not hand Satori a webp it cannot decode");
  // Stripped of comments before the position check — the file's own header
  // comment narrates "before shareCardResponse() constructs any
  // ImageResponse" in prose, and that substring appearing early in a COMMENT
  // must not let this assertion pass for the wrong reason (CLAUDE.md: assert
  // the syntactic position, not merely that the identifier appears).
  const code = strip(src);
  const fetchAt = code.indexOf("await fetch(");
  const shareAt = code.indexOf("shareCardResponse(");
  ok(fetchAt > -1, rel + ": the source photo must be fetched, not assumed present");
  ok(shareAt > -1 && fetchAt < shareAt,
     rel + ": the photo must be fetched AND converted BEFORE any response is built — the whole safety argument is that no fetch happens after headers are implied");
  ok(/if \(!heroDataUri\)/.test(src) && /heroFallbackModel\(/.test(src),
     rel + ": a missing/failed photo must fall through to the typographic fallback, never to a hole");
  ok(/shareCardResponse/.test(src) && !/new ImageResponse\(/.test(src),
     rel + ": must go through the one renderer rather than building its own ImageResponse");
  ok(/isJpeg\(jpeg\)/.test(src), rel + ": must sniff the JPEG magic bytes on the sharp-encoded output before trusting it");
  ok(!/\+\s*null\b|\bnull\s*\+/.test(src), rel + ": must never concatenate null into a url string");
  ok(!/\/api\/photo/.test(src), rel + ": must never reach for the metered, robots-disallowed Google Places photo route");
  ok(/catch/.test(src) && /NEVER THROW/i.test(src), rel + ": the top-level handler must document (and implement) that it never throws past its own boundary");
}

// ── 8b. THE SHARED RENDERER'S FONTS ACTUALLY LOAD ON NODE.JS ────────────────
// SHIPPED BROKEN TWICE in this exact PR. First: app/api/og/card.jsx loaded
// its fonts with fetch(new URL(path, import.meta.url)), which only resolves
// on the edge runtime — `next build` logged "Failed to parse URL from
// /_next/static/media/…ttf" during "Collecting page data" and kept going, so
// the build stayed green while a live `next start` + curl against
// /api/og/hero returned a bare 500 for every kind. Second: fixing that by
// importing node:fs/node:path INTO card.jsx (even behind a `typeof
// EdgeRuntime` check that never executes the node branch) broke `next build`
// outright for every OTHER OG route, because webpack resolves a dynamic
// import("node:path") statically regardless of which branch runs it — a bare
// node:* reference anywhere in card.jsx's module graph poisons the edge
// bundle. The fix that survives both: card.jsx stays edge-only and never
// imports a node built-in; the ONE Node.js caller (the hero route) loads its
// own font buffers from disk and hands them to shareCardResponse() via
// opts.fontBuffers, a parameter every edge caller simply omits.
{
  const cardSrc = read("app/api/og/card.jsx");
  // Comment-stripped: this very section's own comment narrates the node:path
  // import that broke the build, in prose, and that must not make the check
  // it explains pass for the wrong reason (CLAUDE.md: assert the syntactic
  // position, not merely that the string appears).
  ok(!/\bnode:(fs|path)\b/.test(strip(cardSrc)),
    "app/api/og/card.jsx: must never import a Node built-in (fs, path) — even dead code behind a runtime check fails the edge bundle for every other OG route that imports this file");
  ok(/o\.fontBuffers/.test(cardSrc),
    "app/api/og/card.jsx: shareCardResponse must accept an opts.fontBuffers override, which is the ONLY seam the Node.js hero route uses to supply fonts it loaded itself");
  const heroSrc = read("app/api/og/hero/route.js");
  ok(/from "node:fs\/promises"/.test(heroSrc) && /from "node:path"/.test(heroSrc),
    "app/api/og/hero/route.js: must load its own fonts via node:fs/node:path — it is the one route allowed to, since it is never bundled for the edge");
  ok(/readFile\(/.test(heroSrc) && /process\.cwd\(\)/.test(heroSrc),
    "app/api/og/hero/route.js: must read the font files from disk (fs.readFile against a process.cwd()-based path)");
  ok(/fontBuffers/.test(heroSrc) && (heroSrc.match(/shareCardResponse\(/g) || []).length >= 2,
    "app/api/og/hero/route.js: every shareCardResponse call (hero card, fallback) must pass its own loaded fontBuffers, since card.jsx's module-level fetch cannot resolve on Node.js");
  // A process.cwd()-based path is exactly what Next's automatic file tracer
  // cannot see (next.config.js's own ownedHotels.json comment already paid
  // for this lesson once) — the deployed Node lambda needs the fonts listed
  // explicitly or it 500s in production despite passing every local check.
  const nextConfigSrc = read("next.config.js");
  ok(/"\/api\/og\/hero":\s*\[["'`]\.\/app\/api\/og\/fonts/.test(nextConfigSrc),
    "next.config.js: outputFileTracingIncludes must list app/api/og/fonts/*.ttf for /api/og/hero, or the deployed lambda ships without the fonts it reads from disk");
}

// ── 9. NO /api/photo IN ANY og:image, ANYWHERE ──────────────────────────────
// robots.txt disallows /api/photo (metered Google Places imagery, ledger
// exhausted) — it must never be what a crawler or a link-preview bot fetches
// as a page's social image.
const APP_FILES = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    const f = path.join(d, e);
    const st = statSync(f);
    if (st.isDirectory()) walk(f);
    else if (/page\.js$/.test(e)) APP_FILES.push(f);
  }
})(path.join(REPO, "app"));
ok(APP_FILES.length >= 20, `expected to find the app's page.js files, got ${APP_FILES.length}`);
const ogPages = [];
for (const f of APP_FILES) {
  const src = readFileSync(f, "utf8");
  if (/openGraph\s*:/.test(src)) ogPages.push({ f, src });
}
ok(ogPages.length >= 20, `expected at least 20 pages with a share preview, found ${ogPages.length}`);
for (const { f, src } of ogPages) {
  const rel = path.relative(REPO, f);
  const stripped = strip(src);
  const throughHelper = stripped.includes("socialMeta(");
  // Scoped to each openGraph BLOCK specifically, never to the whole file —
  // `twitter.images` is a plain array of URL strings by design (Twitter
  // Cards have no separate width/height meta tags), so matching "images:"
  // anywhere in the file would wrongly demand dimensions there too, and a
  // file can also declare openGraph more than once (two metadata branches
  // in one page, e.g. an evergreen window list vs a dated detail).
  const ogStarts = [...stripped.matchAll(/openGraph\s*:/g)].map((m) => m.index);
  ok(ogStarts.length >= 1, `${rel}: matched as an openGraph page but no openGraph: key survives comment-stripping`);
  for (const start of ogStarts) {
    const rest = stripped.slice(start);
    const nextOg = rest.indexOf("openGraph", 1);
    const nextTwitter = rest.search(/\btwitter\s*:/);
    let end = 2000;
    if (nextTwitter > 0) end = Math.min(end, nextTwitter);
    if (nextOg > 0) end = Math.min(end, nextOg);
    const block = rest.slice(0, end);
    ok(/images\s*:/.test(block) || throughHelper,
       `${rel}: an openGraph block has no images key and the page does not go through socialMeta() — the share preview can render with no image at all`);
    const imagesMatch = block.match(/images\s*:\s*\[[\s\S]{0,500}?\]/);
    if (!imagesMatch) continue;
    const imgBlock = imagesMatch[0];
    ok(!/\/api\/photo/.test(imgBlock), `${rel}: an og:image points at /api/photo — metered, robots-disallowed, and never meant to back a share preview`);
    // Regression check for the exact bug found and fixed alongside this
    // guard: both blog-style guides shipped `images: [shareImage]`, a bare
    // string with no dimensions at all, indistinguishable from a broken
    // preview on several platforms.
    ok(throughHelper || (/width\s*:/.test(imgBlock) && /height\s*:/.test(imgBlock)),
       `${rel}: an openGraph images array has no width/height and the page does not go through socialMeta() — ${JSON.stringify(imgBlock.slice(0, 80))}`);
  }
}

// ── 10. THE GUIDE, PLACE AND EVENT SURFACES ACTUALLY CALL THE HERO ROUTE ────
{
  const guide = read("app/guides/[slug]/page.js");
  ok(/\/api\/og\/hero\?kind=guide/.test(guide), "app/guides/[slug]/page.js must unfurl through the hero route — this is the exact page the owner's Facebook screenshot was of");
  ok(!/guideImageMetadata\(/.test(guide) || /\/api\/og\/hero/.test(guide),
     "app/guides/[slug]/page.js must not point og:image straight at the raw reviewed asset any more");

  const fall = read("app/guides/florida-fall-festivals-2026/page.js");
  ok(/\/api\/og\/hero\?kind=guide/.test(fall), "the fall-festivals guide must carry a real photo card too — it is a blog-style guide, not exempt from the owner's direction");

  const pintos = read("app/guides/pintos-farm-miami-2026/page.js");
  ok(/\/api\/og\/hero\?kind=guide/.test(pintos), "the Pinto's Farm guide must carry a real photo card too");

  const places = read("lib/placeData.js");
  ok(/\/api\/og\/hero\?kind=place/.test(places), "lib/placeData.js#placePageMetadata must unfurl /places/[id] through the hero route");
  ok(/city\s*\?\s*`&loc=\$\{encodeURIComponent\(city\)\}`/.test(places),
     "lib/placeData.js#placePageMetadata's hero URL must build &loc= from the PER-PLACE `city` variable (cityOf(p.address)), never a literal city name");

  // v9.1 (audit) — /p/[id] (the in-app share-button link, distinct from the
  // durable /places/[id] page above) used to unfurl through the bare
  // typographic /api/og?kind=place — the same "cheap" card the owner's
  // complaint was about, just reached from a different page.
  const pShare = read("app/p/[id]/page.js");
  ok(/\/api\/og\/hero\?kind=place&id=/.test(pShare), "app/p/[id]/page.js must unfurl through the hero route too, carrying this place's own id");
  ok(/og \+= "&tone=fall"/.test(pShare), "app/p/[id]/page.js must still hand the hero route its fall tone the same way it always has — scripts/check-fall-share.mjs owns the fuller contract");

  const flEvent = read("app/florida-events/[slug]/page.js");
  ok(/\/api\/og\/hero\?kind=event/.test(flEvent), "app/florida-events/[slug]/page.js must go through the hero route rather than pointing og:image straight at the static file");

  const evSlug = read("app/events/[city]/[slug]/page.js");
  ok(/\/api\/og\/hero\?kind=event/.test(evSlug), "app/events/[city]/[slug]/page.js's dated detail metadata must go through the hero route");
  ok(/twitter:\s*\{/.test(evSlug.split("isEventWindow(params.slug)")[1] || evSlug),
     "the dated event detail page must carry a twitter card too, not only openGraph");
}

// ── 11. check:jsx COVERS THE NEW ROUTE ──────────────────────────────────────
{
  const pkg = read("package.json");
  ok(pkg.includes("app/api/og/hero/route.js"), "package.json's check:jsx must type-check the new hero route alongside app/api/og/card.jsx");
}

// ── 12. CITY RESOLUTION IS PER-PLACE, NEVER ONE HARDCODED TEST CITY ─────────
// Audit (2026-09-23): verify against two REAL places named in the audit —
// La Natural (Miami) and Bern's Steak House (Tampa) — that lib/placeData.js's
// cityOf() actually resolves a different city per address rather than
// returning something constant. cityOf is the pure function
// placePageMetadata feeds into the hero URL's &loc=, asserted in section 10.
//
// EXTRACTED FROM SOURCE rather than imported: lib/placeData.js's own imports
// (`from "./site"`, `from "./socialMeta"`, …) omit the .js extension, which
// Next's webpack bundler resolves but plain Node ESM — every guard here runs
// under plain `node`, not the Next build — cannot. cityOf itself has zero
// external references (verified below), so it is extracted and evaluated in
// isolation rather than dragging that unrelated, pre-existing extension gap
// into scope for this PR.
{
  const placeDataSrc = read("lib/placeData.js");
  const m = placeDataSrc.match(/export function cityOf\(address\) \{[\s\S]*?\n\}/);
  ok(!!m, "lib/placeData.js#cityOf must exist in the expected shape to test in isolation");
  const body = m ? m[0] : "";
  ok(!/\bimport\b|[^.\w]require\(/.test(body), "cityOf must stay a PURE function with no external reference — that is the only reason extracting it for isolated testing here is safe");
  // eslint-disable-next-line no-new-func
  const cityOf = m ? new Function("return (" + body.replace("export function", "function") + ")")() : () => null;
  const laNatural = cityOf("7289 NW 2nd Ave, Miami, FL 33150");
  const berns = cityOf("1208 S Howard Ave, Tampa, FL 33606");
  ok(laNatural === "Miami", `cityOf must resolve La Natural's address to "Miami", got "${laNatural}"`);
  ok(berns === "Tampa", `cityOf must resolve Bern's Steak House's address to "Tampa", got "${berns}"`);
  ok(laNatural !== berns, "two different places' addresses must resolve to two different cities — a constant return here is exactly the \"said SARASOTA for everything\" failure mode");
  ok(cityOf(null) === null && cityOf("") === null, "a missing address must resolve to null, never a fallback city string");
}

// ── 12b. THE ROUTE ACTUALLY HANDS kind/r/rev TO THE PHOTO MODEL ─────────────
// This is the exact regression the audit found: heroCardModel itself (tested
// directly above) has always gated the rating row and the CTA correctly on
// `kind === "place"` — the route just never PASSED kind, r or rev into its
// one heroCardModel(...) call for the photo path, so a real place with a real
// resolved photo could never show either. Unit-testing heroCardModel alone
// cannot catch that class of bug (a wiring gap in the CALLER, not the
// function) — this asserts the actual call site.
{
  const code = strip(read("app/api/og/hero/route.js"));
  const calls = (code.match(/heroCardModel\(/g) || []).length;
  ok(calls === 1, `expected exactly one heroCardModel(...) call site (the photo path) to inspect, found ${calls}`);
  const at = code.indexOf("heroCardModel(");
  const close = code.indexOf("});", at);
  const block = at > -1 && close > -1 ? code.slice(at, close) : "";
  ok(/\bkind\b/.test(block), "app/api/og/hero/route.js's heroCardModel(...) call must pass kind — without it the model can never know a card is a place, so it can never show the rating or the \"SEE THE SPOT\" pill even when it resolved a real photo");
  ok(/\br\b/.test(block) && /\brev\b/.test(block), "app/api/og/hero/route.js's heroCardModel(...) call must pass r and rev — this route already extracts both from the query string, and dropping them here is exactly how a place's rating never reached the photo layout");
}

// ── 13. THE HERO ROUTE'S OUTPUT IS JPEG (v9.1, audit 2026-09-23) ───────────
// A rendered 1200x630 card with a full-bleed photo behind it came out around
// 1MB as next/og's native PNG. This route already has sharp in hand (to
// decode the SOURCE photo); it must also use it to re-encode its own OUTPUT
// before ever returning a Response, and every returned Content-Type must
// therefore be image/jpeg, never the PNG shareCardResponse itself produces.
// scripts/test-og-bodies.mjs proves this live against a running server
// (content-type, byte budget, JPEG magic bytes); this half proves the code
// shape that makes that true rather than incidental.
{
  const src = read("app/api/og/hero/route.js");
  const code = strip(src);
  ok(/function toJpegResponse/.test(code), "app/api/og/hero/route.js must define a dedicated PNG→JPEG re-encode step — the shared renderer itself must stay PNG-only for every other (edge) OG route");
  ok(/Content-Type",\s*"image\/jpeg"/.test(code), "the re-encode step must set Content-Type: image/jpeg explicitly — copying shareCardResponse's own headers would keep the PNG content-type on a JPEG body");
  const shareCalls = (code.match(/shareCardResponse\(/g) || []).length;
  const jpegWraps = (code.match(/toJpegResponse\(/g) || []).length;
  ok(shareCalls >= 3, `expected the photo path, the no-photo fallback and the top-level catch fallback to each call shareCardResponse, found ${shareCalls}`);
  ok(jpegWraps >= shareCalls, `every shareCardResponse(...) result must be piped through toJpegResponse — found ${shareCalls} shareCardResponse call(s) but only ${jpegWraps} toJpegResponse call(s)`);
  // The absolute-last-resort fallback (fonts AND sharp both unavailable) is
  // the one path allowed to answer PNG instead — it exists because nothing
  // else can be trusted to run at that point, sharp included.
  ok(/"Content-Type":\s*"image\/png"/.test(code), "the true last-resort 1x1 fallback (sharp itself unavailable) must still exist as a bare PNG literal — the one Content-Type this route may answer besides image/jpeg, and only there");
}

if (fails.length) {
  console.error(`check-hero-card: FAIL — ${fails.length}/${n}`);
  for (const f of fails) console.error("  · " + f);
  process.exit(1);
}
console.log(`check-hero-card: OK — ${n} assertions; ${TITLES.length} title lengths fitted with no clipping, the src allowlist refuses every non-listed host, the JPEG sniff/encoder round-trips real bytes, ${ogPages.length} og:image pages carry no /api/photo, and guides/places/events all resolve through the hero route`);
