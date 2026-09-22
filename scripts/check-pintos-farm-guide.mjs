#!/usr/bin/env node
import { readFileSync } from "node:fs";
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
ok(/September 19 through November 8, 2026/.test(guide.intro), "guide states the verified 2026 fall run");
ok(/Animal encounters close at 6 PM/.test(guide.intro), "guide carries the 6 PM animal cutoff");
for (const activity of ["boat ride","tractor ride","race track","petting zoo","bounce pad","fall photo spots","corn maze","pony rides"]) {
  ok(new RegExp(activity, "i").test(guide.intro + page), "included activity present: " + activity);
}
ok(/MapCategoryPin/.test(map), "farm layout reuses the shared Wayfind pin system");
ok(/CreatorAppleMap/.test(map), "arrival map reuses the live Wayfind Apple map");
ok(/Not to scale/.test(page + map) && /Seasonal zones can move/.test(map), "layout is explicitly orientation-only");
ok(/exact on-property positions are not published clearly enough/.test(map), "unverified seasonal positions are not invented");
ok(!/lat:\s*25\.559\d+[\s\S]{0,120}Corn maze/i.test(map), "corn maze is not assigned a fake GPS point");
ok(/GuidePlaceCard/.test(page), "page uses the shared guide place-card wrapper");
ok(/WF_PLACE_CARD_CSS/.test(page), "page uses the canonical place-card CSS contract");
ok(/Official tickets/.test(page) && /pintosfarm\.ticketspice\.com\/pintos-farm-2026/.test(page), "ticket CTA points to Pinto's exact official 2026 checkout");
ok(/Sep 19, 20, 26 \+ 27/.test(page) && /Oct 18 \+ 25/.test(page) && /12 PM \+ 2 PM \+ 4 PM \+ 6 PM/.test(page), "published 2026 magic-show calendar is present");
ok(/Winterland \/ Christmas at the Farm/.test(page) && /Spring at the Farm \/ Easter/.test(page), "year-round seasonal planning is present");
ok(/Lattes & Llamas/.test(page) && /Brewhouse \+ llama evenings/.test(page), "limited-date llama and Brewhouse planning is present");

console.log("check-pintos-farm-guide: OK — " + checks + " factual identity, map, card and ticket assertions");
