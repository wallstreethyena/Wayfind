#!/usr/bin/env node
/**
 * ingest-verified-2026-08-29e — owner Florida markets / places / events
 * (Gabe, 2026-08-29e).
 *
 * Same law as #1019: inventory + sourced two-beat only. FAIL-CLOSED: this
 * script never calls Google Places / Place Details / Text Search / photo
 * backfill. The one ADD row already carries a public ChIJ printed on the
 * official Frog Pond site (North Redington Beach). hold_google_id rows
 * write nothing: Cha Cha Coconuts, ofKors Bakery, ofKors Cafe, Turmeric
 * Indian Bar & Grill, Cinnaholic South Tampa. HOLDs write nothing:
 * Detwiler's (which location), Swamp Puppy (mobile), Anna Maria Island
 * (destination), Cross Creek Gourmet, Lumley's, 73° Flea, Big Bend next
 * date, Rays nights. Recurring markets and dated 727living rows go to
 * wf_events only. Farmer's Milk / Frog Pond SPB / Frog Pond Downtown /
 * Night Market Sep 2 are already_in — no second row.
 *
 *   node scripts/ingest-verified-2026-08-29e.mjs            # DRY RUN
 *   node scripts/ingest-verified-2026-08-29e.mjs --commit   # write wf_inventory + wf_events
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const COMMIT = process.argv.includes("--commit");
const BATCH = JSON.parse(readFileSync(join(ROOT, "data/atlas/owner-batch-2026-08-29e.json"), "utf8"));

export const OWNER_BATCH = BATCH;
// Literal pin — a drifted batch JSON cannot silently retarget ingest.
// test-owner-places-2026-08-29e greps this ChIJ string in THIS file.
export const PINNED_IDS = {
  frogPondNrb: "ChIJbyotrqf-wogRJwMPtUFijn8",
};
export const EXPECT = Object.fromEntries(
  BATCH.places.filter((p) => p.placeId).map((p) => [p.key, p.placeId]),
);
export const ALREADY_IN = BATCH.places.filter((p) => p.status === "already_in");
export const HOLD_GOOGLE_ID = BATCH.places.filter((p) => p.status === "hold_google_id");
export const HOLDS = BATCH.holds;
for (const p of BATCH.places.filter((x) => x.status === "add")) {
  if (PINNED_IDS[p.key] !== p.placeId) {
    console.error(`PINNED_IDS drift: ${p.key} file=${PINNED_IDS[p.key]} batch=${p.placeId}`);
    process.exit(1);
  }
}
for (const p of HOLD_GOOGLE_ID) {
  if (p.placeId) {
    console.error(`hold_google_id ${p.name} must not invent a placeId (got ${p.placeId})`);
    process.exit(1);
  }
}

const NEW_PLACES = BATCH.places.filter((p) => p.status === "add");
const nowIso = new Date().toISOString();
const report = {
  created: [],
  flagged: [],
  holds: HOLDS.slice(),
  hold_google_id: HOLD_GOOGLE_ID.map((p) => ({ name: p.name, address: p.address })),
  already_in: ALREADY_IN.map((p) => ({ name: p.name, place_id: p.placeId })),
  events: [],
};

console.log(`\ningest-verified-2026-08-29e ${COMMIT ? "(COMMIT)" : "(DRY RUN)"} — Places API off\n`);
console.log("── already-in (nothing written) ──");
for (const p of ALREADY_IN) console.log(`  ↻ ${p.name.padEnd(46)} ${p.placeId}  ${p.note}`);

console.log("\n── hold Google id (nothing written — no Places) ──");
for (const p of HOLD_GOOGLE_ID) {
  const pin = p.lat != null && p.lng != null ? `${p.lat}, ${p.lng} (${p.coordSource || "coords"})` : "address only";
  console.log(`  ✗ ${p.name.padEnd(46)} ${p.address}  ${pin}`);
}

const staged = [];
for (const c of NEW_PLACES) {
  if (!c.placeId || !Number.isFinite(c.lat) || !Number.isFinite(c.lng)) {
    report.flagged.push({ want: c.name, why: "ADD row missing public placeId or coords — fail-closed, not Places" });
    console.log(`  ⚠ ${c.name}: FLAGGED (missing public pin) — not staged`);
    continue;
  }
  if (PINNED_IDS[c.key] !== c.placeId) {
    report.flagged.push({ want: c.name, why: `PINNED_IDS drift ${c.placeId}` });
    continue;
  }
  const row = {
    place_id: c.placeId, name: c.name, lat: c.lat, lng: c.lng,
    category: c.wantCategory, tags: [], google_types: c.types,
    primary_type: c.primaryType, metro: c.metro,
    signals: {},
    editorial: c.knownFor, photo_ref: null,
    status: "OPERATIONAL", anchor: false, source: "owner-verified",
    needs_review: false, last_verified_at: nowIso, locked: true,
  };
  staged.push({ c, row, addr: c.address, already: false, skippedHook: false });
  console.log(`  ＋ ${c.name.padEnd(46)} ${c.placeId}  ${c.address}  (batch pin, no Places)`);
}

console.log("\n── holds (nothing written) ──");
for (const h of HOLDS) console.log(`  ✗ ${h.name.padEnd(52)} ${h.status}`);

const hard = report.flagged.filter((f) => !f.soft);
if (hard.length) {
  console.error("\nHARD FLAGS present — fix them before --commit can write place rows:");
  for (const f of hard) console.error(`  • ${f.want}: ${f.why}`);
  process.exit(1);
}
if (!COMMIT) {
  console.log(`\nDRY RUN — would write ${staged.length} place rows and ${BATCH.events.length} events. Re-run with --commit.`);
  process.exit(0);
}

if (existsSync(join(ROOT, ".env.local"))) {
  for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']+$/g, "");
  }
}
const URL_ = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
const SVC = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const miss = [!URL_ && "SUPABASE_URL", !SVC && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean);
if (miss.length) { console.error("missing env: " + miss.join(", ")); process.exit(1); }
const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };

if (staged.length) {
  for (const s of staged) {
    const dup = await fetch(`${URL_}/rest/v1/wf_inventory?place_id=eq.${encodeURIComponent(s.row.place_id)}&select=place_id,name,editorial,source,signals,photo_ref`, { headers: H }).then((r) => r.json());
    const existing = Array.isArray(dup) && dup[0] ? dup[0] : null;
    if (existing) {
      s.already = true;
      const priorEd = existing.editorial;
      const hasBetter = !!(priorEd && String(priorEd).trim().length >= 20);
      if (hasBetter) { s.row.editorial = priorEd; s.skippedHook = true; }
      // 2026-08-30 — A PIN MUST NOT COST A PLACE ITS RATING OR ITS PHOTO.
      // The staged row carries `signals: {}` and `photo_ref: null` because
      // this ingest is fail-closed on Places: it has no rating to state and no
      // photo to fetch. Upserting those literals over a row that ALREADY holds
      // them is not "no new data", it is DELETION — and the rails gate on
      // reviews >= 100 and rating >= 4.3, so the place silently leaves every
      // rail it was earning, wearing a monogram where its photo was.
      //
      // Caught before it shipped on Dive Cocktail Den (4.7 / 47) and Campfired
      // (4.3 / 415, $$), both of which pre-existed this batch with real
      // signals and a photo. An empty pin never overwrites a full field.
      if (existing.signals && Object.keys(existing.signals).length) s.row.signals = existing.signals;
      if (existing.photo_ref) s.row.photo_ref = existing.photo_ref;
    }
    // …AND A ROW WE COULD NOT MEASURE IS STALE BY DEFINITION.
    // wf_inventory stamps refreshed_at = now() on insert, and
    // /api/cron/inventory-refresh only looks at rows OLDER than 30 days,
    // stalest-first. So a fail-closed pin — no rating, no reviews, no photo —
    // lands looking freshly refreshed and is skipped for a month, which is a
    // month of being invisible on every rail (the gate is reviews >= 100 and
    // rating >= 4.3) wearing a monogram. Backdating puts it at the FRONT of
    // the very next hourly pass, which is the truth: nothing about this row
    // has ever been measured. A row that DOES carry signals is left alone.
    if (!s.row.signals || !Object.keys(s.row.signals).length) s.row.refreshed_at = "2000-01-01T00:00:00.000Z";
  }
  const res = await fetch(`${URL_}/rest/v1/wf_inventory?on_conflict=place_id`, {
    method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(staged.map((s) => s.row)),
  });
  if (!res.ok) { console.error(`place upsert failed ${res.status}: ${(await res.text()).slice(0, 300)}`); process.exit(1); }
  report.created = staged.map((s) => ({ name: s.row.name, place_id: s.row.place_id, metro: s.row.metro, category: s.row.category, upgraded: s.already, skippedHook: s.skippedHook }));
  console.log(`  ✓ upserted ${staged.length} place rows`);
}

{
  const seen = new Date().toISOString();
  const ids = staged.map((s) => s.row.place_id);
  if (ids.length) {
    const invRows = await fetch(`${URL_}/rest/v1/wf_inventory?place_id=in.(${ids.map((i) => `"${i}"`).join(",")})&select=place_id,name,lat,lng,category,signals`, { headers: H }).then((r) => r.json());
    if (!Array.isArray(invRows) || invRows.length !== ids.length) {
      console.error(`index upsert aborted: expected ${ids.length} inventory rows to mirror, got ${Array.isArray(invRows) ? invRows.length : "error"}`);
      process.exit(1);
    }
    const idx = await fetch(`${URL_}/rest/v1/wf_place_ids`, {
      method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(invRows.map((r) => ({ place_id: r.place_id, name: r.name, lat: r.lat, lng: r.lng, category: r.category, signals: r.signals, seen_at: seen }))),
    });
    if (!idx.ok) { console.error(`wf_place_ids upsert failed ${idx.status}: ${(await idx.text()).slice(0, 300)}`); process.exit(1); }
    console.log(`  ✓ wf_place_ids index: ${invRows.length} ids mirrored`);
  }
}

{
  const now = new Date().toISOString();
  const rows = BATCH.events.map((e) => {
    const { ...rest } = e;
    return { ...rest, last_verified_at: now };
  });
  const ev = await fetch(`${URL_}/rest/v1/wf_events?on_conflict=event_id`, {
    method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!ev.ok) { console.error(`events upsert failed ${ev.status}: ${(await ev.text()).slice(0, 300)}`); process.exit(1); }
  report.events = rows.map((r) => r.event_id);
  console.log(`  ✓ wf_events: ${rows.length} rows (TBM markets + dated 727living + fall festivals)`);
}

console.log("\n── created ──");
for (const c of report.created) console.log(`  ${c.upgraded ? "↻" : "✓"} ${c.name.padEnd(46)} ${c.place_id}  ${c.metro}/${c.category}`);
console.log(`\ndone: ${report.created.length} written, ${ALREADY_IN.length} already-in, ${HOLD_GOOGLE_ID.length} google-id holds, ${HOLDS.length} held, ${report.events.length} events.\n`);
