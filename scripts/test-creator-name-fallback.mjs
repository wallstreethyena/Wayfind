// scripts/test-creator-name-fallback.mjs — the creator-video NAME fallback
// may never hand one venue's video (and its Wayfind Score creator bonus) to a
// different venue.
//
// THE DEFECT (2026-10-01 audit, "the Ryan finding"): the curated entry for
// Ryan's Coffee House matches by the root "Ryan" (+ city) when a row lacks
// its place id. The fallback ran on ANY row, including rows whose Google
// place id proves they are a different business, and it matched the root
// mid-word. Measured against the live 8-city inventory: 27 rows wore another
// venue's creator video — other branches of a chain whose entry pins ONE
// store ("the placeId pins this to the downtown Tampa store she filmed"),
// and unrelated businesses sharing a word (Sapphire Couture Boutique wore
// The Sapphire Tampa's reel).
//
// Both resolvers are executed — the full one (lib/creatorVideos.js, the
// sheet) and the lean one (lib/creatorSignals.js, the eager score path) —
// because a fix in only one is the drift check-creator-signal-equivalence
// exists to catch, and the SCORE reads the lean one.
import { creatorVideosFor as fullFor } from "../lib/creatorVideos.js";
import { creatorVideosFor as leanFor } from "../lib/creatorSignals.js";
import { isGooglePlaceId, nameFallbackAllowed, indexOfWord } from "../lib/creatorMatch.js";
import { RYANS_COFFEE_HOUSE } from "./lib/synthetic/fixtures.mjs";

let total = 0;
let failed = 0;
const ok = (cond, msg) => { total++; if (!cond) { failed++; console.error("FAIL: " + msg); } };
const has = (fn, place, loc) => (fn(place, loc) || []).length > 0;
const both = (place, loc) => [has(fullFor, place, loc), has(leanFor, place, loc)];

// The real venue keeps its video — by id, and by name when it arrives unidentified.
{
  const real = { id: RYANS_COFFEE_HOUSE.placeId, name: RYANS_COFFEE_HOUSE.name, city: "Parrish" };
  ok(both(real, "Parrish").every(Boolean), "Ryan's Coffee House (its own Google id) keeps its creator video in both resolvers");
  const fsq = { id: "fsq:5a1b2c3d4e", name: "Ryan's Coffee House", city: "Parrish" };
  ok(both(fsq, "Parrish").every(Boolean), "an unidentified (fsq:) row of the same venue still matches by name — the fallback is kept for what it is for");
}
// A DIFFERENT Google place id is a different business, whatever its name.
{
  const other = { id: "ChIJzzzzzzzzzzzzzzzzzzzzzzz", name: "Ryan's Music House", city: "Parrish" };
  ok(both(other, "Parrish").every((x) => !x), "Ryan's Music House (another Google id) does not wear Ryan's Coffee House's video");
  const branch = { id: "ChIJBYK1VGTDwogRLE0BeMmq1Lk", name: "SoFresh - Healthy Salads, Wraps & Bowls", city: "Tampa" };
  ok(both(branch, "Tampa").every((x) => !x), "another SoFresh branch does not wear the video filmed at the pinned downtown Tampa store");
  const word = { id: "ChIJk1iSsDzFwogR4f2XYZxcJzk", name: "Sapphire Couture Boutique.", city: "Tampa" };
  ok(both(word, "Tampa").every((x) => !x), "Sapphire Couture Boutique does not wear The Sapphire Tampa's reel");
}
// Word boundaries: a root inside another word is not a match.
{
  const bryant = { id: "fsq:bryant-grill", name: "Bryant Grill", city: "Parrish" };
  ok(both(bryant, "Parrish").every((x) => !x), "'Bryant Grill' does not match the root 'Ryan' mid-word");
}
// The rule itself, as a unit.
ok(isGooglePlaceId("ChIJo_IdHf0lw4gRHDbQNKBRE84") && !isGooglePlaceId("fsq:123") && !isGooglePlaceId("osm:node/1"), "Google ids are recognised; provider-prefixed ids are not");
ok(nameFallbackAllowed(null, "ChIJabcdefghijklmnop") === true, "an entry with no pinned id may still match by name");
ok(nameFallbackAllowed("ChIJo_IdHf0lw4gRHDbQNKBRE84", "ChIJzzzzzzzzzzzzzzzzzz") === false, "a pinned entry never name-matches a different Google id");
ok(nameFallbackAllowed("ChIJo_IdHf0lw4gRHDbQNKBRE84", "fsq:1") === true, "a pinned entry may name-match an unidentified row");
ok(indexOfWord("bryant grill", "ryan") === -1 && indexOfWord("ryan s coffee house", "ryan") === 0 && indexOfWord("the ryan s", "ryan") === 4, "indexOfWord matches whole words only");

console.log(`test-creator-name-fallback: ${total - failed}/${total} passed — the name fallback never crosses a Google place id or a word boundary, in the full AND lean resolvers`);
if (failed) process.exit(1);
