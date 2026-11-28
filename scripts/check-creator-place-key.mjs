// scripts/check-creator-place-key.mjs — the lean creator mirror stores
// creatorPlaceKey(placeId) instead of the id (lib/creatorPlaceKey.js). This
// guard proves the key is safe to use as the id: deterministic, distinct for
// every curated id, and the exact key the generator wrote for each entry.
import { creatorPlaceKey } from "../lib/creatorPlaceKey.js";
import { LEAN_CURATED } from "../lib/creatorSignalsData.generated.js";
import { __CURATED_FOR_CODEGEN__ as CURATED } from "../lib/creatorVideos.js";
import { creatorVideosFor } from "../lib/creatorSignals.js";

let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error("FAIL: " + m); } };

ok(creatorPlaceKey("ChIJCRCYGrx654gR3G9qoVbWlpY") === creatorPlaceKey("ChIJCRCYGrx654gR3G9qoVbWlpY"), "key is deterministic");
ok(creatorPlaceKey("ChIJCRCYGrx654gR3G9qoVbWlpY") !== creatorPlaceKey("ChIJCRCYGrx654gR3G9qoVbWlpZ"), "a one-character change gives a different key");
ok(/^[0-9a-z]+\.[0-9a-z]+$/.test(creatorPlaceKey("x")), "key is two base36 halves");

ok(LEAN_CURATED.length === CURATED.length, "lean mirror has one tuple per curated entry");
const byKey = new Map();
for (let i = 0; i < CURATED.length; i++) {
  const id = CURATED[i].placeId;
  const slot = LEAN_CURATED[i] && LEAN_CURATED[i][0];
  if (!id) { ok(slot === 0, `entry ${i} has no placeId and slot 0 is the 0 sentinel`); continue; }
  const k = creatorPlaceKey(id);
  ok(slot === k, `entry ${i} (${id}) carries creatorPlaceKey(placeId)`);
  ok(!String(slot).startsWith("ChIJ"), `entry ${i} does not ship the raw Google id`);
  const prev = byKey.get(k);
  ok(prev === undefined || prev === String(id), `no key collision: ${id} vs ${prev}`);
  byKey.set(k, String(id));
}

// End to end: a card carrying the REAL id still resolves through the keyed index.
const leu = { id: "ChIJCRCYGrx654gR3G9qoVbWlpY", name: "‡ no name match ‡" };
ok(creatorVideosFor(leu).length > 0, "a card with a real curated Google id resolves to its creator videos");
ok(creatorVideosFor({ id: "ChIJnotCurated000000000000", name: "‡ no name match ‡" }).length === 0, "an uncurated id resolves to nothing");

console.log(bad ? `FAIL ${bad}/${n}` : `OK creator-place-key: ${n} assertions, ${byKey.size} distinct keyed ids`);
process.exit(bad ? 1 : 0);
