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

import { PLACE_PARTNER_PICKS, RETIRED_VIATOR_PINS, pinServeability } from "../lib/placePartnerPicks.js";

// Documented allowances. These are CEILINGS on known, triaged debt — not targets.
// Lowering them as the debt is paid is the point; raising one requires a human to
// look at why and say so here.
const MAX_NULL_PRIMARY_TYPE = 0;    // paid down 2026-09-06 (v8.99): ingest now normalises primary_type; any new one is an ingest fault
const MAX_SPLIT_VENUE_GROUPS = 0;   // resolved 2026-08-20; any new one is a fresh ingest fault
const MAX_NON_DESTINATION = 0;      // paid down 2026-09-06 (v8.99): medical primaries excluded at classify(); 24 retired

const NON_DESTINATION = /(dentist|doctor|lawyer|insurance|bank|atm|storage|car_repair|auto_parts|car_dealer|real_estate|hospital|pharmacy|gas_station|laundry|hair_|nail_|barber|funeral|veterinar|plumber|electrician|roofing|accounting|moving_company|chiropractor|medical_clinic|dry_clean|locksmith|pest_control)/;

let bad = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { bad++; console.error("check-inventory-integrity: FAIL — " + m); } };

const rows = [];
for (let from = 0; ; from += 1000) {
  const r = await fetch(
    // v8.99: `excluded=true` rows are skipped by the read path (lib/inventoryServe)
    // and by retirement (status=EXCLUDED), so this guard measures what can SERVE,
    // the same population the user sees — not rows already taken off the board.
    `${URL_}/rest/v1/wf_inventory?select=place_id,name,metro,lat,lng,primary_type,category,photo_ref,status,signals&status=eq.OPERATIONAL&excluded=not.is.true`,
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
  // v8.99: two records of one name 400–800m apart that are BOTH well-reviewed are
  // branches (maman Brickell / maman Downtown, 662m, 958 and 1,010 reviews), not a
  // split. A split shows as one strong record shadowed by a weak one (Lake Eola
  // Park: 24,631 vs 78) or as pins on top of each other (Dezerland, 5m).
  const reviews = g.map((x) => Number((x.signals && x.signals.reviews) || 0)).sort((a, b) => b - a);
  const shadowed = reviews[0] > 0 && reviews[1] < reviews[0] * 0.25;
  if (spread <= 800 && (spread <= 400 || shadowed)) split.push(`${g[0].name} (${g.length}x, ${Math.round(spread)}m)`);
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

// 5. A STATIC PIN WHOSE PRODUCT LEFT THE CATALOGUE. This is the credentialed
// half of scripts/check-pinned-offer-serveable.mjs, and it is the reason that
// file's static ledger can be trusted.
//
// WHY (owner, 2026-09-10): "If a visible Book button sends a customer back to
// Wayfind because its product disappeared, that is a live revenue and trust
// defect... rather than discovering it after a customer clicks."
//
// lib/placePartnerPicks.js pins founder-verified Viator products onto place
// cards by exact name. Nothing ever re-checked that those products still exist.
// On 2026-09-09 an audit read wf_experiences and found no row for 16 of 35
// pinned codes — every one of them still painted "Tickets · Viator", and every
// click resolved offer-not-found and 302'd the customer home. That is a data
// fault living in Supabase, invisible to 600 source-text guards, which is
// exactly the class this file exists for.
//
// UNKNOWN IS NOT DEAD, and it matters more here than anywhere else, because
// this check runs with real credentials against a live table. Three separate
// non-answers are handled as non-answers rather than as deaths:
//   - the catalogue read itself failing  -> hard error, never "all pins dead"
//   - a row present with link_ok null    -> NOTE, never a failure
//   - a retired code that came BACK      -> NOTE (a repair opportunity)
// Only "no row at all" and "link_ok is explicitly false" are incidents.
{
  const pinned = PLACE_PARTNER_PICKS.filter((r) => r.provider === "viator");
  const codes = [...new Set(pinned.map((r) => String(r.offerId).trim().toUpperCase()))];
  const retired = [...new Set(RETIRED_VIATOR_PINS.map((r) => String(r.offerId).trim().toUpperCase()))];
  // Positive control BEFORE any verdict: a query shape that silently matches
  // nothing would report every pin as dead and read as a catastrophic finding.
  // (This repo has already been bitten by that once — `metro = any(null)`
  // returned 0 rows and looked like an empty table.)
  ok(codes.length >= 15,
    `pin sweep has a subject: ${codes.length} viator pins to verify — a near-empty list means placePartnerPicks lost its table, not that the catalogue is clean`);

  const want = [...codes, ...retired];
  // Product codes are alphanumeric by construction (lib/viatorDenylist
  // PRODUCT_CODE_RE). Assert it rather than URL-encode around it: a code that
  // is not alphanumeric is a corrupt pin, and quietly encoding it would send a
  // malformed filter to PostgREST and get an answer nobody could interpret.
  const malformed = want.filter((c) => !/^[A-Z0-9]+$/.test(c));
  ok(malformed.length === 0,
    `${malformed.length} pinned/retired product code(s) are not alphanumeric and cannot be used in a catalogue filter: ${malformed.join(", ")}`);
  const catalogue = new Map();
  let readOk = true;
  for (let i = 0; i < want.length && malformed.length === 0; i += 80) {
    const slice = want.slice(i, i + 80);
    const inList = slice.join(",");
    const r = await fetch(
      `${URL_}/rest/v1/wf_experiences?select=product_code,link_ok,fail_count&product_code=in.(${inList})`,
      { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }
    );
    if (!r.ok) { readOk = false; console.error(`check-inventory-integrity: FAIL — catalogue read for the pin sweep returned Supabase ${r.status}. NOT reporting the pins as dead: a read failure is our failure, not the products'.`); bad++; checks++; break; }
    for (const row of await r.json()) {
      catalogue.set(String(row.product_code || "").trim().toUpperCase(), row);
    }
  }

  if (readOk) {
    // The control that separates "the catalogue is empty" from "the query is
    // wrong": at least one pin we believe is live must come back.
    const found = codes.filter((c) => catalogue.has(c));
    ok(found.length > 0,
      `positive control: the catalogue answered for at least one pinned code (${found.length}/${codes.length}). Zero means the query shape is wrong, not that every product died — do NOT retire anything on this result`);

    if (found.length > 0) {
      const absent = codes.filter((c) => !catalogue.has(c));
      ok(absent.length === 0,
        `${absent.length} pinned Viator product(s) have NO row in wf_experiences, so their place cards paint a Book button that resolves to offer-not-found and sends the customer back to our homepage: ${absent.join(", ")}. Fix by removing the placePick row and recording the code in RETIRED_VIATOR_PINS (lib/placePartnerPicks.js) — then research a replacement. Do NOT leave the pin up while you look.`);

      const provenDead = codes.filter((c) => catalogue.get(c) && catalogue.get(c).link_ok === false);
      ok(provenDead.length === 0,
        `${provenDead.length} pinned Viator product(s) are in the catalogue but PROVEN dead by the link-health sweep (link_ok=false): ${provenDead.join(", ")}. /api/commerce/go already refuses these, so the button is painted and the click cannot complete — retire or repin them.`);

      // NOTES, never failures. Each is a real signal and none of them is evidence
      // that a product is gone.
      const neverProbed = codes.filter((c) => catalogue.has(c) && catalogue.get(c).link_ok == null);
      if (neverProbed.length) console.log(`check-inventory-integrity: NOTE — ${neverProbed.length} pinned product(s) have never been link-health probed (link_ok null): ${neverProbed.slice(0, 8).join(", ")}. Unknown is not dead; these still serve. app/api/cron/experiences-link-health is what resolves them.`);
      const resurrected = retired.filter((c) => catalogue.has(c) && catalogue.get(c).link_ok !== false);
      if (resurrected.length) console.log(`check-inventory-integrity: NOTE — ${resurrected.length} RETIRED code(s) are back in the catalogue and not dead: ${resurrected.slice(0, 8).join(", ")}. That is a re-pin OPPORTUNITY (revenue we are currently leaving on the table), not a defect — verify the product still names the place before restoring the pin.`);
      // And the loop that proves the two halves agree: anything the credentialed
      // sweep considers serveable must not be refused by the static gate, and
      // vice versa, or the render path and the monitor are telling different
      // stories about the same product.
      for (const row of pinned) {
        const c = String(row.offerId).trim().toUpperCase();
        const liveHere = catalogue.has(c) && catalogue.get(c).link_ok !== false;
        if (!liveHere) continue;
        ok(pinServeability(row).serveable === true,
          `${c} is alive in the catalogue but the static gate refuses it — the render path and this monitor disagree, so one of them is lying to the operator`);
      }
    }
  }
}

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
console.log(`check-inventory-integrity: OK — ${checks} assertions over ${rows.length} live rows, ${byMetro.size} metros, and every founder-pinned Viator product verified present + not-proven-dead in wf_experiences (unknown counted as unknown, never as dead)`);
