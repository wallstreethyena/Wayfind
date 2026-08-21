// scripts/check-inventory-integrity.mjs — THE DATA CANNOT SILENTLY ROT AGAIN.
//
// WHY (owner, 2026-08-20): "how can we find these issues? ... i need this website
// to have zero bug ... not just fix it but try to implement a reasoning to prevent
// them from ever happening again".
//
// The 2026-08-20 taxonomy audit found three data faults that NO existing guard
// could see, because every one of them lives in Supabase rather than in a file:
//
//   1. 71 OPERATIONAL rows had NULL primary_type — and they were the BEST rows
//      (avg 1,871 reviews: The Ringling, Manatee Public Beach, Marie Selby, Mote
//      SEA). An allowlist-first category rule keyed on primary_type silently drops
//      an untyped row, so the strongest place in a market was invisible to the very
//      category built to feature it, and the rail quietly filled the slot with
//      something weaker. A thin category backfilled with weaker results, caused
//      upstream in the data.
//   2. Coquina Beach was stored FOUR times, Siesta Beach twice. Same venue, split
//      across Google records, so a beach rail showed one beach as four cards.
//   3. Non-destination rows (a plumber, an auto-parts store, three medical clinics)
//      sat in a discovery inventory.
//
// All three were introduced by INGEST, not by a commit — which is exactly why a
// suite of 343 source-text guards was 382/382 green while they were live. This
// guard reads production. It is the missing half.
//
// SKIPS LOUDLY without credentials, matching scripts/test-place-card-layout.mjs's
// chromium handling: a guard that cannot reach its subject must say so, never
// report green by evaporating.
const URL_ = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!URL_ || !KEY) {
  console.log("check-inventory-integrity: SKIPPED — no Supabase credentials in env (set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to enforce)");
  process.exit(0);
}

// Documented allowances. These are CEILINGS on known, triaged debt — not targets.
// Lowering them as the debt is paid is the point; raising one requires a human to
// look at why and say so here.
const MAX_NULL_PRIMARY_TYPE = 20;   // 18 remain: generic Google types, no curated category. Manual pass pending.
const MAX_SPLIT_VENUE_GROUPS = 0;   // resolved 2026-08-20; any new one is a fresh ingest fault
const MAX_NON_DESTINATION = 9;      // 9 triaged rows pending a retire sweep (verified live 2026-08-20)

const NON_DESTINATION = /(dentist|doctor|lawyer|insurance|bank|atm|storage|car_repair|auto_parts|car_dealer|real_estate|hospital|pharmacy|gas_station|laundry|hair_|nail_|barber|funeral|veterinar|plumber|electrician|roofing|accounting|moving_company|chiropractor|medical_clinic|dry_clean|locksmith|pest_control)/;

let bad = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { bad++; console.error("check-inventory-integrity: FAIL — " + m); } };

const rows = [];
for (let from = 0; ; from += 1000) {
  const r = await fetch(
    `${URL_}/rest/v1/wf_inventory?select=place_id,name,metro,lat,lng,primary_type,category,photo_ref,status&status=eq.OPERATIONAL`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${from}-${from + 999}` } }
  );
  if (!r.ok) { console.error(`check-inventory-integrity: FAIL — Supabase ${r.status}`); process.exit(1); }
  const batch = await r.json();
  rows.push(...batch);
  if (batch.length < 1000) break;
}
ok(rows.length > 1000, `inventory returned ${rows.length} rows — too few to be the real table; this guard has lost its subject`);

// 1. Untyped rows.
const untyped = rows.filter((r) => !r.primary_type);
ok(untyped.length <= MAX_NULL_PRIMARY_TYPE,
  `${untyped.length} OPERATIONAL rows have no primary_type (ceiling ${MAX_NULL_PRIMARY_TYPE}). An untyped row cannot satisfy an allowlist-first category rule, so it vanishes from the narrow category built to feature it. Worst offenders: ${untyped.slice(0, 5).map((r) => r.name).join(", ")}`);

// 2. Same venue stored more than once. Name+metro alone is NOT the test — 787
// Coffee has three real Manhattan branches. Proximity is what separates a split
// record from a branch: same name, same metro, under 800m apart.
const groups = new Map();
for (const r of rows) {
  if (!r.name || r.lat == null || r.lng == null) continue;
  const k = `${r.name.trim().toLowerCase()}|${r.metro}`;
  (groups.get(k) || groups.set(k, []).get(k)).push(r);
}
const split = [];
for (const [k, g] of groups) {
  if (g.length < 2) continue;
  const spread = Math.max(
    (Math.max(...g.map((x) => x.lat)) - Math.min(...g.map((x) => x.lat))) * 111320,
    (Math.max(...g.map((x) => x.lng)) - Math.min(...g.map((x) => x.lng))) * 111320 * Math.cos((g[0].lat * Math.PI) / 180)
  );
  if (spread <= 800) split.push(`${g[0].name} (${g.length}x, ${Math.round(spread)}m)`);
}
ok(split.length <= MAX_SPLIT_VENUE_GROUPS,
  `${split.length} venues are stored as multiple records under 800m apart — one place will render as several cards: ${split.slice(0, 5).join("; ")}`);

// 3. Things that are not destinations.
const junk = rows.filter((r) => r.primary_type && NON_DESTINATION.test(r.primary_type));
ok(junk.length <= MAX_NON_DESTINATION,
  `${junk.length} non-destination rows in a discovery inventory (ceiling ${MAX_NON_DESTINATION}): ${junk.slice(0, 5).map((r) => `${r.name} [${r.primary_type}]`).join(", ")}`);

// 4. A curated category must not be overridden by a broad provider parent. This is
// the fault that made Manatee Public Beach (9,074 reviews) a 'tourist_attraction'
// and dropped it out of the beach gate.
const miscat = rows.filter((r) => r.category === "beach" && ["tourist_attraction", "point_of_interest", "establishment", "park"].includes(r.primary_type));
ok(miscat.length === 0,
  `${miscat.length} rows are category='beach' but typed as a broad parent — the provider's superset is overriding our own classification: ${miscat.slice(0, 5).map((r) => r.name).join(", ")}`);

// REPORTED, NOT FAILED: supply health. These are product problems, not regressions,
// and a permanently-red guard is a guard people learn to ignore.
const byMetro = new Map();
for (const r of rows) {
  const m = byMetro.get(r.metro) || { total: 0, photos: 0 };
  m.total++; if (r.photo_ref) m.photos++;
  byMetro.set(r.metro, m);
}
const noPhoto = [...byMetro].filter(([, m]) => m.photos === 0);
const seedOnly = [...byMetro].filter(([, m]) => m.total <= 120);
if (noPhoto.length) console.log(`check-inventory-integrity: NOTE — ${noPhoto.length} metros have ZERO photos (${noPhoto.slice(0, 6).map(([k]) => k).join(", ")}). Every card there is imageless.`);
if (seedOnly.length) console.log(`check-inventory-integrity: NOTE — ${seedOnly.length}/${byMetro.size} metros hold <=120 places, i.e. cold-start seed depth, not real coverage.`);

if (bad) { console.error(`check-inventory-integrity: ${bad} failure(s)`); process.exit(1); }
console.log(`check-inventory-integrity: OK — ${checks} assertions over ${rows.length} live rows, ${byMetro.size} metros`);
