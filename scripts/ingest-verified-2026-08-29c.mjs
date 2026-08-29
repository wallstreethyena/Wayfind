#!/usr/bin/env node
/**
 * ingest-verified-2026-08-29c — owner Florida pin batch (Gabe, 2026-08-29c).
 *
 * Inventory + sourced two-beat editorial only. FAIL-CLOSED: this script
 * never calls Google Places / Place Details / photo backfill. This batch
 * has ZERO public ChIJ pins — every intended ADD is hold_google_id until
 * a ChIJ is copied from a public Maps share URL / named OSM node /
 * official page / Wikipedia / the repo: SoFresh Downtown Sarasota,
 * Mobius Sarasota, Icy-N-Spicy (Miramar), Belladukes Gourmet Market,
 * La Birra Bar Coral Gables, Canelita Cheesecake Coral Gables,
 * Canelita Cheesecake Miami, Divilma Clermont, The Luce St. Pete
 * Beach. HOLDs write nothing: Chicken Guy (location unverified),
 * Sloan's St. Armands, Dirty Sara-Soda, Happy Hands World,
 * Eiswerkstatt (Bern), SoFresh Bradenton, Divilma Orlando. Earlier
 * farm HOLDs stay on the 2026-08-29 batch.
 *
 *   node scripts/ingest-verified-2026-08-29c.mjs            # DRY RUN
 *   node scripts/ingest-verified-2026-08-29c.mjs --commit   # write wf_inventory
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const COMMIT = process.argv.includes("--commit");
const BATCH = JSON.parse(readFileSync(join(ROOT, "data/atlas/owner-batch-2026-08-29c.json"), "utf8"));

export const OWNER_BATCH = BATCH;
// Literal pins — a drifted batch JSON cannot silently retarget ingest.
// This batch has no sourced ChIJ. An ADD with a minted id is a hard fail.
export const PINNED_IDS = {};
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

console.log(`\ningest-verified-2026-08-29c ${COMMIT ? "(COMMIT)" : "(DRY RUN)"} — Places API off\n`);
console.log("── already-in (nothing written) ──");
if (!ALREADY_IN.length) console.log("  (none)");
for (const p of ALREADY_IN) console.log(`  ↻ ${p.name.padEnd(42)} ${p.placeId}  ${p.note}`);

console.log("\n── hold Google id (nothing written — no Places) ──");
for (const p of HOLD_GOOGLE_ID) {
  const pin = p.lat != null && p.lng != null ? `${p.lat}, ${p.lng} (${p.coordSource || "coords"})` : "address only";
  console.log(`  ✗ ${p.name.padEnd(42)} ${p.address}  ${pin}`);
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
  console.log(`  ＋ ${c.name.padEnd(42)} ${c.placeId}  ${c.address}  (batch pin, no Places)`);
}

console.log("\n── holds (nothing written) ──");
for (const h of HOLDS) console.log(`  ✗ ${h.name.padEnd(46)} ${h.status}`);

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

if (!staged.length) {
  console.log("\n── created ──");
  console.log(`\ndone: 0 written, ${ALREADY_IN.length} already-in, ${HOLD_GOOGLE_ID.length} google-id holds, ${HOLDS.length} held, 0 events. Nothing to upsert.\n`);
  process.exit(0);
}

const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };

{
  for (const s of staged) {
    const dup = await fetch(`${URL_}/rest/v1/wf_inventory?place_id=eq.${encodeURIComponent(s.row.place_id)}&select=place_id,name,editorial,source`, { headers: H }).then((r) => r.json());
    const existing = Array.isArray(dup) && dup[0] ? dup[0] : null;
    if (existing) {
      s.already = true;
      const priorEd = existing.editorial;
      const hasBetter = !!(priorEd && String(priorEd).trim().length >= 20);
      if (hasBetter) { s.row.editorial = priorEd; s.skippedHook = true; }
    }
  }
  const res = await fetch(`${URL_}/rest/v1/wf_inventory?on_conflict=place_id`, {
    method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(staged.map((s) => s.row)),
  });
  if (!res.ok) { console.error(`place upsert failed ${res.status}: ${(await res.text()).slice(0, 300)}`); process.exit(1); }
  report.created = staged.map((s) => ({ name: s.row.name, place_id: s.row.place_id, metro: s.row.metro, category: s.row.category, upgraded: s.already, skippedHook: s.skippedHook }));
  console.log(`  ✓ upserted ${staged.length} place rows`);
}

console.log("\n── created ──");
for (const c of report.created) console.log(`  ${c.upgraded ? "↻" : "✓"} ${c.name.padEnd(46)} ${c.place_id}  ${c.metro}/${c.category}`);
console.log(`\ndone: ${report.created.length} written, ${ALREADY_IN.length} already-in, ${HOLD_GOOGLE_ID.length} google-id holds, ${HOLDS.length} held, ${report.events.length} events.\n`);
