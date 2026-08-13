// scripts/test-promote-decision.mjs
//
// Locks decidePromotion() — the one verdict shared by scripts/promote-index.mjs
// and /api/cron/promote-index. Every fixture is shaped exactly like a Google
// Places (New) Details resource fetched under this project's DETAILS_MASK.
//
// WHY THIS TEST AND NOT AN INTEGRATION RUN. The cron spends money per place. The
// expensive half (the fetch) is trivial and the cheap half (the verdict) is where
// a bad card comes from, so the verdict is what gets pinned. The three outcomes
// that matter commercially:
//
//   PROMOTE  a real, operational, classifiable place becomes a card.
//   REJECT   a permanently-closed listing NEVER becomes a card. A user driving to
//            a closed restaurant is the single worst thing this app can do, and it
//            is exactly what an unguarded SQL copy of wf_place_ids would produce —
//            that table holds no businessStatus at all.
//   REJECT   a place whose coordinates fall outside the run's metro is refused
//            even though it is otherwise perfect. That is the guard against a
//            moved/re-pointed place id quietly landing in the wrong market.
import assert from "node:assert";
import { decidePromotion, PROMOTE_METROS } from "../lib/promoteIndex.js";

const NOW = "2026-08-13T12:00:00.000Z";
let n = 0;
const t = (name, fn) => { fn(); n++; console.log("  ok  " + name); };

// Siesta Beach — the real, highest-review-count unpromoted place in the home
// market on the day the queue shipped (27,775 reviews, and not a Wayfind card).
const siesta = {
  id: "ChIJh8tXh-FBw4gR9kFzfZN_g60",
  displayName: { text: "Siesta Beach" },
  location: { latitude: 27.2652015, longitude: -82.5517805 },
  types: ["beach", "tourist_attraction", "point_of_interest", "establishment"],
  primaryType: "beach",
  rating: 4.7,
  userRatingCount: 27775,
  businessStatus: "OPERATIONAL",
};

t("an operational, classifiable place promotes", () => {
  const v = decidePromotion(siesta, "manatee-sarasota", NOW);
  assert.equal(v.action, "promote", v.error);
  assert.equal(v.row.place_id, siesta.id);
  assert.equal(v.row.metro, "manatee-sarasota");
  assert.ok(["beach", "attractions"].includes(v.row.category), "unexpected category: " + v.row.category);
  assert.equal(v.row.signals.reviews, 27775);
  assert.equal(v.row.refreshed_at, NOW);
});

t("a CLOSED_PERMANENTLY listing is rejected, never written", () => {
  const v = decidePromotion({ ...siesta, businessStatus: "CLOSED_PERMANENTLY" }, "manatee-sarasota", NOW);
  assert.equal(v.action, "reject");
  assert.match(v.error, /non-operational/i);
});

t("a place outside the run's metro is rejected even when otherwise valid", () => {
  // Same place, claimed under Orlando. Coordinates say Sarasota.
  const v = decidePromotion(siesta, "orlando", NOW);
  assert.equal(v.action, "reject");
  assert.match(v.error, /out of orlando bounds|metro/i);
});

t("a place with no category signal is rejected, not guessed", () => {
  const v = decidePromotion({
    id: "ChIJtest0000000000000000000",
    displayName: { text: "Zzqx Holdings" },
    location: { latitude: 27.3, longitude: -82.5 },
    types: ["point_of_interest", "establishment"],
    primaryType: "point_of_interest",
    businessStatus: "OPERATIONAL",
  }, "manatee-sarasota", NOW);
  assert.equal(v.action, "reject");
  assert.match(v.error, /unclassified/i);
});

t("a resource with no id yields a reject, never a half-built row", () => {
  const v = decidePromotion({ displayName: { text: "No Id Place" }, location: { latitude: 27.3, longitude: -82.5 } }, "manatee-sarasota", NOW);
  assert.equal(v.action, "reject");
});

t("every promoted row carries only known write columns", () => {
  const v = decidePromotion(siesta, "manatee-sarasota", NOW);
  assert.equal(v.action, "promote");
  // validateInventoryRow already rejects unknown columns; assert the row is
  // non-empty so a future refactor cannot make this vacuous.
  assert.ok(Object.keys(v.row).length >= 15, "write row looks truncated: " + Object.keys(v.row).length);
});

t("self-test: the fixture set can actually fail", () => {
  const v = decidePromotion({ ...siesta, businessStatus: "CLOSED_TEMPORARILY" }, "manatee-sarasota", NOW);
  assert.equal(v.action, "reject", "a temporarily-closed place must not promote either");
});

// Mote Marine Laboratory — a 4.7 / 9,846-review paid Sarasota attraction — was
// the ONE rejection in the first live dry run over 40 real queued places.
// Google types it ["research_institute","point_of_interest","establishment"],
// which carries no discovery identity, and the name has no "aquarium" token.
//
// That rejection is CORRECT and deliberate: scripts/test-taxonomy.mjs pins
// `classifyPlace(["research_institute",...], null, "Mote Marine Laboratory")`
// to null with the note "a marquee place like this MUST be an anchor." A name
// regex broad enough to catch it (marine lab / science center / nature center)
// is a guess applied to every future place; an anchor is one owner assertion
// about one place. The queue makes the miss VISIBLE — it sits in
// wf_promotion_queue as rejected with its reason — which is the point.
//
// This test exists so the next person to see Mote rejected finds the answer
// (add an anchor) instead of widening the classifier.
t("a marquee place with no type or name signal is rejected, not guessed into a category", () => {
  const v = decidePromotion({
    id: "ChIJ765WHrxqw4gRtfYzutQE_b8",
    displayName: { text: "Mote Marine Laboratory" },
    location: { latitude: 27.3150, longitude: -82.5770 },
    types: ["research_institute", "point_of_interest", "establishment"],
    primaryType: "research_institute",
    rating: 4.7, userRatingCount: 9846, businessStatus: "OPERATIONAL",
  }, "manatee-sarasota", NOW);
  assert.equal(v.action, "reject");
  assert.match(v.error, /unclassified/i);
  // The fix is an anchor (scripts/seed-anchors.mjs), NOT a wider name regex.
});

t("the metro used by the test is a real promotion metro", () => {
  assert.ok(PROMOTE_METROS["manatee-sarasota"], "manatee-sarasota missing from PROMOTE_METROS");
  assert.ok(PROMOTE_METROS.orlando, "orlando missing from PROMOTE_METROS");
});

console.log(`test-promote-decision: ${n} assertions OK`);
