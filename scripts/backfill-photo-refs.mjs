#!/usr/bin/env node
// scripts/backfill-photo-refs.mjs — give every photo-less inventory row its
// Google photo resource name.
//
// WHY. /api/city/unlock's FIELD_MASK omitted places.photos for its entire
// life, so all 12 unlocked metros (miami, new-york-ny, chicago-il, dubai…)
// carry photo_ref = NULL on ~1,100 rows while core metros sit at 94–99%
// coverage — every unlocked-city card renders a blank thumbnail. The route is
// fixed as of the same commit that adds this script; this is the one-time
// catch-up for the rows already in the table.
//
// COSTS MONEY, deliberately metered: one Place Details GET per row, photos
// field only (Essentials tier — a few dollars for the full ~1,100-row pass).
// Run per-metro to spread it if you like:
//   node scripts/backfill-photo-refs.mjs --dry          # count + sample, no Google, no writes
//   node scripts/backfill-photo-refs.mjs miami          # one metro
//   node scripts/backfill-photo-refs.mjs                # every photo-less row
//
// A row whose place has no photos on Google is left NULL (a fact, not a
// failure) and reported at the end; a 404/NOT_FOUND place id is reported so
// the atlas can retire it. Idempotent: only rows with photo_ref IS NULL are
// ever selected or written.
import { readFileSync } from "fs";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const metroArg = args.find((a) => !a.startsWith("--")) || null;

function env() {
  let url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  let gkey = process.env.GOOGLE_MAPS_SERVER_KEY || "";
  if (!url || !key || !gkey) {
    try {
      const f = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
      const g = (k) => (f.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "") || "";
      url = url || g("SUPABASE_URL") || g("NEXT_PUBLIC_SUPABASE_URL");
      key = key || g("SUPABASE_SERVICE_ROLE_KEY");
      gkey = gkey || g("GOOGLE_MAPS_SERVER_KEY");
    } catch (e) {}
  }
  return { url, key, gkey };
}
const { url, key, gkey } = env();
if (!url || !key) {
  console.error("backfill-photo-refs: no Supabase service credentials. Refusing to report a backfill I could not run.");
  process.exit(2);
}
if (!dry && !gkey) {
  console.error("backfill-photo-refs: no GOOGLE_MAPS_SERVER_KEY. Use --dry to count, or set the key to fetch.");
  process.exit(2);
}
const H = { apikey: key, authorization: "Bearer " + key, "content-type": "application/json" };

async function rest(path, init) {
  const r = await fetch(`${url}/rest/v1/${path}`, { ...(init || {}), headers: { ...H, ...(init?.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json();
}

// The exact shape /api/photo's proxy guard (REF_RX) accepts, and what every
// core-metro row already stores. Anything else must never reach photo_ref.
const REF_RX = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

async function photoNameFor(placeId) {
  const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { "X-Goog-Api-Key": gkey, "X-Goog-FieldMask": "photos" },
  });
  if (r.status === 404) return { gone: true };
  if (!r.ok) throw new Error(`google ${r.status}`);
  const d = await r.json();
  const name = d.photos && d.photos[0] && d.photos[0].name;
  return { name: name && REF_RX.test(name) ? name : null };
}

async function pool(items, n, fn) {
  const q = items.slice();
  await Promise.all(Array.from({ length: n }, async () => { while (q.length) { const it = q.shift(); await fn(it); } }));
}

const rows = await rest(
  `wf_inventory?select=place_id,name,metro&photo_ref=is.null&status=not.eq.retired${metroArg ? `&metro=eq.${encodeURIComponent(metroArg)}` : ""}&limit=2000`
);
const byMetro = {};
for (const r of rows) byMetro[r.metro] = (byMetro[r.metro] || 0) + 1;
console.log(`backfill-photo-refs: ${rows.length} photo-less row(s)`, byMetro);
if (dry) {
  console.log("dry run — no Google calls, no writes.");
  process.exit(0);
}

let filled = 0, none = 0, gone = 0, failed = 0, done = 0;
const noneList = [], goneList = [];
await pool(rows, 4, async (row) => {
  try {
    const res = await photoNameFor(row.place_id);
    if (res.gone) { gone += 1; goneList.push(`${row.metro} ${row.name}`); }
    else if (!res.name) { none += 1; noneList.push(`${row.metro} ${row.name}`); }
    else {
      await rest(`wf_inventory?place_id=eq.${encodeURIComponent(row.place_id)}&photo_ref=is.null`, {
        method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ photo_ref: res.name }),
      });
      filled += 1;
    }
  } catch (e) {
    failed += 1;
    console.error(`  fail ${row.metro} ${row.name}: ${String(e.message).slice(0, 120)}`);
  }
  done += 1;
  if (done % 100 === 0) console.log(`  …${done}/${rows.length}`);
});

console.log(`backfill-photo-refs: filled=${filled} no-photo-on-google=${none} place-gone=${gone} failed=${failed}`);
if (noneList.length) console.log("no photo on Google (left NULL):\n  " + noneList.slice(0, 20).join("\n  ") + (noneList.length > 20 ? `\n  …+${noneList.length - 20} more` : ""));
if (goneList.length) console.log("place id 404 (candidates to retire):\n  " + goneList.join("\n  "));
process.exit(failed > rows.length / 4 ? 1 : 0);
