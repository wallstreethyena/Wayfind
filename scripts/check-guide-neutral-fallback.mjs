#!/usr/bin/env node
/**
 * check-guide-neutral-fallback — the two rainy day guides never show a
 * photograph of some other place for a pick.
 *
 * Owner, 2026-11-04: "A disclaimer does not make an unrelated photograph a good
 * venue image. Where an approved exact venue photo cannot be found, use
 * Wayfind's established neutral fallback."
 *
 * For every pick of tampa-bay-rainy-day and sarasota-rainy-day (24 picks) this
 * CALLS the same resolver the page calls (lib/guideNeutralFallback.js, over the
 * real photo manifest) and RENDERS the real components, then asserts:
 *   1. a pick with an exact approved photo gets that photo (a local /guides/
 *      file, a licence, a credit, no `contextual`/`illustrative` flag);
 *   2. every other pick gets the neutral tile, never a context photo;
 *   3. the rendered markup of an exact-photo pick has no "Illustrative" text;
 *   4. the rendered neutral tile has no <img>, no credit and no "Illustrative";
 *   5. each pick is exactly one of: photographed, or a recorded gap;
 *   6. the page is wired through the resolver and renders the neutral figure.
 * Controls: a guide without the flag still gets a labelled context photo, and
 * the "Illustrative" detector fires on that photo's rendered markup.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GUIDES } from "../lib/guides.js";
import { guidePickPhoto, guidePhotoForPlace } from "../lib/guidePickPhotos.js";
import { guideFinalRung, guideUsesNeutralFallback } from "../lib/guideNeutralFallback.js";
import { loadComponent } from "./lib/jsxLoad.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAINY = ["tampa-bay-rainy-day", "sarasota-rainy-day"];
// 2026-11-05: every guide that opts in is covered, the eight holiday guides included.
const HOLIDAY = Object.keys(GUIDES).filter((s) => GUIDES[s].cluster === "holidays-florida-2026");
const SLUGS = Object.keys(GUIDES).filter((s) => guideUsesNeutralFallback(GUIDES[s]));
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const text = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const { default: GuideFigure } = await loadComponent(path.join(REPO, "app/components/GuideFigure.js"), REPO);
const { default: GuideNeutralFigure } = await loadComponent(path.join(REPO, "app/components/GuideNeutralFigure.js"), REPO);

ok(RAINY.every((s) => SLUGS.includes(s)) && HOLIDAY.length === 8 && HOLIDAY.every((s) => SLUGS.includes(s)), "the two rainy day guides and all eight holiday guides use the neutral fallback");
let exact = 0, neutral = 0, holidayExact = 0, total = 0;
for (const slug of SLUGS) {
  const guide = GUIDES[slug];
  if (RAINY.includes(slug)) ok(guide && guide.picks.length === 12, `${slug}: twelve picks`);
  total += guide.picks.length;
  ok(guideUsesNeutralFallback(guide), `${slug}: opted into the neutral fallback`);
  const gaps = JSON.parse(readFileSync(path.join(REPO, "data/guide-pick-photos", slug + ".json"), "utf8")).gaps || {};
  for (const pick of guide.picks) {
    const own = guidePickPhoto(slug, pick.name) || guidePhotoForPlace(pick.placeId);
    // 5. photographed XOR recorded gap
    ok(Boolean(own) !== Boolean(gaps[pick.name]), `${slug} / ${pick.name}: exactly one of photographed or recorded gap`);
    if (own) {
      exact++;
      if (HOLIDAY.includes(slug)) holidayExact++;
      ok(typeof own.src === "string" && own.src.startsWith("/guides/picks/") && own.license && own.credit && own.sourceUrl, `${slug} / ${pick.name}: exact photo is local, licensed and credited`);
      ok(!own.contextual && own.kind !== "illustrative" && !/illustrative/i.test(own.caption || "") && !/not a photograph of/i.test(own.alt || ""), `${slug} / ${pick.name}: exact photo is not a context record`);
      const html = renderToStaticMarkup(React.createElement(GuideFigure, { role: "pick", image: own }));
      ok(html.includes(`src="${own.src}"`), `${slug} / ${pick.name}: exact photo renders its own file`);
      ok(!/illustrative/i.test(text(html)), `${slug} / ${pick.name}: no "Illustrative" text in the rendered figure`);
    } else {
      neutral++;
      const rung = guideFinalRung(slug, pick, guide, { usedSrc: new Set() });
      ok(rung.kind === "neutral" && rung.media.neutral === true && rung.media.src === null, `${slug} / ${pick.name}: gap pick resolves to the neutral fallback, not a context photo`);
      ok(!rung.media.contextual && !rung.media.caption && !rung.media.credit, `${slug} / ${pick.name}: neutral record carries no photo, caption or credit`);
      const html = renderToStaticMarkup(React.createElement(GuideNeutralFigure, { name: pick.name }));
      ok(!/<img\b/i.test(html) && !/illustrative/i.test(text(html)) && !/Photo:/.test(text(html)), `${slug} / ${pick.name}: neutral tile has no image, credit or "Illustrative"`);
      ok(html.includes('data-photo-fallback="unavailable"') && text(html).includes("Photo unavailable") && html.includes(`Photo not available for ${pick.name.replace(/&/g, "&amp;").replace(/'/g, "&#x27;")}`), `${slug} / ${pick.name}: neutral tile is the shared Wayfind fallback tile, labelled for this place`);
    }
  }
}
ok(exact + neutral === total && total >= 24 + 74, `all ${total} picks classified`);
// Owner, 2026-11-09 image intent pass: daytime venue photos that showed no
// holiday event were removed from the holiday guides (a slot is left empty
// rather than given a photo that does not match the pick), so the floor is 27.
ok(holidayExact >= 27, `the holiday guides keep their 27 exact, in season photos (found ${holidayExact})`);
ok(exact >= 9, "the nine photographed picks from the earlier pass are still photographed");

// Controls: a guide that did not opt into the neutral tile still gets a
// labelled context photo when a reviewed photo matches the pick. The image
// intent rule (2026-11-04) returns null for a subject with no reviewed photo,
// so this control uses a dining pick with a reviewed food photograph. The
// detector is proven able to see "Illustrative" in that figure's markup.
{
  const slug = "best-cuban-sandwich-tampa";
  const guide = { ...GUIDES[slug], neutralPickFallback: false };
  ok(guideUsesNeutralFallback(guide) === false, "control guide is not on the neutral fallback");
  const gapPick = guide.picks.find((p) => p.name === "West Tampa Sandwich Shop");
  ok(gapPick && !guidePickPhoto(slug, gapPick.name) && !guidePhotoForPlace(gapPick.placeId), "control pick has no exact photo of its own");
  const rung = guideFinalRung(slug, gapPick, guide, { usedSrc: new Set() });
  ok(rung.kind === "context" && rung.media.contextual === true && /^Illustrative /.test(rung.media.caption), "control: a guide without the flag keeps its labelled context photo");
  const html = renderToStaticMarkup(React.createElement(GuideFigure, { role: "pick", image: rung.media }));
  ok(/illustrative/i.test(text(html)), "control: the Illustrative detector fires on a rendered context figure");
}

// 6. The page itself goes through the resolver and renders the neutral figure.
{
  const src = readFileSync(path.join(REPO, "app/guides/[slug]/page.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, "");
  ok((src.match(/guideFinalRung\(params\.slug,\s*pick,/g) || []).length === 1, "page.js: the pick final rung is chosen by guideFinalRung (exactly once)");
  ok(/neutralPickFigures\[i\]\s*\?\s*<GuideNeutralFigure\b/.test(src), "page.js: the neutral figure renders for a neutral pick");
  ok(/!fallbackPickImages\[i\]\s*&&\s*!neutralGuide/.test(src), "page.js: a neutral guide never gets a context photo as a load-failure backup");
  ok(/neutralGuide \? \[\] : g\.picks/.test(src), "page.js: a neutral guide never looks up a held place photo for a gap pick");
}
console.log(`check-guide-neutral-fallback: OK (${checks} assertions; ${exact} exact photos, ${neutral} neutral fallbacks across ${SLUGS.length} guides)`);
