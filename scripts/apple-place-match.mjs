#!/usr/bin/env node
// scripts/apple-place-match.mjs — MANUAL run of the Apple Place ID backfill.
// The scheduled path is app/api/cron/apple-place-match (vercel.json, nightly);
// this CLI runs the SAME job (lib/appleMatchJob.js): same backlog, same shared
// daily ceiling (6,000 backfill units/day inside the 15,000 'apple_maps'
// ledger), same identity rule (lib/applePlaceMatch.js), same storage.
//
//   node scripts/apple-place-match.mjs                 # dry run: matches, writes nothing (still reserves + calls Apple)
//   node scripts/apple-place-match.mjs --write         # store Place IDs / refusals
//   node scripts/apple-place-match.mjs --max 2000 --metro manatee-sarasota --write
//
// ENV (names only): NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, and EITHER APPLE_MAPS_SERVER_TOKEN (portal Maps
// token, Token Type "Server API") OR APPLE_MAPS_TEAM_ID + APPLE_MAPS_KEY_ID +
// APPLE_MAPS_PRIVATE_KEY (.p8 text). See docs/runbooks/map-release-2026-10.md.
import { PROMOTE_METROS, metrosFromRows } from "../lib/promoteIndex.js";
import { appleCredentials, createAppleSearch, ledgerProvisioned, runAppleMatch, pulseNote, CREDENTIALS_MISSING_NOTE, LEDGER_MISSING_NOTE } from "../lib/appleMatchJob.js";

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };
const WRITE = args.includes("--write");
const MAX = Math.max(1, Math.min(6000, Number(opt("--max", 1000)) || 1000));
const ONLY_METRO = opt("--metro", null);
const PER_SECOND = Math.max(1, Math.min(10, Number(opt("--rate", 5)) || 5));

function fail(msg) { console.error(`apple-place-match: ${msg}`); process.exit(2); }
const SB_URL = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SB_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!SB_URL || !SB_KEY) fail("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const sb = { url: SB_URL, key: SB_KEY };

async function main() {
  const creds = appleCredentials(process.env);
  if (!creds) fail(CREDENTIALS_MISSING_NOTE);
  if (!(await ledgerProvisioned({ sb, fetchImpl: fetch }))) fail(LEDGER_MISSING_NOTE);
  let boxes = PROMOTE_METROS;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/wf_promote_metros?select=metro,min_lat,max_lat,min_lng,max_lng,active&active=is.true`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
    if (r.ok) { const live = metrosFromRows(await r.json()); if (Object.keys(live).length) boxes = live; }
  } catch { /* offline fallback */ }
  console.log(`apple-place-match: max ${MAX}, ${WRITE ? "WRITE" : "dry run"}${ONLY_METRO ? `, metro ${ONLY_METRO}` : ""}`);
  const stats = await runAppleMatch({ sb, fetchImpl: fetch, search: createAppleSearch({ creds }), boxes, maxCalls: MAX, write: WRITE, onlyMetro: ONLY_METRO, sleepMs: Math.ceil(1000 / PER_SECOND) });
  console.log(pulseNote(stats));
  console.log(JSON.stringify(stats, null, 1));
}

main().catch((e) => fail(e && e.message ? e.message : String(e)));
