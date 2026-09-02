#!/usr/bin/env node
/**
 * Seed the owner supplied 2026 Fall in Florida discoveries.
 *
 * All coordinates and dates are already verified in the owned data module.
 * This script deliberately performs no Google lookup and creates no provider
 * spend. It is idempotent on event_id.
 *
 *   node scripts/seed-fall-discoveries-2026.mjs --dry
 *   node scripts/seed-fall-discoveries-2026.mjs
 */
import { readFileSync } from "node:fs";
import { FALL_DISCOVERIES_2026 } from "../lib/fallDiscoveries2026.js";

const DRY = process.argv.includes("--dry");

function env() {
  const out = { ...process.env };
  try {
    for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match) out[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return out;
}

const rows = FALL_DISCOVERIES_2026.map((row) => ({ ...row }));
const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
const normalized = rows.map((row) => Object.fromEntries(keys.map((key) => [key, row[key] ?? null])));

if (DRY) {
  console.log(`seed-fall-discoveries-2026: DRY OK, ${normalized.length} rows prepared, zero provider calls, nothing written`);
  process.exit(0);
}

const E = env();
const SUPA = E.NEXT_PUBLIC_SUPABASE_URL;
const KEY = E.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA || !KEY) {
  console.error("seed-fall-discoveries-2026: missing Supabase environment");
  process.exit(1);
}

const response = await fetch(`${SUPA}/rest/v1/wf_events?on_conflict=event_id`, {
  method: "POST",
  headers: {
    apikey: KEY,
    authorization: `Bearer ${KEY}`,
    "content-type": "application/json",
    prefer: "resolution=merge-duplicates,return=representation",
  },
  body: JSON.stringify(normalized),
});

if (!response.ok) {
  console.error(`seed-fall-discoveries-2026: FAIL ${response.status}, ${await response.text()}`);
  process.exit(1);
}

const written = await response.json();
const ids = new Set(written.map((row) => row.event_id));
const missing = normalized.filter((row) => !ids.has(row.event_id)).map((row) => row.event_id);
if (written.length !== normalized.length || missing.length) {
  console.error(`seed-fall-discoveries-2026: FAIL verification, wrote ${written.length}/${normalized.length}; missing ${missing.join(", ")}`);
  process.exit(1);
}

console.log(`seed-fall-discoveries-2026: OK, ${written.length} rows upserted and returned`);
