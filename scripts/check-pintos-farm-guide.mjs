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

ok(!!guide, "Pinto's guide is registered in GUIDES");
ok(guide.picks.some((p) => p.placeId === "ChIJUczTK5XC2YgRRt4Jp6N3B70"), "guide pins the exact Pinto's Google identity");
ok(/September 19 through November 8/.test(guide.intro) && /2026/.test(guide.title + guide.description), "guide states the verified 2026 fall run");
ok(/Animal encounters close at 6 PM/.test(guide.intro), "guide carries the 6 PM animal cutoff");
for (const activity of ["boat ride","tractor ride","race track","petting zoo","bounce pad","fall photo spots","corn maze","pony rides"]) {
  ok(new RegExp(activity, "i").test(guide.intro + page), "included activity present: " + activity);
}
ok(/MapCategoryPin/.test(map), "farm layout reuses the shared Wayfind pin system");
ok(/CreatorAppleMap/.test(map), "arrival map reuses the live Wayfind Apple map");
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

console.log("check-pintos-farm-guide: OK — " + checks + " factual identity, map, card and ticket assertions");
