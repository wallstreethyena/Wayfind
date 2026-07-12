// v5.75 prebuild guardrail — the "false water view" bug class. This is the
// check that WOULD have caught the shipped lies (The Oar & Iron "sunset
// waterfront views", "Prime beach weather" on inland venues) before they hit a
// user at the moment of decision. venueLean() must never call a dining/retail
// venue or a clearly-indoor TYPE "water"; a genuine beach/water TYPE must be
// preserved; and a { noWater } override must force the water read off.
import { venueLean, overrideFor } from "../lib/ranking.js";

let failures = 0;
const fail = (m) => { console.error("check-water: FAIL — " + m); failures++; };
const ok = (c, m) => { if (!c) fail(m); };

// 1. A food/bar/shop is NEVER water, no matter how nautical its name.
for (const name of ["The Oar & Iron", "Marina Pizza & Subs", "Bayfront Tavern", "Pieroguys Pierogies", "Beach Bum Burgers", "River Rock Cafe"]) {
  const v = venueLean({ name, types: ["restaurant"] });
  ok(v && v.water === false && v.lean === "indoor", `venueLean("${name}", restaurant) must be indoor/no-water, got ${JSON.stringify(v)}`);
}

// 2. An indoor TYPE beats a water word in the name (the theater/church/museum class).
for (const [name, type] of [["Bay Street Players Theater", "performing_arts_theater"], ["Crystal Springs Museum", "museum"], ["Lake Wales Community Church", "church"], ["Riverview Fitness", "gym"]]) {
  const v = venueLean({ name, types: [type] });
  ok(v && v.water === false, `venueLean("${name}", ${type}) must be no-water, got ${JSON.stringify(v)}`);
}

// 3. A genuine beach / water TYPE is still preserved (no over-correction).
ok(venueLean({ name: "Siesta Key Beach", types: ["beach", "natural_feature"] }).water === true, "a genuine beach TYPE must stay water:true");
ok(venueLean({ name: "Robinson Preserve", types: ["natural_feature", "marina"] }).water === true, "a marina/natural_feature TYPE stays water:true");

// 4. The { noWater } override forces water off even against a water TYPE.
const ov = overrideFor({ name: "The Oar & Iron" });
ok(ov && ov.noWater === true, "the Oar & Iron override must carry noWater:true (the owner's one-line correction knob)");
ok(venueLean({ name: "The Oar & Iron", types: ["beach"] }).water === false, "a noWater override must beat even a water TYPE");

if (failures) { console.error(`check-water: ${failures} failure(s)`); process.exit(1); }
console.log("check-water: OK — venueLean never calls a dining/indoor venue 'water'; genuine beaches preserved; the noWater override is enforced");
