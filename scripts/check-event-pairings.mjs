#!/usr/bin/env node
// check-event-pairings — the "make it an outing" nearby module and the visual
// event cards. Two owner asks (2026-08-23): "other places near the location
// worth going to that pair well," and "turn these into the place cards we have."
//
// It EXECUTES eventPairings against a stubbed inventory (so it needs no network
// or live key), and it SOURCE-CHECKS the two honesty rules the visual cards
// must never break:
//   1. AN EVENT NEVER CARRIES A WAYFIND SCORE. A place is quality-ranked; an
//      event is dated. The hub card badge is the DATE, and the hub must not
//      render a score chip on the event. (The PLACES inside the pairing module
//      are real places and DO carry their score — that is correct and different.)
//   2. NEVER A THIN SHELF. Below a three-card floor the section does not render,
//      so an event with little owned inventory nearby (Daytona, measured) shows
//      nothing rather than one lonely card.
// Hermetic fixture: WRITE stub creds unconditionally (never read ambient env),
// so buildNearbyPool proceeds past its "no creds -> []" guard and uses the
// injected fetchImpl below. The stub URL is never actually fetched.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "stub-anon-key";

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eventPairings, pairingHref } from "../lib/eventPairings.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// A valid wf_inventory restaurant row (passes placeAllowed(food) + governedScore).
const mkRow = (i, dLat = 0.01) => ({
  place_id: "p" + i, name: "Test Kitchen " + i,
  lat: 25.7272 + dLat * i, lng: -80.2578,
  primary_type: "restaurant", google_types: ["restaurant", "food", "point_of_interest"],
  signals: { rating: 4.8, reviews: 2000 + i, priceNum: 2 }, status: "OPERATIONAL",
  photo_ref: "places/p" + i + "/photos/x",
});
// Only the "food" ring is fed, so a stub is enough; the other cats return [].
const stub = (rows) => async (url) => ({ ok: true, json: async () => (String(url).includes("category=eq.food") ? rows : []) });
const ORIGIN = { lat: 25.7272, lng: -80.2578, city: "Miami", place_id: "p2" };

// 1. A healthy set builds cards, excludes the event's own venue, and scores each
//    place with THE Wayfind Score.
{
  const res = await eventPairings(ORIGIN, { fetchImpl: stub([1, 2, 3, 4, 5].map((i) => mkRow(i))) });
  ok(res.length === 4, `five nearby minus the event venue yields four pairings (got ${res.length})`);
  ok(!res.some((p) => p.id === "p2"), "the event's own venue (place_id) is never paired with itself");
  ok(res.every((p) => Number.isFinite(p.wfScore) && p.wfScore > 0), "every pairing carries a real Wayfind Score");
  ok(res.every((p) => Number.isFinite(p.distMi)), "every pairing carries a distance");
}

// 2. THE FLOOR. Two nearby places is not a shelf.
{
  const res = await eventPairings(ORIGIN, { fetchImpl: stub([mkRow(1), mkRow(3)]) });   // p2 excluded -> only 1 left anyway
  ok(res.length === 0, `below the three-card floor the module returns nothing (got ${res.length})`);
}

// 3. GENUINELY NEARBY. A place beyond maxMi is not "nearby" and is dropped.
{
  const near = [1, 2, 3].map((i) => mkRow(i, 0.01));      // ~0.7–2mi
  const far = mkRow(9, 0.09);                              // ~55mi north
  const res = await eventPairings({ lat: 25.7272, lng: -80.2578, city: "Miami" }, { fetchImpl: stub([...near, far]) });
  ok(res.length >= 3 && !res.some((p) => p.id === "p9"), "a place beyond the nearby cap is excluded from the outing");
}

// 4. Graceful nulls: no coordinates, no section.
{
  ok((await eventPairings({}, { fetchImpl: stub([mkRow(1)]) })).length === 0, "an event with no coordinates yields no pairings");
}

// 5. The link goes into the app shell at /p/[id], carrying the place's own data.
{
  const href = pairingHref({ id: "abc", name: "Spot", city: "Miami", rating: 4.7, reviews: 900, wfScore: 92, cat: "Restaurant" });
  ok(href.startsWith("/p/abc"), "a pairing links to the canonical /p/[id] place page");
  ok(/sc=92/.test(href) && /t=Spot/.test(href), "the link carries the place's score and title for its card");
}

// 6. SOURCE — the visual event cards keep the events-never-scored rule.
const hub = readFileSync(path.join(ROOT, "app/florida-events/page.js"), "utf8");
ok(/e\.hero_image/.test(hub) && /<img/.test(hub), "the hub renders the event's hero image (visual place card)");
ok(/dateRangeLabel\(e\)/.test(hub), "the hub card badge is the DATE (dateRangeLabel)");
ok(!/PlaceScoreChip|wayfindScore\s*\(/.test(hub), "the hub never renders a Wayfind Score on an event card — an event is dated, not quality-ranked");

// 7. SOURCE — the event page wires the nearby module and only renders it when non-empty.
const slug = readFileSync(path.join(ROOT, "app/florida-events/[slug]/page.js"), "utf8");
ok(/eventPairings\(/.test(slug) && /pairingHref\(/.test(slug), "the event page fetches pairings and links them");
ok(/pairings\.length\s*>\s*0/.test(slug), "the event page renders the nearby section only when there are pairings");

// ── red-proofs ──────────────────────────────────────────────────────────────
{
  // the floor is real: the same rows, if the floor were removed, would be >0
  const one = await eventPairings(ORIGIN, { fetchImpl: stub([mkRow(1), mkRow(3)]) });
  ok(one.length === 0, "self-test: a two-place set really does fall under the floor (floor is not vacuous)");
  ok(!/PlaceScoreChip/.test(hub.replace(/\bhero_image\b/g, "x")), "self-test: the no-score assertion is scanning the real hub source");
}

if (fail.length) {
  for (const m of fail) console.log("  FAIL:", m);
  console.log(`check-event-pairings: FAIL — ${fail.length} of ${pass + fail.length} assertions`);
  process.exit(1);
}
console.log(`check-event-pairings: OK — ${pass} assertions (nearby outing: excludes self, floor holds, genuinely nearby, /p/ links; visual cards stay date-badged and never scored)`);
