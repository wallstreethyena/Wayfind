#!/usr/bin/env node
// Who may raise a Wayfind Score (owner brief, 2026-11-12: "Never manufacture a
// score increase"; hosted, organizer-owned and independent content get the
// appropriate treatment; useful videos stay visible). Asserted on the CALL of
// the real resolvers, one live registry entry per category:
//   independent creator           -> shows, counts (+0.2)
//   aggregator / city guide        -> shows, counts (independent of the venue)
//   venue's own account            -> shows, does NOT count
//   hosted creator                 -> shows, does NOT count
//   unattributed share (no handle) -> shows, does NOT count
//   independent + hosted on one place -> counts once (the independent one)
//   the featured creator (Cindy)   -> unchanged
import assert from "node:assert/strict";
import { hasCreatorVideoAt, hasScoringCreatorVideoAt, displayedWfScore, creatorEvidenceTerm, hasFeaturedCreatorVideoAt } from "../lib/creatorBoost.js";
import { governedScoreOf } from "../lib/lawfulOrder.js";
import { NON_INDEPENDENT_CREATOR_HANDLES, MEDIA_NOT_CORROBORATION_HANDLES, countsTowardScore, scoringCreatorVideos } from "../lib/creatorIndependence.js";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const place = (id, name, city) => ({ id, place_id: id, name, city, rating: 4.6, reviews: 500, wfScore: 90 });

const CASES = [
  ["independent", place("ChIJ9TyG2GkS54gRvw6kLzIkFBw", "Central Florida Zoo & Botanical Gardens", "Sanford"), true],
  ["aggregator", place("ChIJw3vqvtndwogRobHwt-M78qw", "Rio Izakaya", "Tampa"), true],
  ["venue own account", place("ChIJj7u1zf1654gRlOTNe7y12Jo", "Mathers Social Gathering", "Orlando"), false],
  ["hosted creator", place("ChIJl0CYCGZ_3YgRL05pG5wZSsE", "Gaylord Palms Resort & Convention Center", "Kissimmee"), false],
  ["unattributed share", place("ChIJmzf1RPUB2YgRaEhyuQFGVt4", "Mai-Kai", "Fort Lauderdale"), false],
  ["independent + hosted", place("ChIJCRCYGrx654gR3G9qoVbWlpY", "Harry P Leu Gardens", "Orlando"), true],
];
for (const [label, p, counts] of CASES) {
  ok(hasCreatorVideoAt(p, p.city), `${label}: the video still DISPLAYS (${p.name})`);
  ok(hasScoringCreatorVideoAt(p, p.city) === counts, `${label}: counts toward the score = ${counts} (${p.name})`);
  ok(displayedWfScore({ ...p }, p.city) === (counts ? 92 : 90), `${label}: shown score ${counts ? "90 + 2" : "stays 90"}, got ${displayedWfScore({ ...p }, p.city)}`);
  ok((creatorEvidenceTerm(p, p.city) > 0) === counts, `${label}: the sort's creator term agrees with the shown number`);
  // The lawful sort records the verdict on the row; it must be the same verdict.
  const row = { ...p };
  ok(governedScoreOf(row, p.city) === (counts ? 92 : 90) && (row.creator_video === true) === counts, `${label}: lawful sort score and recorded creator_video agree (${row.creator_video})`);
}

// The featured creator's own term is untouched.
const cindy = place("ChIJIQGDwpgXw4gRxIJcGmjtyK4", "Spinning Coffee", "Bradenton");
ok(hasScoringCreatorVideoAt(cindy, cindy.city) && hasFeaturedCreatorVideoAt(cindy, cindy.city), "Cindy Selects still counts and stays featured");

// Rule shape.
ok([...MEDIA_NOT_CORROBORATION_HANDLES].every((h) => NON_INDEPENDENT_CREATOR_HANDLES.has(h)), "every media handle is also listed non-independent (it is an exception to that list, not a new class)");
ok(countsTowardScore("ariblogging") && countsTowardScore("secretsoftampabay"), "independent and media handles count");
ok(!countsTowardScore("surfingsantas") && !countsTowardScore("intothespotlighttalkshow") && !countsTowardScore("briantreks"), "organizer and hosted handles do not count");
ok(scoringCreatorVideos([{ platform: "facebook", url: "x" }]).length === 0, "a video with no creator never counts");

console.log(`test-creator-score-eligibility: OK — ${checks} assertions (6 live categories: display kept, score only for independent voices; shown == sorted; Cindy unchanged)`);
