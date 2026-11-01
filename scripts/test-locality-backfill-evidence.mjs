// test-locality-backfill-evidence — locks the two defects found in the first
// #2075 locality backfill (see scripts/lib/localityEvidence.mjs), by CALLING
// the rules and by checking the committed migration + audit they produced.
import { readFileSync, readdirSync } from "node:fs";
import { addressCitySlot, addressCorroboratesCity, localityIsFillable } from "./lib/localityEvidence.mjs";

let n = 0;
const ok = (c, m) => { n++; if (!c) { console.error(`test-locality-backfill-evidence: FAIL — ${m}`); process.exit(1); } };

// 1. City slot, not substring.
ok(addressCitySlot("1490 East Lake Buena Vista Dr, Orlando, FL 32830") === "Orlando", "city slot of the House of Blues address is Orlando");
ok(!addressCorroboratesCity("1490 East Lake Buena Vista Dr, Orlando, FL 32830", "Lake Buena Vista"), "a street name never corroborates a city (House of Blues)");
ok(addressCorroboratesCity("1490 East Lake Buena Vista Dr, Orlando, FL 32830", "Orlando"), "the real city slot does corroborate");
ok(!addressCorroboratesCity("41 Baymont Street, Clearwater Beach, FL 33767", "Clearwater"), "a longer place name never corroborates a shorter one (Frenchy's)");
ok(addressCorroboratesCity("6151 Varn Rd, Plant City, FL 33565, USA", "plant city"), "trailing country segment and case are tolerated");
ok(addressCorroboratesCity("1910 14th St W, Bradenton, Florida", "Bradenton"), "spelled-out state with no zip is a state segment");
ok(!addressCorroboratesCity("Bradenton Riverwalk", "Bradenton"), "an address with no state segment corroborates nothing");
ok(!addressCorroboratesCity("", "Tampa") && !addressCorroboratesCity("1 Main St, Tampa, FL", ""), "empty inputs corroborate nothing");

// 2. The Census pass's deliberate empties are not fillable.
ok(!localityIsFillable({ locality: null, county: "Hillsborough" }), "county set + locality empty is a Census decision (Fox Squirrel, Keel Farms)");
ok(!localityIsFillable({ locality: "Tampa", county: null }), "a held locality is never overwritten");
ok(localityIsFillable({ locality: "  ", county: "" }), "a truly unknown row is fillable");

// 3. The generator uses the rules in their roles (not merely imports them).
const gen = readFileSync(new URL("./backfill-locality-from-events.mjs", import.meta.url), "utf8");
ok(/evs\.find\(\(e\)\s*=>\s*addressCorroboratesCity\(e\.address,\s*city\)\)/.test(gen), "tier A corroboration calls addressCorroboratesCity");
ok(/if \(localityIsFillable\(r\)\) needing\.set/.test(gen), "the candidate set is gated by localityIsFillable");
ok(/select=place_id,name,locality,county/.test(gen), "the inventory read includes county, or localityIsFillable sees nothing");
ok(gen.includes("addressCorroboratesCity(e.address, city)"), "control: the probe below can find a call shape that IS in the generator");
ok(!gen.includes("address.toLowerCase().includes("), "the substring corroboration is gone");

// 4. The committed artifact obeys the rules.
const mig = readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((f) => /_wf_inventory_locality_from_owned_events\.sql$/.test(f));
ok(mig.length >= 1, `a locality backfill migration is committed (${mig.length})`);
for (const f of mig) {
  const sql = readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), "utf8");
  ok(sql.includes("ChIJ550owHsXw4gR4L8ZcLVqA-M"), `${f}: control — a known Tier A row (Flamingo Bay Brewing, Bradenton) is present, so the absence probe below can see place ids`);
  for (const bad of ["ChIJBap9MoR_3YgRnzGmE9oTtYE", "ChIJeYs9itH2wogRrCzlbripy1w", "ChIJFwrRu7o33YgRIuZ-0QgeCVQ", "ChIJ_5yVrBY13YgRwSgyH1hrRjg"]) {
    ok(!sql.includes(bad), `${f} does not touch ${bad} (a row the review proved wrong)`);
  }
  const csvPath = new URL(`../docs/audits/${f.replace(/\.sql$/, ".csv")}`, import.meta.url);
  const rows = readFileSync(csvPath, "utf8").trim().split("\n").slice(1)
    .map((l) => l.match(/"((?:[^"]|"")*)"|[^,]+/g).map((v) => v.replace(/^"|"$/g, "").replace(/""/g, '"')));
  const tierA = rows.filter((r) => r[3] === "A");
  ok(tierA.length > 0, `${f}: the audit carries tier A rows (${tierA.length})`);
  for (const r of tierA) ok(addressCorroboratesCity(r[5], r[2]), `${f}: tier A row ${r[1]} -> ${r[2]} is corroborated by its address city slot ("${r[5]}")`);
  const updates = (sql.match(/^update public\.wf_inventory set locality/gm) || []).length;
  ok(updates === tierA.length, `${f}: one update per audited tier A row (${updates} vs ${tierA.length})`);
}

console.log(`test-locality-backfill-evidence: OK — ${n} assertions (city slot not substring, Census empties held, generator wired, committed migration clean)`);
