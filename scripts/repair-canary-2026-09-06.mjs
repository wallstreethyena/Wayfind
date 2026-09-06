// scripts/repair-canary-2026-09-06.mjs — the data half of the v8.99 fix.
//
//   node scripts/repair-canary-2026-09-06.mjs            # DRY RUN — prints the plan
//   node scripts/repair-canary-2026-09-06.mjs --apply    # writes, row by row, PATCH
//
// WHY. 2026-09-06, the first `canary` run with SUPABASE_URL/SERVICE_ROLE_KEY in
// GitHub Actions (the secrets had never been set — the database job had been
// failing before it could look) found four live faults in wf_inventory:
//   24 non-destination rows (chiropractors, medical clinics, a plumber)
//   80 OPERATIONAL rows with no primary_type
//   41 category='beach' rows typed park/tourist_attraction
//    7 venues stored twice within 800m
// 90% of it arrived with the 2026-09-01 Florida coverage ingest. The CODE fix is
// in lib/placeCategory.js (medical primaries excluded; the beach name net) and
// lib/seedPlaces.js (normalizePrimaryType). This script applies the SAME
// classifier to the rows already in the table, so the data and the code agree.
//
// GUARANTEES
//   • NO DELETES — a junk row or a duplicate is retired (status=EXCLUDED,
//     excluded=true, exclusion_reason) and locked. It stays inspectable.
//   • BACKUP FIRST — refuses to --apply unless wf_inventory_backup_2026_09_06
//     exists and is non-empty (created by hand before this ran; 1,174 rows).
//   • LOCKED ROWS ARE SACRED — never touched.
//   • IDEMPOTENT — a second run plans zero changes.
//   • Every decision is the classifier's, not a hand list. The one hand
//     decision (The Turtle Hospital keeps its card, typed tourist_attraction)
//     is locked so no ingest reverts it.
import fs from "node:fs";
import { classify } from "../lib/placeCategory.js";
import { normalizePrimaryType } from "../lib/seedPlaces.js";

