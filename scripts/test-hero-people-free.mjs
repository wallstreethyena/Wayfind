// scripts/test-hero-people-free.mjs — the homepage hero photos must obey the
// same "no human faces" rule as cards (owner: Greenville's family hero showed
// two kids). The hero effects (originally family / date-night / hidden gems)
// used to blindly take the top place's FIRST photo (pp.photos[0]); date-night
// and hidden-gems now share heroRefFromPlaces, which ranks by the quality floor
// then vision-picks the best people-free shot, falling back to the top
// candidate so a hero always renders.
//
// NOTE (evidence-backed, do not re-add): the family hero was later, deliberately
// retired from this live-fetch path — 3aafc14 ("Refresh discovery rail and popup
// visuals", 2026-07-24, AFTER this test's origin commit 69b5f24) moved it to
// permanent OWNED artwork and added its own lock in test-intent-pages
// (`!home.includes("setFamilyHeroImg")` + the owned-artwork asset-count check).
// That is the authoritative, later product decision, so the people-free
// live-fetch guarantee below applies to the date-night and hidden-gem heroes
// only — never re-add a family assertion here.
import { readFileSync } from "fs";
import { pickPeopleFreeRef, heroRefFromPlaces } from "../lib/bestPhoto.js";

let pass = 0;
const fail = (m) => { console.error("test-hero-people-free: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

ok(typeof pickPeopleFreeRef === "function", "pickPeopleFreeRef is exported");
ok(typeof heroRefFromPlaces === "function", "heroRefFromPlaces is exported");

// pickPeopleFreeRef: empty → null; fail-soft (no scorer in node) → first ref.
ok((await pickPeopleFreeRef([])) === null, "no candidates → null");
ok((await pickPeopleFreeRef(null)) === null, "non-array → null");
ok((await pickPeopleFreeRef(["places/AAA/photos/BBB", "places/CCC/photos/DDD"])) === "places/AAA/photos/BBB",
  "fail-soft returns the first (highest-priority) candidate");
ok((await pickPeopleFreeRef(["places/AAA/photos/BBB", "places/AAA/photos/BBB"])) === "places/AAA/photos/BBB",
  "duplicate refs collapse safely");

// heroRefFromPlaces: applies the floor, then returns a people-free ref.
ok((await heroRefFromPlaces([], { minRating: 4.5, minReviews: 500 })) === null, "no places → null");
ok((await heroRefFromPlaces([{ photos: [{ name: "places/AAA/photos/BBB" }], rating: 4.9, reviews: 1000 }], { minRating: 4.5, minReviews: 500 })) === "places/AAA/photos/BBB",
  "a qualifying place yields its photo ref");
ok((await heroRefFromPlaces([{ photos: [{ name: "places/AAA/photos/BBB" }], rating: 4.0, reviews: 1000 }], { minRating: 4.5, minReviews: 500 })) === null,
  "a place under the rating floor is excluded (→ null → art fallback)");
ok((await heroRefFromPlaces([{ photos: [{ name: "places/AAA/photos/BBB" }], rating: 4.9, reviews: 5000 }], { minRating: 4.6, minReviews: 60, maxReviews: 3000 })) === null,
  "the gem review CEILING excludes over-famous places");

// v8 (2026-08-15) — home.js wiring. The date-night and hidden-gem hero photo
// effects are GONE with the promo deck they fed, and so is the class of bug
// this file guards: the homepage no longer live-picks a hero photo AT ALL.
//
//   the rail's 15 tiles  -> owned artwork in /public/cards-v8
//   the place cards      -> each place's own photoRef, through IconicPlaceCard
//
// Owned art is the same answer the family hero already reached in 3aafc14 (see
// the note at the top), applied to the whole surface. The helper stays exported
// and its unit assertions above are UNTOUCHED — heroRefFromPlaces is the right
// tool the moment any surface live-picks a hero again, and deleting its tests
// with its last caller is how the next one re-introduces photos[0].
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(!/heroRefFromPlaces\(/.test(home), "a live hero-photo pick is back on the homepage — see this file's header before adding one");
ok(!/setDateHeroImg|setGemHeroImg/.test(home), "the date-night / hidden-gem hero photo state is back");
ok(!/ref: pp\.photos && pp\.photos\[0\] && pp\.photos\[0\]\.name/.test(home), "the old blind photos[0] hero pick is gone from every surface");
ok(/import \{ useBestPhoto \}/.test(home), "home.js still imports the per-card photo helper it does use");

console.log(`test-hero-people-free: OK — ${pass} assertions (the helper is people-free and fail-soft; the homepage no longer live-picks a hero photo at all)`);
