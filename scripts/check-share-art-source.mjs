#!/usr/bin/env node
/**
 * check-share-art-source — a surface and its own link preview must show the
 * same photo, and a canonical key must never lose to a substring match.
 *
 * TWO BUGS THIS LOCKS
 *
 * 1. THREE ART MAPS, ONE DESTINATION. lib/intentPages.js, the OG route and
 *    lib/shareCards.js each held their own copy of the art path for the same
 *    page. /hidden-gems moved to a new photo and the other two did not, so the
 *    page and its unfurl rendered different images. The three keys that name an
 *    intent page now DERIVE their art from INTENT_PAGES.
 *
 *    Not every key is a duplicate, which is why this is a reconciliation and
 *    not a merge: "trending" (OG) and nightout/eatnow/outdoors (share) have no
 *    intent page, and SHARE_VISUALS is a different asset class entirely —
 *    purpose-built 1200x630 art with a quiet right side for the text overlay.
 *
 * 2. A CANONICAL KEY LOSING TO A SUBSTRING. visualKey ran fuzzy tests before
 *    checking whether the key was one it actually defines, and /night/ is a
 *    substring of "datenight" — so the DATE-NIGHT share card rendered the
 *    NIGHT-OUT photo. Same shape as the parking->park leak in lib/placeFilter.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const { INTENT_PAGES } = await import(path.resolve("lib/intentPages.js"));
const { SHARE_CARDS, SHARE_VISUALS, shareVisualFor } = await import(path.resolve("lib/shareCards.js"));

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// Share key -> the INTENT_PAGES key naming the same destination.
const OVERLAP = { datenight: "date-night", familyfun: "family", hiddengems: "hidden-gems" };
for (const [shareKey, intentKey] of Object.entries(OVERLAP)) {
  const page = INTENT_PAGES[intentKey];
  ok(!!page, `INTENT_PAGES has "${intentKey}" — the overlap table names a page that must exist`);
  if (!page) continue;
  ok(shareVisualFor(shareKey).art === page.art,
    `share card "${shareKey}" renders ${shareVisualFor(shareKey).art} but /${intentKey} renders ${page.art} — a page and its own link preview must not show different photos`);
}
ok(Object.keys(OVERLAP).length >= 3, "the overlap table is populated (an empty one makes every check above vacuous)");

// A canonical key must resolve to ITSELF, never to a fuzzy neighbour.
const canonical = [...Object.keys(SHARE_CARDS), ...Object.keys(SHARE_VISUALS)];
ok(canonical.length >= 8, `read the canonical share keys (got ${canonical.length})`);
for (const key of canonical) {
  ok(shareVisualFor(key).key === key,
    `"${key}" resolves to "${shareVisualFor(key).key}" — a key we define must beat every fuzzy match, or a substring silently reassigns its art`);
}
// The spaced/hyphenated spellings a caller actually passes must land too.
for (const [spelling, want] of [["date night", "datenight"], ["night out", "nightout"], ["hidden gems", "hiddengems"]]) {
  ok(shareVisualFor(spelling).key === want,
    `"${spelling}" resolves to "${shareVisualFor(spelling).key}", expected "${want}"`);
}

// The OG route must not reintroduce a hardcoded art path for a key that IS an
// intent page. Its own art stays only for share-only surfaces like "trending".
const og = readFileSync(path.resolve("app/api/og/intent/route.js"), "utf8");
ok(/INTENT_PAGES/.test(og), "the OG route reads INTENT_PAGES rather than holding its own copy of the art path");
for (const intentKey of Object.keys(INTENT_PAGES)) {
  // Keys appear quoted OR bare in that map ("date-night" vs family), so match both.
  const rx = new RegExp('[\n{,]\\s*"?' + intentKey + '"?:\\s*\\{[^}]*art:', "");
  ok(!rx.test(og), `the OG route hardcodes art for "${intentKey}", which is an intent page — let it derive, or the two drift again`);
}

if (fail.length) {
  console.error("check-share-art-source: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`check-share-art-source: OK — ${pass} assertions (${Object.keys(OVERLAP).length} overlapping keys derive from INTENT_PAGES, ${canonical.length} canonical keys beat the fuzzy matcher)`);
