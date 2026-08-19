#!/usr/bin/env node
/**
 * check-rail-share — the rail card's share loop, asserted BY CALLING it.
 *
 * v8.23 put an image on a share card for the first time since the direction
 * went typographic, and it did that by NARROWING a build-enforced rule rather
 * than removing it. This guard is the other half of that trade: the exception
 * is only defensible while every clause of it is mechanically true.
 *
 * WHAT THIS FILE ENCODES, AND WHAT IT COST TO LEARN IT:
 *
 *   1. THE ORIGINAL BAN WAS ABOUT A FETCH, NOT A PICTURE. Two OG routes once
 *      built "SITE_URL + null", which Satori fetches, fails, and throws on
 *      AFTER the 200 headers are streaming — a zero-byte image the CDN then
 *      pins for a year. So the assertion that matters is not "is there an
 *      <img>", it is "were the bytes already in hand". Section 3 proves the
 *      route awaits fetchRailPoster() before it constructs any response, and
 *      that a miss falls through to the typographic card.
 *
 *   2. A 200 IS NOT A JPEG. A CDN edge can answer an asset request with an
 *      HTML error body under a 200. posterDataUri() sniffs FF D8 FF, so that
 *      body becomes a fallback instead of a grey rectangle inside a card
 *      somebody has already sent. Section 2 feeds it exactly that.
 *
 *   3. A SHARE MUST NOT CARRY THE HOST IT WAS MADE ON. The 2026-07-31 report
 *      was a link that previewed as "localhost" in iMessage. Section 4 proves
 *      every rail URL goes through canonicalShareUrl().
 *
 *   4. A <button> INSIDE AN <a> IS A NESTED INTERACTIVE. The share control
 *      forced the tile to split into .wf8-tile (the box) and .wf8-tlink (the
 *      destination). Section 5 proves they are siblings — and that the tile
 *      kept the identity the centering effect measures it by.
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RAILS, RAIL_IDS, railById, railArt, railArtFallback, RAIL_ART_DIR } from "../lib/rails.js";
import {
  RAIL_CARD, RAIL_HEADLINE, railPosterPath, railPosterUrl, posterDataUri,
  fetchRailPoster, railCardModel, railCtaFits, POSTER_MIME,
} from "../lib/railShareCard.js";
import { railSharePath, railShareUrl, railOgPath, railOgUrl, railShareIntent, railShareTitle, railShareDescription, railShareText } from "../lib/railShare.js";
import { railModel } from "../lib/shareCardCopy.js";
import { textWidth, fitCta } from "../lib/shareCard.js";
import { SITE_URL } from "../lib/site.js";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let n = 0;
const fails = [];
const ok = (c, m) => { n++; if (!c) fails.push(m); };
const read = (rel) => readFileSync(path.join(REPO, rel), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── 1. EVERY RAIL HAS REAL BYTES ON DISK ────────────────────────────────────
// Not "the path is well-formed" — the FILE. A rail whose poster 404s renders
// the fallback card forever and nobody finds out, because a fallback looks
// deliberate.
ok(RAILS.length >= 15, `expected the rails to be found, got ${RAILS.length}`);
for (const r of RAILS) {
  const arts = new Set([railArt(r, "fl"), railArt(r, "orlando"), railArt(r, "other")].filter(Boolean));
  ok(arts.size >= 1, `rail "${r.id}" resolves no artwork at all`);
  for (const a of arts) {
    const rel = "public" + railArtFallback(a).split("?")[0];
    let there = false, size = 0;
    try { const st = statSync(path.join(REPO, rel)); there = st.isFile(); size = st.size; } catch (e) {}
    ok(there, `rail "${r.id}": ${rel} does not exist — the share card would silently fall back forever`);
    ok(!there || size > 4096, `rail "${r.id}": ${rel} is ${size} bytes — too small to be the poster`);
  }
}

// ── 2. THE BYTES PATH REFUSES EVERYTHING IT SHOULD ──────────────────────────
// null, NEVER a concatenation. "SITE_URL + null" is the exact string shape that
// produced https://www.gowayfind.comnull and a cached zero-byte 200.
ok(railPosterUrl(null, RAILS[0], "fl") === null, "railPosterUrl with no origin must return null, not a concatenation");
ok(railPosterUrl("https://x.test", null, "fl") === null, "railPosterUrl with no rail must return null");
ok(railPosterUrl("https://x.test", {}, "fl") === null, "railPosterUrl for a rail with no art must return null");
for (const r of RAILS) {
  const u = railPosterUrl("https://www.gowayfind.com", r, "fl");
  ok(typeof u === "string" && u.startsWith("https://www.gowayfind.com" + RAIL_ART_DIR + "/"),
     `rail "${r.id}": poster url "${u}" left ${RAIL_ART_DIR}`);
  ok(!/null|undefined|NaN/.test(String(u)), `rail "${r.id}": a missing value leaked into the poster url "${u}"`);
}
// The path helper must not be talked outside its directory by a crafted rail.
ok(railPosterPath({ art: "../../../etc/passwd" }, "fl").indexOf(RAIL_ART_DIR + "/") === 0,
   "railPosterPath must stay rooted in the art directory");
ok(railPosterUrl("https://x.test", { art: "../../etc/passwd" }, "fl") === null,
   "a traversing art basename must resolve to null — the prefix check passes before URL normalisation and must be repeated after it");
ok(railPosterUrl("https://x.test", { art: "..%2f..%2fetc%2fpasswd" }, "fl") === null
   || String(railPosterUrl("https://x.test", { art: "..%2f..%2fetc%2fpasswd" }, "fl")).includes(RAIL_ART_DIR + "/"),
   "an encoded traversal must not escape the art directory either");

// A 200 CARRYING AN HTML ERROR BODY IS NOT A JPEG.
const htmlBody = new TextEncoder().encode("<!doctype html><title>404</title>");
ok(posterDataUri(htmlBody) === null, "posterDataUri must refuse a body that is not a JPEG — a 200 is not a format");
ok(posterDataUri(new Uint8Array(0)) === null, "posterDataUri must refuse empty bytes");
ok(posterDataUri(null) === null, "posterDataUri must refuse null rather than throw inside a render");
ok(posterDataUri(new Uint8Array([0xFF, 0xD8])) === null, "two bytes are not a JPEG");
{
  // A REAL poster, off the disk, through the real encoder.
  const rel = "public" + railArtFallback(railArt(RAILS[0], "fl")).split("?")[0];
  const bytes = readFileSync(path.join(REPO, rel));
  const uri = posterDataUri(new Uint8Array(bytes));
  ok(typeof uri === "string" && uri.startsWith("data:" + POSTER_MIME + ";base64,"),
     "a real poster must encode to a base64 data uri");
  ok(uri && uri.length > bytes.length, "the encoded uri must actually carry the bytes");
  // 32KB chunking exists because String.fromCharCode(...u8) blows the stack
  // somewhere around 100KB, and every poster is larger than that.
  ok(bytes.length > 80000, `the fixture poster is ${bytes.length} bytes — too small to prove the chunked encoder`);
  ok(Buffer.from(uri.split(",")[1], "base64").equals(Buffer.from(bytes)),
     "the chunked encoder must round-trip the file byte for byte");
}

// ── 3. THE ROUTE CANNOT FAIL MID-STREAM ─────────────────────────────────────
{
  const rel = "app/api/og/rail/route.jsx";
  ok(existsSync(path.join(REPO, rel)), rel + " is missing");
  const src = read(rel);
  const fetchAt = src.indexOf("await fetchRailPoster(");
  const modelAt = src.indexOf("railCardModel(");
  ok(fetchAt > -1, rel + ": the poster must be fetched by fetchRailPoster(), not by Satori");
  ok(modelAt > -1 && fetchAt < modelAt,
     rel + ": the poster must be AWAITED BEFORE the card model is built — the whole safety argument is that no fetch happens after headers are out");
  ok(/if \(!poster\) return await shareCardResponse\(railModel\(/.test(src),
     rel + ": a missing poster must fall through to the typographic card, never to a hole");
  ok(/shareCardResponse/.test(src) && !/new ImageResponse\(/.test(src),
     rel + ": must go through the one renderer rather than building its own ImageResponse");
  ok(/runtime = "edge"/.test(src), rel + ": the OG routes run on the edge");
  ok(!/["'`][^"'`]*\.(png|jpe?g|webp|avif|gif)["'`]/.test(src),
     rel + ": the poster path must come from lib/rails.js, never a literal in a route");
}
// fetchRailPoster must NEVER throw. Every caller is an image route.
{
  const dead = await fetchRailPoster("http://127.0.0.1:1", RAILS[0], "fl");
  ok(dead === null, "fetchRailPoster must return null on an unreachable origin, not reject");
  const noOrigin = await fetchRailPoster(null, RAILS[0], "fl");
  ok(noOrigin === null, "fetchRailPoster must return null when there is no origin to fetch from");
}
// The sniff is the thing. Prove it is still in the source, by shape.
ok(/0xFF && u8\[1\] === 0xD8 && u8\[2\] === 0xFF/.test(read("lib/railShareCard.js")),
   "lib/railShareCard.js must still sniff the JPEG magic — a 200 with an HTML body is the case this catches");

// ── 4. THE PLATE FITS, FOR ALL SEVENTEEN ────────────────────────────────────
ok(RAIL_CARD.w === 1200 && RAIL_CARD.h === 630,
   "the rail plate is 1200x630 — every platform except iMessage centre-crops a preview, and a portrait card loses half the artwork there");
ok(RAIL_CARD.posterX + RAIL_CARD.posterW < RAIL_CARD.colX,
   "the poster and the text column must not overlap");
ok(RAIL_CARD.colX + RAIL_CARD.colW <= RAIL_CARD.w - 40, "the text column runs off the plate");
ok(Math.abs(RAIL_CARD.posterW / RAIL_CARD.posterH - 0.5625) < 0.01,
   `the poster is drawn at ${(RAIL_CARD.posterW / RAIL_CARD.posterH).toFixed(4)} — the artwork is 760x1350 (0.5625) and must not be squashed to fit`);
for (const r of RAILS) {
  const m = railCardModel(r, "data:" + POSTER_MIME + ";base64,AAAA");
  const label = `rail "${r.id}"`;
  ok(m.fitted, `${label}: the plate headline could not be fitted`);
  ok(m.lines.length >= 1, `${label}: the plate produced no headline`);
  for (const line of m.lines) {
    ok(textWidth(line, m.size, 900) <= RAIL_CARD.colW + 0.5,
       `${label}: "${line}" is ${Math.round(textWidth(line, m.size, 900))}px in a ${RAIL_CARD.colW}px column`);
  }
  const blockH = m.lines.length * m.size * RAIL_CARD.lead;
  ok(m.top + blockH <= RAIL_CARD.ruleY - 6, `${label}: the headline runs into the rule`);
  ok(textWidth(m.foot, 23, 600) <= RAIL_CARD.colW + 0.5, `${label}: the foot overflows the column`);
  ok(m.accent.every((i) => i >= 0 && i < m.lines.length), `${label}: an accent index addresses no line`);
  ok(m.accent.length < m.lines.length, `${label}: accenting every line accents nothing`);
  ok(!/…$/.test(m.cta), `${label}: the CTA was cut to fit ("${m.cta}") — shorten the copy instead`);
  ok(railCtaFits(r.cta), `${label}: the CTA "${String(r.cta).toUpperCase()}" does not fit its pill`);
  ok(!/\b(undefined|null|NaN)\b/.test([m.foot, m.cta, ...m.lines].join(" ")), `${label}: a missing value leaked onto the plate`);
  ok(m.tint && /gradient/.test(m.tint), `${label}: the plate must wear the rail's own tint`);
  ok(m.variant === "rail", `${label}: the model must declare its plate`);
  // THE PLATE MAY NOT RESTATE THE POSTER. v8.1: the headline is already in the
  // artwork, in the owner's own type. Saying it again beside the picture is the
  // doubled copy that rule exists to stop.
  const said = m.lines.join(" ").toLowerCase();
  ok(!said.includes(String(r.title).toLowerCase()), `${label}: the plate repeats the rail's title, which is already baked into the artwork`);
  ok(!said.includes(String(r.short).toLowerCase()), `${label}: the plate repeats the artwork's own promise line`);
}
ok(/where you are/i.test(RAIL_HEADLINE),
   "the plate's one sentence must be the promise the artwork cannot make — that the link ranks around whoever opens it");
// The fallback card, for all seventeen.
for (const r of RAILS) {
  const t = railModel(r);
  ok(t.fitted && t.lines.length >= 1, `rail "${r.id}": the typographic fallback produced no card`);
  ok(!/…$/.test(t.eyebrow) && !/…$/.test(t.foot), `rail "${r.id}": the fallback truncated its own copy`);
  ok(fitCta(r.cta) === String(r.cta).toUpperCase(),
     `rail "${r.id}": the CTA renders as "${fitCta(r.cta)}" instead of "${String(r.cta).toUpperCase()}" — it does not fit the pill`);
}

// ── 5. THE LINK, AND THE HOST IT CARRIES ────────────────────────────────────
const prodHost = new URL(SITE_URL).hostname;
for (const id of RAIL_IDS) {
  const u = railShareUrl(id);
  ok(u.startsWith("https://"), `rail "${id}": a shared link must be https`);
  ok(new URL(u).hostname === prodHost, `rail "${id}": shared link points at ${new URL(u).hostname}, not ${prodHost} — this is the "it previewed as localhost" bug`);
  ok(new URL(u).pathname === railSharePath(id), `rail "${id}": the share url and the share path disagree`);
  ok(new URL(railOgUrl(id)).hostname === prodHost, `rail "${id}": the preview image url must be absolute and on the production host`);
  ok(railOgPath(id).startsWith("/api/og/rail?id="), `rail "${id}": the preview image must come from the rail route`);
  const intent = railShareIntent(id);
  ok(intent && intent.url === u && intent.id === id, `rail "${id}": the share intent disagrees with the share url`);
  for (const [k, v] of Object.entries(intent || {})) {
    ok(typeof v === "string" && v.length > 0, `rail "${id}": the share intent's ${k} is empty`);
    ok(!/\b(undefined|null|NaN)\b/.test(v), `rail "${id}": "${v}" leaked a missing value into a text message`);
  }
}
ok(railShareIntent("no-such-rail") === null, "an unknown rail must produce no share intent at all");
ok(railShareIntent("") === null, "an empty rail id must produce no share intent");
{
  // Comments stripped: this assertion's first run failed because lib/railShare.js
  // explains in a COMMENT why it must never read window.location. A guard that
  // can be failed by its own rationale is a guard someone deletes.
  const src = strip(read("lib/railShare.js"));
  ok(/canonicalShareUrl/.test(src), "lib/railShare.js must build every shared URL through canonicalShareUrl()");
  ok(!/window\.location/.test(src), "lib/railShare.js must never read window.location — that is what put a localhost host in a text message");
}
// The message body is the SENDER's, not ours, and it must not restate the
// picture. The title row already carries the rail's name.
for (const r of RAILS) {
  ok(railShareText(r).length <= 120, `rail "${r.id}": the message body is too long to survive a preview`);
  ok(/wayfind/i.test(railShareTitle(r)), `rail "${r.id}": the preview title must say who it is from`);
  ok(railShareDescription(r).length > 12, `rail "${r.id}": the preview description is empty`);
}

// ── 6. THE LANDING ──────────────────────────────────────────────────────────
{
  const rel = "app/r/[rail]/page.js";
  ok(existsSync(path.join(REPO, rel)), rel + " is missing — the shared link has nowhere to land");
  const src = read(rel);
  ok(/dynamicParams = false/.test(src), rel + ": /r/<anything> must 404, not render a doorway to nowhere");
  ok(/generateStaticParams/.test(src) && /RAIL_IDS/.test(src), rel + ": every rail must be prerendered from RAIL_IDS");
  ok(/robots: \{ index: false, follow: true \}/.test(src),
     rel + ": a share URL space is noindex/follow — it must not compete with the ranked pages it points at");
  ok(/railOgUrl/.test(src), rel + ": the preview image must be the rail's own card");
  ok(/summary_large_image/.test(src), rel + ": the Twitter card must be the large one or the poster is a thumbnail");
  ok(/ShareRedirect/.test(src) && /\?rail=/.test(src),
     rel + ": the reader must be handed to the homepage with the rail open — that is where the location re-ranking already lives");
  ok(/<a /.test(src), rel + ": a redirect page with no real link is a dead end for a crawler and for anyone without JS");
}
{
  const home = read("app/home.js");
  ok(/sp\.get\("rail"\)/.test(home), "app/home.js must read ?rail= from a shared link");
  ok(/RAILS\.some\(\(r\) => r\.id === k\)/.test(home),
     "app/home.js must validate ?rail= against RAILS — it is attacker-writable and an unknown id must open nothing");
  ok(/sp\.delete\("rail"\)/.test(home), "app/home.js must strip ?rail= after consuming it, the way ?exp= is stripped");
  ok(/initialRail=\{initialRail\}/.test(home), "app/home.js must hand the opening rail to DaypartRail");
  ok(/onShareRail=\{/.test(home), "app/home.js must hand the rail its share sheet");
  ok(/onShareRail=\{[\s\S]{0,400}?shareLink\(/.test(home),
     "the rail's share must go through shareLink() — it owns the iOS activation order a second implementation would get wrong");
}

// ── 7. THE CONTROL IS A SIBLING, NOT A NESTED INTERACTIVE ───────────────────
{
  const dr = read("app/components/DaypartRail.js");
  ok(/className="wf8-tlink"/.test(dr), "DaypartRail: the crawlable link must still exist, inside the tile");
  ok(/className="wf8-tshare"/.test(dr), "DaypartRail: the share control must exist");
  const linkAt = dr.indexOf('className="wf8-tlink"');
  const shareAt = dr.indexOf('className="wf8-tshare"');
  ok(linkAt > -1 && shareAt > linkAt, "DaypartRail: the share control must come after the link");
  ok(dr.slice(linkAt, shareAt).includes("</a>"),
     "DaypartRail: the share <button> must be a SIBLING of the <a>, not nested inside it — a button inside an anchor is a nested interactive");
  ok(/type="button"\n?\s*className="wf8-tshare"|className="wf8-tshare"/.test(dr) && /<button[\s\S]{0,120}wf8-tshare/.test(dr),
     "DaypartRail: the share control must be a real <button>, not a span wearing role=button");
  ok(/aria-label=\{.Share .\{r\.title\}.\}/.test(dr), "DaypartRail: the share control needs an accessible name naming the rail");
  ok(/e\.stopPropagation\(\); share\(r\)/.test(dr),
     "DaypartRail: a tap on the share control must not ALSO open the drop");
  ok(/logEvent\("rail_share"/.test(dr), "DaypartRail: a share must be measurable");
  ok(/railShareIntent/.test(dr), "DaypartRail: the tile must not build its own link string");
  ok(/const tile = track\.querySelector\("\.wf8-tile\.is-sel"\)/.test(dr),
     "DaypartRail: the tile/link split must not have moved .is-sel off the element the centering effect measures");
}
{
  const css = read("app/components/railMenuCss.js").replace(/\n\s*/g, "");
  ok(/\.wf8-tshare\{/.test(css), "railMenuCss: the share control has no style");
  ok(/@media\(hover:none\)\{\.wf8-tshare\{opacity:1/.test(css),
     "railMenuCss: on touch there is no hover to reveal the control, so it must always be visible");
  ok(/\.wf8-tile\.is-sel \.wf8-tshare\{opacity:1/.test(css),
     "railMenuCss: the open card's share control must be visible without hovering");
  ok(/\.wf8-tshare:focus-visible\{opacity:1/.test(css),
     "railMenuCss: a control that is invisible when focused is unreachable by keyboard");
  ok(/\.wf8-tlink\{position:absolute;inset:0/.test(css),
     "railMenuCss: the link must fill the tile, or most of the card is not tappable");
  // THE HEADROOM. .wf8-track is overflow-x:auto, so overflow-y computes to auto
  // and anything that lifts or scales past the padding box is CLIPPED. This is
  // the rule that makes the hover and the bigger chosen card visible at all.
  const pad = css.match(/\.wf8-track\{[^}]*padding:(\d+)px/);
  ok(pad && Number(pad[1]) >= 24,
     `railMenuCss: .wf8-track has ${pad ? pad[1] : "?"}px of top padding — the lift and the 1.05 chosen card need at least 24px or they are clipped by the scroller`);
  ok(/\.wf8-tile\.is-sel[^}]*scale\(1\.0[4-9]/.test(css),
     "railMenuCss: the chosen card must actually be BIGGER (owner, v8.23), not merely glowing");
  ok(!/\.wf8-tile\.is-sel[^}]*width:/.test(css),
     "railMenuCss: the chosen card grows by SCALE — a width change reflows the track and moves every snap point under a scrolling thumb");
  ok(/@keyframes wf8Sheen/.test(css), "railMenuCss: the hover sheen is missing");
  ok(/prefers-reduced-motion:reduce\)[^@]*\.wf8-tile::before\{display:none/.test(css)
     || /prefers-reduced-motion:reduce\)\{[^@]*\.wf8-tile::before\{display:none/.test(css),
     "railMenuCss: reduced motion must drop the sheen entirely");
}

if (fails.length) {
  console.error(`check-rail-share: FAIL — ${fails.length}/${n}`);
  for (const f of fails) console.error("  · " + f);
  process.exit(1);
}
console.log(`check-rail-share: OK — ${n} assertions across ${RAILS.length} rails; every poster exists on disk, the bytes are fetched and sniffed before any header is written, no share link can carry a dev host, and the share control is a sibling of the link rather than nested inside it`);
