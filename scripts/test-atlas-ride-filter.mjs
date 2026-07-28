// scripts/test-atlas-ride-filter.mjs — locks RIDE_RX in the atlas-build cron.
//
// The spec says an individual ride inside a park is not a place: it merges into
// the parent park. The original denylist missed 9 of the 11 headline rides
// sampled below — including Guardians of the Galaxy: Cosmic Rewind, which ranks
// among Orlando's highest-reviewed entries in wf_place_ids and would otherwise
// have been written to wf_editorial as a destination.
//
// Read the live regex out of the route so this can never drift from what ships.
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-atlas-ride-filter: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const src = readFileSync(new URL("../app/api/cron/atlas-build/route.js", import.meta.url), "utf8");
const m = src.match(/const RIDE_RX = new RegExp\(\[([\s\S]*?)\]\.join\("\|"\), "i"\);/);
ok(!!m, "RIDE_RX is a maintainable array-joined RegExp in the route");
// eslint-disable-next-line no-eval
const RIDE_RX = new RegExp(eval("[" + m[1] + "]").join("|"), "i");

// Must be treated as rides (merge into the parent park).
for (const name of [
  "Guardians of the Galaxy: Cosmic Rewind", "Rise of the Resistance",
  "Remy's Ratatouille Adventure", "Slinky Dog Dash", "TRON Lightcycle / Run",
  "Hagrid's Magical Creatures Motorbike Adventure", "Jurassic World VelociCoaster",
  "Seven Dwarfs Mine Train", "Haunted Mansion", "Space Mountain",
  "Avatar Flight of Passage", "Expedition Everest", "The Twilight Zone Tower of Terror",
  "Big Thunder Mountain Railroad", "Pirates of the Caribbean", "Jungle Cruise",
  "Harry Potter and the Escape from Gringotts", "Revenge of the Mummy",
  "The Incredible Hulk Coaster", "Hollywood Rip Ride Rockit", "Mako", "Kraken",
  "Kilimanjaro Safaris", "Frozen Ever After", "Millennium Falcon: Smugglers Run",
  "Soarin' Around the World", "Spaceship Earth", "Test Track",
]) ok(RIDE_RX.test(name), `ride rejected: ${name}`);

// Must NOT be treated as rides — these are real destinations.
for (const name of [
  "Magic Kingdom Park", "Epcot", "Universal Studios Florida", "Disney Springs",
  "ICON Park", "Gatorland", "Harry P. Leu Gardens", "Orlando Science Center",
  "SeaWorld Orlando", "Mead Botanical Garden", "Scenic Boat Tour",
  "Universal Islands of Adventure", "Disney's Animal Kingdom Theme Park",
  "The Mall at Millenia", "Orlando Museum of Art", "Wekiwa Springs State Park",
]) ok(!RIDE_RX.test(name), `destination wrongly filtered as a ride: ${name}`);

// The wall-clock budget: the upsert runs after the pool settles, so a killed
// function writes nothing and wastes the whole batch's metered spend.
// WIDENED during the v6.49 merge. These pinned #383's exact literals
// (`const deadline = Date.now() + N`, `Date.now() > deadline`, `skipped`), but
// v6.49 had INDEPENDENTLY added the same guard as `startedAt` +
// `DISPATCH_DEADLINE_MS` + `deferred`. Keeping both implementations would have
// counted one event under two names and reported two different numbers for it,
// so the merge kept one. The property these assertions describe is fully
// intact; only the identifiers changed.
//
// So they now accept either shape and assert the BEHAVIOUR — a budget exists,
// it is read inside the pool, it leaves headroom under maxDuration, and what it
// drops is counted. A deadline nothing reads is not a deadline.
const dispatchMs = (src.match(/const DISPATCH_DEADLINE_MS = ([\d_]+);/) || [])[1];
const absoluteMs = (src.match(/const deadline = Date\.now\(\) \+ ([\d_]+);/) || [])[1];
ok(!!(dispatchMs || absoluteMs), "batch carries a wall-clock deadline");
ok(/Date\.now\(\) > deadline/.test(src) || /Date\.now\(\) - startedAt > DISPATCH_DEADLINE_MS/.test(src),
  "the deadline actually gates new work — it is read inside the pool, not just declared");
const budget = parseInt(String(dispatchMs || absoluteMs || "0").replace(/_/g, ""), 10);
ok(budget > 0 && budget <= 50000, `deadline leaves headroom under maxDuration=60 (got ${budget}ms)`);
ok((/skipped\+\+/.test(src) && /skipped,/.test(src)) || (/deferred\+\+/.test(src) && /deferred,/.test(src)),
  "places dropped to the deadline are counted AND reported, so a persistently non-zero count is visible");

// Unbounded response bodies must never be pulled into the function.
ok(/content-length[\s\S]{0,120}?return null;/.test(src), "the page fetch caps response size");

console.log(`test-atlas-ride-filter: OK — ${pass} assertions (rides filtered, destinations kept, batch bounded)`);
