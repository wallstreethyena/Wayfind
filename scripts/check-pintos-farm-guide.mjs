#!/usr/bin/env node
import { readFileSync, statSync } from "node:fs";
import assert from "node:assert/strict";
import { GUIDES } from "../lib/guides.js";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const slug = "pintos-farm-miami-2026";
const guide = GUIDES[slug];
const page = read("app/guides/pintos-farm-miami-2026/page.js");
const map = read("app/guides/pintos-farm-miami-2026/PintosFarmMap.js");
const css = read("app/guides/pintos-farm-miami-2026/page.module.css");

ok(!!guide, "Pinto's guide is registered in GUIDES");
ok(guide.picks.some((p) => p.placeId === "ChIJUczTK5XC2YgRRt4Jp6N3B70"), "guide pins the exact Pinto's Google identity");
ok(/September 19 through November 8/.test(guide.intro) && /2026/.test(guide.title + guide.description), "guide states the verified 2026 fall run");
ok(/Animal encounters close at 6 PM/.test(guide.intro), "guide carries the 6 PM animal cutoff");
for (const activity of ["boat ride","tractor ride","race track","petting zoo","bounce pad","fall photo spots","corn maze","pony rides"]) {
  ok(new RegExp(activity, "i").test(guide.intro + page), "included activity present: " + activity);
}
ok(/MapCategoryPin/.test(map), "farm layout reuses the shared Wayfind pin system");
// Owner decision 2026-09-22: ONE map on the page, an illustrated farm map with
// tappable zone pins. The separate Apple arrival map is gone, and the old
// coordinate pair (about a mile off, on a different property) must never come
// back through the directions button or a pin.
ok(!/CreatorAppleMap/.test(map), "one map only: the illustrated farm map, no second Apple arrival map");
for (const src of ["/guides/pintos-farm-miami-2026/farm-map-illustrated-1200.webp", "/guides/pintos-farm-miami-2026/farm-map-illustrated-2000.webp"]) {
  let bytes = 0;
  try { bytes = statSync(new URL("../public" + src, import.meta.url)).size; } catch { bytes = 0; }
  ok(map.includes(src) && bytes > 10 * 1024, `${src}: illustrated farm map is referenced and exists on disk (got ${bytes} bytes)`);
}
ok(!/25\.559785|80\.41664/.test(map + page), "the wrong farm coordinate (a different property about a mile away) never returns");
ok(/https:\/\/maps\.apple\.com\/\?daddr=14890%20SW%20216th%20St%2C%20Miami%2C%20FL%2033170/.test(map), "driving directions use Pinto's verified street address");
const zonePoints = [...map.matchAll(/\bx:\s*([\d.]+),\s*y:\s*([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
ok(zonePoints.length >= 10 && zonePoints.every(([x, y]) => x >= 3 && x <= 97 && y >= 3 && y <= 97), `every zone pin sits inside the illustrated map (got ${zonePoints.length} pins)`);
const liftedRule = /\.zonePin\[data-active="true"\] \.zonePinMark\{([^}]*)\}/.exec(css)?.[1] ?? "";
ok(/aria-pressed=\{active\}/.test(map) && /scale\(1\.[2-9]/.test(liftedRule), "the picked pin visibly lifts on the map and its state is exposed to assistive tech");
ok(/scroller\.scrollTo\(/.test(map) && !/scrollIntoView/.test(map), "choosing a spot moves only the map window, never the whole page");
const visibleMapCopy = map.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
ok(!/Wayfind/.test(visibleMapCopy), "guides sell the experience: the farm map copy never mentions Wayfind");
ok(/Not to scale/.test(page + map) && /Seasonal zones can move/.test(map), "layout is explicitly orientation-only");
ok(/exact on-property positions are not published clearly enough/.test(map), "unverified seasonal positions are not invented");
ok(!/lat:\s*25\.559\d+[\s\S]{0,120}Corn maze/i.test(map), "corn maze is not assigned a fake GPS point");
ok(!/GuidePlaceCard/.test(page), "owner decision 2026-09-22: the credited photo gallery replaces the place card, so the page no longer imports GuidePlaceCard");
ok(/Official tickets/.test(page) && /pintosfarm\.ticketspice\.com\/pintos-farm-2026/.test(page), "ticket CTA points to Pinto's exact official 2026 checkout");

// Photo gallery + hero: every referenced file is real, non-empty, and credited.
const galleryPaths = [...page.matchAll(/src:\s*"(\/guides\/pintos-farm-miami-2026\/[^"]+\.webp)"/g)].map((m) => m[1]);
ok(galleryPaths.length >= 8, `gallery declares at least 8 photos (got ${galleryPaths.length})`);
for (const src of galleryPaths) {
  const file = new URL("../public" + src, import.meta.url);
  let size = 0;
  try { size = statSync(file).size; } catch { size = 0; }
  ok(size > 10 * 1024, `${src}: gallery image exists on disk and is over 10 KB (got ${size} bytes)`);
}
const heroSrc = (/heroPhoto\s*=\s*guideHero\(SLUG\)/.test(page) && /"pintos-farm-miami-2026":\s*Object\.freeze\(\{"src":"([^"]+)"/.exec(read("lib/guideHero.js")))?.[1];
ok(!!heroSrc, "hero image path is resolved from the reviewed lib/guideHero.js record");
if (heroSrc) {
  const heroFile = new URL("../public" + heroSrc, import.meta.url);
  let heroSize = 0;
  try { heroSize = statSync(heroFile).size; } catch { heroSize = 0; }
  ok(heroSize > 10 * 1024, `${heroSrc}: hero image exists on disk and is over 10 KB (got ${heroSize} bytes)`);
}
ok(/import\s+\{\s*guideHero\s*\}\s+from\s+"\.\.\/\.\.\/\.\.\/lib\/guideHero"/.test(page), "page resolves its hero photo through the reviewed lib/guideHero.js record");
ok(/<GuidePhoto\b/.test(page), "gallery renders through the shared GuidePhoto component, same as other guide images");
const altValues = [...page.matchAll(/alt:\s*"([^"]*)"/g)].map((m) => m[1]);
ok(altValues.length >= 8 && altValues.every((a) => a.trim().length > 0), "every gallery photo has a non-empty alt description");
ok(/Photos courtesy of/.test(page), "the gallery carries a visible Pinto's Farm photo credit");
ok(/href=\{PINTOS_FARM_SITE\}/.test(page) && /const PINTOS_FARM_SITE = "https:\/\/pintofarm\.com"/.test(page), "the photo credit links to https://pintofarm.com");
ok(/Sep 19, 20, 26 \+ 27/.test(page) && /Oct 18 \+ 25/.test(page) && /12 PM \+ 2 PM \+ 4 PM \+ 6 PM/.test(page), "published 2026 magic-show calendar is present");
ok(/Winterland \/ Christmas at the Farm/.test(page) && /Spring at the Farm \/ Easter/.test(page), "year-round seasonal planning is present");
ok(/Lattes & Llamas/.test(page) && /Brewhouse \+ llama evenings/.test(page), "limited-date llama and Brewhouse planning is present");

// Visual regression guard, 2026-09-22 (owner: gallery photos "so big", wants them
// "in a square"; "weird lines on the map"). Lock the fix so neither regresses silently.
const galleryImgRule = /\.galleryImg\{([^}]*)\}/.exec(css)?.[1] ?? "";
ok(/aspect-ratio:\s*1\/1/.test(galleryImgRule), "gallery tiles are square (aspect-ratio:1/1), not the old tall 4/5 strip");
ok(/height:\s*auto/.test(galleryImgRule), "gallery images set height:auto so the square aspect-ratio actually governs the box (the root cause: the img width/height attributes otherwise pin a fixed pixel height per photo, defeating aspect-ratio)");
const fieldBandRule = /\.fieldBand\{([^}]*)\}/.exec(css)?.[1] ?? "";
ok(/repeating-linear-gradient/.test("background:repeating-linear-gradient(105deg,transparent 0 42px,rgba(255,255,255,.025) 43px 45px)"), "positive control: the repeating-linear-gradient probe matches the old striped pattern verbatim, so the absence check right below is not vacuous");
// The drawn .fieldBand diagram was replaced by the illustrated map on
// 2026-09-22; carry the "no hairline striping" protection over to the new map.
ok(fieldBandRule === "", "the retired .fieldBand diagram rule is gone with the drawn diagram");
const mapFrameRules = ["farmMapFrame", "farmMapScroller", "farmMapCanvas", "farmMapImg"].map((cls) => new RegExp("\\." + cls + "\\{([^}]*)\\}").exec(css)?.[1] ?? "");
ok(mapFrameRules.every((rule) => rule.length > 0), "the illustrated map frame, scroller, canvas and image all keep a styled treatment");
ok(mapFrameRules.every((rule) => !/repeating-linear-gradient/.test(rule)), "farm map has no repeating-linear-gradient hairline striping");

console.log("check-pintos-farm-guide: OK — " + checks + " factual identity, map, card and ticket assertions");