const APPLY = process.argv.includes("--apply");
if (fs.existsSync(".env.local")) {
  for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const URL_ = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!URL_ || !KEY) { console.error("repair: Supabase URL / service-role key missing"); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const NON_DESTINATION = /(dentist|doctor|lawyer|insurance|bank|atm|storage|car_repair|auto_parts|car_dealer|real_estate|hospital|pharmacy|gas_station|laundry|hair_|nail_|barber|funeral|veterinar|plumber|electrician|roofing|accounting|moving_company|chiropractor|medical_clinic|dry_clean|locksmith|pest_control)/;
const BROAD = new Set(["tourist_attraction", "point_of_interest", "establishment", "park"]);

const rows = [];
for (let from = 0; ; from += 1000) {
  const r = await fetch(`${URL_}/rest/v1/wf_inventory?select=place_id,name,metro,lat,lng,category,tags,primary_type,google_types,status,signals,photo_ref,editorial,locked,excluded,source&status=eq.OPERATIONAL`, { headers: { ...H, Range: `${from}-${from + 999}` } });
  if (!r.ok) { console.error(`repair: read failed ${r.status}`); process.exit(1); }
  const j = await r.json(); rows.push(...j); if (j.length < 1000) break;
}
console.log(`repair: ${rows.length} OPERATIONAL rows read${APPLY ? "" : "  (DRY RUN — nothing will be written)"}\n`);

const plan = new Map(); // place_id -> { name, why, patch }
const add = (r, why, patch) => {
  if (r.locked) { console.log(`  LOCKED, skipped: ${r.name} (${why})`); return; }
  const cur = plan.get(r.place_id) || { name: r.name, why: [], patch: {} };
  cur.why.push(why); Object.assign(cur.patch, patch); plan.set(r.place_id, cur);
};
const retire = (r, reason, why) => add(r, why, { status: "EXCLUDED", excluded: true, exclusion_reason: reason, locked: true });
const live = rows.filter((r) => r.excluded !== true);

// 1. Non-destination rows — the classifier (now with MEDICAL_PRIMARY) decides.
let nd = 0;
for (const r of live.filter((r) => r.primary_type && NON_DESTINATION.test(r.primary_type))) {
  const c = classify({ types: r.google_types, primaryType: r.primary_type, name: r.name });
  if (c.excluded) { retire(r, c.reason, `non-destination [${r.primary_type}]`); nd++; }
  else if ((r.google_types || []).includes("tourist_attraction")) {
    // The Turtle Hospital case: Google's secondary types say attraction, ours agrees.
    add(r, `medical primary but a real attraction → typed tourist_attraction, locked`, { primary_type: "tourist_attraction", locked: true }); nd++;
  } else console.log(`  UNDECIDED non-destination (left alone): ${r.name} [${r.primary_type}]`);
}

// 2. Beach rows typed as a broad parent — re-run the classifier (new name net).
let bm = 0, bmOut = 0;
for (const r of live.filter((r) => r.category === "beach" && BROAD.has(r.primary_type))) {
  const c = classify({ types: r.google_types, primaryType: r.primary_type, name: r.name });
  if (c.category === "beach") { add(r, "real beach typed as a broad parent → primary_type beach", { primary_type: "beach" }); bm++; }
  else if (c.category) { add(r, `named after a beach town, is a ${c.category} → re-listed`, { category: c.category, tags: c.tags, secondary_categories: c.secondary || [] }); bmOut++; }
  else console.log(`  UNDECIDED beach row (left alone): ${r.name}`);
}

// 3. Untyped rows — normalizePrimaryType, the same rule ingest now applies.
let un = 0;
for (const r of live.filter((r) => !r.primary_type)) {
  const pt = normalizePrimaryType(null, r.google_types, r.category);
  // With a primary in hand, the classifier may now veto it (a `supplier`).
  const c = pt ? classify({ types: r.google_types, primaryType: pt, name: r.name }) : null;
  if (c && c.excluded) { retire(r, c.reason, `no primary_type → ${pt}, which the classifier excludes`); un++; }
  else if (pt) { add(r, `no primary_type → ${pt}`, { primary_type: pt }); un++; }
  else console.log(`  UNDECIDED untyped (left alone): ${r.name}`);
}

// 4. Split venues — same name, same metro, under 800m: keep the richest record.
const groups = new Map();
for (const r of live) {
  if (!r.name || r.lat == null || r.lng == null) continue;
  const k = `${r.name.trim().toLowerCase()}|${r.metro}`;
  (groups.get(k) || groups.set(k, []).get(k)).push(r);
}
let dup = 0;
const rich = (r) => (r.signals?.reviews || 0) * 10 + (r.photo_ref ? 5 : 0) + (r.editorial ? 3 : 0);
for (const g of groups.values()) {
  if (g.length < 2) continue;
  const spread = Math.max(
    (Math.max(...g.map((x) => x.lat)) - Math.min(...g.map((x) => x.lat))) * 111320,
    (Math.max(...g.map((x) => x.lng)) - Math.min(...g.map((x) => x.lng))) * 111320 * Math.cos((g[0].lat * Math.PI) / 180));
  if (spread > 800) continue;
  // Same rule as check-inventory-integrity: 400–800m apart AND both well-reviewed = branches.
  const reviews = g.map((x) => Number((x.signals && x.signals.reviews) || 0)).sort((a, b) => b - a);
  const shadowed = reviews[0] > 0 && reviews[1] < reviews[0] * 0.25;
  if (spread > 400 && !shadowed) { console.log(`  BRANCHES, kept both: ${g[0].name} (${Math.round(spread)}m, ${reviews.join("/")} reviews)`); continue; }
  const keep = g.slice().sort((a, b) => rich(b) - rich(a))[0];
  for (const r of g) if (r !== keep) { retire(r, `duplicate_of:${keep.place_id}`, `duplicate of ${keep.name} (${Math.round(spread)}m), kept ${keep.place_id}`); dup++; }
}

console.log(`\nPLAN — non-destination ${nd} · beach retyped ${bm} · beach re-listed ${bmOut} · untyped ${un} · duplicates retired ${dup} · rows touched ${plan.size}\n`);
for (const [id, p] of plan) console.log(`  ${p.name}  [${id}]\n     ${p.why.join("; ")}\n     ${JSON.stringify(p.patch)}`);

if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply."); process.exit(0); }

const backup = await fetch(`${URL_}/rest/v1/wf_inventory_backup_2026_09_06?select=place_id&limit=1`, { headers: H });
if (!backup.ok || (await backup.json()).length === 0) { console.error("repair: refusing to write — wf_inventory_backup_2026_09_06 missing or empty"); process.exit(1); }

let done = 0, failed = 0;
for (const [id, p] of plan) {
  const r = await fetch(`${URL_}/rest/v1/wf_inventory?place_id=eq.${encodeURIComponent(id)}&locked=is.false`, { method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(p.patch) });
  if (!r.ok) { failed++; console.error(`  write failed ${r.status} for ${p.name}: ${(await r.text()).slice(0, 200)}`); } else done++;
}
console.log(`\nrepair: applied ${done} row(s), ${failed} failed. Re-run WITHOUT --apply to confirm idempotency (expect rows touched 0).`);
console.log("rollback: UPDATE wf_inventory i SET status=b.status, excluded=b.excluded, exclusion_reason=b.exclusion_reason, locked=b.locked, primary_type=b.primary_type, category=b.category, tags=b.tags, secondary_categories=b.secondary_categories FROM wf_inventory_backup_2026_09_06 b WHERE b.place_id=i.place_id;");
if (failed) process.exit(1);
