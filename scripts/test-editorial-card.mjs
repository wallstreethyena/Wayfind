// scripts/test-editorial-card.mjs — v6.42 offline integrity test for the 93
// publish-ready Atlas editorial cards that /api/editorial serves by place_id.
// No network: pure data + mapping integrity, so a corrupt/incomplete card set
// or a mapping regression fails the build instead of shipping blank sheets.
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cards = JSON.parse(readFileSync(join(root, "data/atlas/editorial-cards.json"), "utf8"));

let pass = 0;
const fail = (m) => { console.error("test-editorial-card: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

// Same mapping the route (app/api/editorial/route.js) applies. Kept in sync by
// this test: `move` must never be emitted (Atlas cards carry Insider Move).
const un = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const cardToEditorial = (c) => ({
  name: c.name, vibe: un(c.vibeCheck), why: un(c.whyGo), knownFor: un(c.knownFor), bestFor: un(c.bestFor),
  foodMove: un(c.foodMove), drinkMove: un(c.drinkMove), insiderMove: un(c.insiderMove),
  story: un(c.verifiedStory), proof: un(c.powerhouseProof), goodToKnow: un(c.currentUsefulDetail),
  funFact: un(c.funFact), watchOut: un(c.watchOut),
});

ok(Array.isArray(cards) && cards.length >= 90, `at least 90 Atlas cards (got ${Array.isArray(cards) ? cards.length : "not an array"})`);

const ids = new Set();
for (const c of cards) {
  ok(c && c.placeId && /^ChIJ[A-Za-z0-9_-]{20,}$/.test(c.placeId), `${c && c.name}: valid Google place_id`);
  ok(!ids.has(c.placeId), `${c.name}: place_id not duplicated (${c.placeId})`);
  ids.add(c.placeId);
  ok(typeof c.name === "string" && c.name.trim().length > 0, `card ${c.placeId} has a name`);
  ok(typeof c.vibeCheck === "string" && c.vibeCheck.trim().length >= 20, `${c.name}: substantive vibeCheck`);
  ok(typeof c.whyGo === "string" && c.whyGo.trim().length >= 20, `${c.name}: substantive whyGo`);
  ok(!JSON.stringify(c).includes("`null`"), `${c.name}: no literal \`null\` token leaked into the card`);
  const e = cardToEditorial(c);
  ok(!("move" in e) || e.move == null, `${c.name}: mapping never emits a Best Move (avoids double-render)`);
  ok(e.vibe && e.why, `${c.name}: mapped editorial keeps vibe + why`);
}

console.log(`test-editorial-card: OK — ${pass} assertions across ${cards.length} Atlas cards (place_id-keyed, mapping stable)`);
