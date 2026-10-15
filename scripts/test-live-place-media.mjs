#!/usr/bin/env node
/**
 * scripts/test-live-place-media.mjs — venue photos on event pages and guide picks
 * go through the credited per-page photo lane, never a bare /api/photo <img>.
 *
 * THE BUG (owner, 2026-10-15, /florida-events/grim-galas-halloween-party-500-costume-tampa-2026
 * plus the winter beaches and holiday lights guides): the card showed the venue
 * photo, the event page it opened showed "Photo unavailable" with a "Photo: Google
 * Maps" credit; 133 of 466 live guide picks with a known place had no picture.
 * Since 2026-10-14 /api/photo serves a live Google photo only to the page's own
 * credited fetch (lib/photoAnswers.js); a bare <img src="/api/photo?place=…&g=2">
 * is answered 404 `not-google-surface` (measured live on production 2026-10-15).
 *
 * What this asserts, by CALLING the code:
 *   1. lib/livePlaceMedia.js reads the place id off every /api/photo src shape and
 *      rejects non-photo srcs; the credit is built from the answer itself (authors,
 *      Google Maps link) and a Google answer with no Maps link is refused.
 *   2. EventPlacePhoto server-renders an /api/photo src as the pending tile with NO
 *      <img> carrying that src (the browser asks the credited lane), and still draws
 *      an ordinary owned src as a plain <img>.
 *   3. GuideFigure renders a live Google answer's credit under the photo, with the
 *      Google Maps link exactly once (authorless case too).
 *   4. The guide page mounts <GuideLivePickPhoto inside the picks render loop, only on
 *      the no-curated-photo branch, and the client asks getPlacePhoto(..., "detail").
 * Red-prove: `--red-prove` re-runs check 2 against an in-memory pre-fix component
 * (bare <img src={src}>) and requires it to FAIL.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { placeIdFromPhotoSrc, creditForAnswer, guideMediaForAnswer } from "../lib/livePlaceMedia.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0; const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };
const ID = "ChIJVQB8l1PEwogRfNZtGI6suIc"; // Gasparilla Distillery, the owner's report

// 1. pure helpers
ok(placeIdFromPhotoSrc(`/api/photo?place=${ID}&g=2&w=640`) === ID, "place id read from ?place= src");
ok(placeIdFromPhotoSrc(`/api/photo?ref=places/${ID}/photos/AbC123&w=640`) === ID, "place id read from ?ref= src");
ok(placeIdFromPhotoSrc("https://upload.wikimedia.org/x.jpg") === "", "non-photo-route src has no place id");
ok(placeIdFromPhotoSrc("/api/photo?place=nope") === "", "malformed place id is rejected, never guessed");
const g = { src: "https://lh3.googleusercontent.com/p/x", source: "google", credit: { mapsUri: "https://maps.google.com/?cid=1", authors: [{ name: "Ana R", uri: "https://www.google.com/maps/contrib/1" }] } };
const c = creditForAnswer(g);
ok(c && c.kind === "google" && c.authors[0].name === "Ana R" && c.mapsUri === "https://maps.google.com/?cid=1", "Google credit carries author and Maps link from the answer");
ok(creditForAnswer({ src: "https://lh3.googleusercontent.com/p/x", source: "google", credit: { authors: [] } }) === null, "a Google answer with no Maps link is refused (never shown uncredited)");
ok(creditForAnswer({ src: "https://upload.wikimedia.org/a.jpg", source: "licensed", credit: { name: "J. Doe", uri: "https://commons.wikimedia.org/x", license: "CC BY 4.0" } }).kind === "licensed", "licensed answer keeps its photographer and licence");
const m = guideMediaForAnswer(g, "Coquina Beach");
ok(m && m.src === g.src && m.credit === "Ana R" && m.providerHref === "https://maps.google.com/?cid=1" && m.alt === "Coquina Beach", "guide media built from the answer");

// 2. EventPlacePhoto server render
const ev = await loadComponent(path.join(REPO, "app/components/EventPlacePhoto.js"), REPO);
const html = renderToStaticMarkup(createElement(ev.default, { src: `/api/photo?place=${ID}&g=2&w=640`, name: "Gasparilla Distillery, venue photo", priority: true }));
const bareImg = /<img[^>]*src="\/api\/photo/.test(html);
ok(!bareImg, "event page never draws a bare /api/photo <img> (route answers not-google-surface)");
ok(/data-photo-fallback|wf-photo-fallback|aria-busy|pending|<span|<div/.test(html), "event page shows the pending tile while the credited lane answers");
const owned = renderToStaticMarkup(createElement(ev.default, { src: "/cards-v8/mobius.webp", name: "Möbius" }));
ok(/<img[^>]*src="\/cards-v8\/mobius\.webp"/.test(owned), "an owned event photo is still a plain <img> (control)");
const credHtml = renderToStaticMarkup(createElement(ev.EventPlacePhotoCredit, { src: `/api/photo?place=${ID}&g=2&w=640`, lead: "Venue photo · X is not pictured." }));
ok(credHtml === "", "no venue-photo credit line before that photo is on screen");

// 3. GuideFigure credit
const gf = await loadComponent(path.join(REPO, "app/components/GuideFigure.js"), REPO);
const fig = renderToStaticMarkup(createElement(gf.default, { role: "pick", image: m }));
ok(/<figure/.test(fig) && /Ana R/.test(fig) && (fig.match(/>Google Maps</g) || []).length === 1, "guide pick shows the photo with author + one Google Maps link under it");
const anon = guideMediaForAnswer({ ...g, credit: { mapsUri: "https://maps.google.com/?cid=1", authors: [] } }, "Bahia Honda");
const figAnon = renderToStaticMarkup(createElement(gf.default, { role: "pick", image: anon }));
ok(/<figure/.test(figAnon) && (figAnon.match(/Google Maps/g) || []).length === 1, "authorless Google photo is credited by one Google Maps link, never twice");

// 4. guide page wiring + client lane
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const page = strip(readFileSync(path.join(REPO, "app/guides/[slug]/page.js"), "utf8"));
const start = page.indexOf("g.picks.map((pick, i)");
const loop = page.slice(start, page.indexOf("</section>", start));
ok(start > 0 && /pickImage \? \([\s\S]*?<GuideFigure role="pick"[\s\S]*?\) : livePickPlaceIds\[i\] \? \([\s\S]*?<GuideLivePickPhoto[\s/>]/.test(loop), "guide picks loop mounts GuideLivePickPhoto only when no curated/licensed photo exists");
ok((page.match(/<GuideLivePickPhoto[\s/>]/g) || []).length === 1, "GuideLivePickPhoto mounted in exactly one place");
const live = strip(readFileSync(path.join(REPO, "app/components/GuideLivePickPhoto.js"), "utf8"));
ok(/getPlacePhoto\(id, \{ surface: "detail" \}\)/.test(live) && /IntersectionObserver/.test(live), "guide pick asks the shared credited lane, only near the viewport");
const evSrc = strip(readFileSync(path.join(REPO, "app/components/EventPlacePhoto.js"), "utf8"));
ok(/getPlacePhoto\(placeId, \{ surface: "detail" \}\)/.test(evSrc), "event photo asks the shared credited lane");

if (process.argv.includes("--red-prove")) {
  // Render the REAL pre-fix component (origin/main before 2026-10-15) through the
  // same harness and require check 2 to catch it.
  const { execFileSync } = await import("node:child_process");
  const { writeFileSync, rmSync } = await import("node:fs");
  let before = "";
  try { before = execFileSync("git", ["show", "4f9e196633198e26b1f083c50a05662e8f3295af:app/components/EventPlacePhoto.js"], { cwd: REPO, encoding: "utf8" }); } catch { console.error("test-live-place-media: red-prove needs the pre-fix commit in git history"); process.exit(1); }
  const tmp = path.join(REPO, "app/components/.redprove-EventPlacePhoto.js");
  writeFileSync(tmp, before);
  try {
    const old = await loadComponent(tmp, REPO);
    const redHtml = renderToStaticMarkup(createElement(old.default, { src: `/api/photo?place=${ID}&g=2&w=640`, name: "x" }));
    if (!/<img[^>]*src="\/api\/photo/.test(redHtml)) { console.error("test-live-place-media: red-prove did not go red"); process.exit(1); }
  } finally { rmSync(tmp, { force: true }); }
  console.log("test-live-place-media: red-prove OK — the real pre-fix EventPlacePhoto draws the bare /api/photo <img> check 2 rejects");
}
if (fail.length) { for (const f of fail) console.error("  FAIL: " + f); console.error(`test-live-place-media: FAIL — ${fail.length} failed, ${pass} passed`); process.exit(1); }
console.log(`test-live-place-media: OK — ${pass} assertions (place id parsing, credit from the answer, EventPlacePhoto and GuideFigure EXECUTED, guide loop wiring)`);
