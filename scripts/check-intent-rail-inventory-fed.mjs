import { readFileSync } from "node:fs";

const component = readFileSync(new URL("../app/components/NightOutRails.js", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/night-out/route.js", import.meta.url), "utf8");
const daypart = readFileSync(new URL("../app/components/DaypartRail.js", import.meta.url), "utf8");

let pass = 0;
const fail = [];
const ok = (condition, message) => condition ? pass++ : fail.push(message);

ok(/fetchJsonWithDeadline\("\/api\/night-out\?"/.test(component),
  "NightOutRails must fetch the dedicated bounded Night Out endpoint");
ok(/\["food",\s*"nightlife",\s*"attractions"\]/.test(route),
  "the Night Out endpoint must read food, nightlife and attraction inventory");
ok(/Promise\.allSettled\(/.test(route) && /serveFromInventory/.test(route),
  "the complete inventory must load in parallel from the owned shelf without one failed category blanking the answer");
ok(/new Set\(\)/.test(route) && /seen\.has\(/.test(route),
  "the combined inventory must deduplicate before composition");
ok(/night-out:v4/.test(route), "the expanded answer must use the v4 cache identity");
ok(!/useIntentCandidates/.test(daypart),
  "DaypartRail must not issue a duplicate inventory request while NightOutRails loads the complete answer");
ok(/<NightOutRails[\s\S]{0,400}?places=\{nightOutPlaces\}/.test(daypart),
  "NightOutRails must retain the existing client pool as its fail-soft fallback");

if (fail.length) {
  console.error("check-intent-rail-inventory-fed: FAIL");
  for (const message of fail) console.error("  - " + message);
  process.exit(1);
}
console.log(`check-intent-rail-inventory-fed: OK — ${pass} assertions; one bounded endpoint owns the full inventory and the client keeps a no-cost fallback`);
