#!/usr/bin/env node
// scripts/check-guide-pick-photos-required.mjs
//
// Owner, 2026-11-23: no guide ships without a real photo for every pick, and
// no pick renders "Photo unavailable". A pick with no registered photo stays
// in the record and off the page. A guide whose every pick is waiting leaves
// current listings. The URL stays. Nothing is deleted.
//
// This CALLS the same gate the page and the lifecycle use
// (lib/guidePhotoGate.js) over the real guide registry.
import { readFileSync } from "node:fs";
import { GUIDES } from "../lib/guides.js";
import { currentGuides, isGuidePast, isGuideWithheld } from "../lib/guideLifecycle.js";
import { guideAwaitingPhotos, guideHeroReady, guidePickAwaitingPhoto, registeredGuidePickPhoto } from "../lib/guidePhotoGate.js";
import { guideUsesNeutralFallback } from "../lib/guideNeutralFallback.js";
import { siteTodayStr } from "../lib/siteTime.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const page = readFileSync(new URL("../app/guides/[slug]/page.js", import.meta.url), "utf8");
ok(page.includes("guidePickAwaitingPhoto"), "the guide page consults guidePickAwaitingPhoto");
ok(page.includes("shippingPicks"), "the guide page renders the shipping pick list, not every stored pick");
ok(/shippingPicks\.map\(\(\{ pick, index: i \}/.test(page), "pick sections are built from shippingPicks");
ok(page.includes("GuideReadingNav guide={{ ...g, picks: shippingPicks.map"), "the contents list uses the same shipping picks");

const today = siteTodayStr();
const listed = currentGuides(GUIDES, today);
let withheld = 0;
let hiddenPicks = 0;
for (const [slug, guide] of Object.entries(GUIDES)) {
  const picks = Array.isArray(guide.picks) ? guide.picks : [];
  const hidden = picks.filter((pick) => guidePickAwaitingPhoto(slug, pick, guide));
  hiddenPicks += hidden.length;
  const shipping = picks.filter((pick) => !guidePickAwaitingPhoto(slug, pick, guide));
  if (picks.length && shipping.length === 0) {
    withheld++;
    ok(isGuideWithheld(slug, guide), `${slug}: every pick is waiting, so the guide is withheld`);
    ok(!listed[slug], `${slug}: a photo-less guide is not in current listings`);
    ok(isGuidePast(guide, today) || !listed[slug], `${slug}: withheld or already past, never listed without a photo`);
  }
  if (listed[slug]) {
    ok(guideHeroReady(slug), `${slug}: the hero has a registered photo`);
    for (const pick of shipping) {
      if (guideUsesNeutralFallback(guide)) {
        ok(Boolean(registeredGuidePickPhoto(slug, pick)?.src), `${slug} / ${pick.name}: a listed neutral-fallback pick has a registered photo`);
      }
      ok(!guidePickAwaitingPhoto(slug, pick, guide), `${slug} / ${pick.name}: a listed pick would not render Photo unavailable`);
    }
  }
}

// The November 22 and 23 pulse pages that shipped with Photo unavailable
// stay hidden until a registered photo exists for every pick.
for (const slug of ["sarasota-this-week-nov-23-2026", "tampa-bay-this-week-nov-22-2026", "river-of-lights-tampa-2026"]) {
  ok(guideAwaitingPhotos(slug, GUIDES[slug]), `${slug} stays withheld until its picks have registered photos`);
  ok(!listed[slug], `${slug} is off current listings on ${today}`);
}

// Red control: a neutral guide pick with no photo is waiting, and a guide
// made only of that pick is not current.
{
  const bare = { neutralPickFallback: true, endsOn: "2099-01-01", picks: [{ name: "No photo yet" }] };
  ok(guidePickAwaitingPhoto("red-control", bare.picks[0], bare), "red control: a neutral pick with no photo is waiting");
  ok(isGuideWithheld("red-control", bare), "red control: a guide of only that pick is withheld");
  ok(!currentGuides({ "red-control": bare }, "2026-11-23")["red-control"], "red control: the withheld guide is not current");
  const columbia = GUIDES["restaurants-open-thanksgiving-tampa-bay-2026"].picks.find((p) => p.name === "Columbia Restaurant");
  ok(columbia && registeredGuidePickPhoto("restaurants-open-thanksgiving-tampa-bay-2026", columbia)?.src, "positive control: Columbia's registered photo is found");
  ok(!guidePickAwaitingPhoto("restaurants-open-thanksgiving-tampa-bay-2026", columbia, GUIDES["restaurants-open-thanksgiving-tampa-bay-2026"]), "positive control: Columbia is not waiting");
}

ok(withheld >= 3, `at least the three pulse guides are withheld (got ${withheld})`);
ok(hiddenPicks >= 3, `photo-less picks are detected (got ${hiddenPicks})`);

if (fail.length) {
  console.error(`check-guide-pick-photos-required: FAIL — ${fail.length}`);
  for (const m of fail.slice(0, 20)) console.error("  - " + m);
  process.exit(1);
}
console.log(`check-guide-pick-photos-required: OK — ${pass} assertions. ${withheld} guides withheld and ${hiddenPicks} picks held for photos. Listed guides have a hero and no Photo unavailable pick.`);
