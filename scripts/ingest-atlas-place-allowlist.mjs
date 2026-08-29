#!/usr/bin/env node
// scripts/ingest-atlas-place-allowlist.mjs — seed wf_place_ids for the 255
// publish-ready Atlas cards FROM wf_inventory we already hold.
//
// Zero Google Place Details / Photos / Places. Fail-closed.
//
//   node scripts/ingest-atlas-place-allowlist.mjs          # dry-run (default)
//   node scripts/ingest-atlas-place-allowlist.mjs --apply  # write; needs service role
//
// --apply without SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY exits 1 and writes
// nothing. Silent Atlas-590 ids are never in the plan. An allowlisted id with
// no inventory row is reported, not invented.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  atlasAllowlistApplyGate,
  listPublishReadyAtlasIds,
  planAtlasAllowlistSeed,
  usableSupabaseEnv,
} from "../lib/atlasPlaceAllowlist.js";
import { missingAtlasEditorial, parseAtlas590 } from "../lib/atlasCards.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APPLY = process.argv.includes("--apply");

function envUrl() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  return raw || "";
}
function serviceKey() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
}
function readKey() {
  return serviceKey() || String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
}

const atlasIds = listPublishReadyAtlasIds();
const cards = JSON.parse(readFileSync(join(ROOT, "data/atlas/editorial-cards.json"), "utf8"));
const atlas590 = parseAtlas590(readFileSync(join(ROOT, "data/atlas/atlas-590.tsv"), "utf8"));
const silentIds = missingAtlasEditorial(atlas590, cards).map((r) => r.place_id);

const url = envUrl();
const svc = serviceKey();
const gate = atlasAllowlistApplyGate({ apply: APPLY, url, serviceKey: svc });

if (APPLY && !gate.write) {
  console.error("ingest-atlas-place-allowlist: FAIL-CLOSED — --apply refused (" + gate.reason + "). No write.");
  process.exit(1);
}

console.log("ingest-atlas-place-allowlist: " + (gate.write ? "APPLY" : "dry-run"));
console.log("  publish-ready Atlas ids: " + atlasIds.length);
console.log("  silent Atlas-590 ids (will not write): " + silentIds.length);

const reader = readKey();
if (!usableSupabaseEnv(url, reader)) {
  const empty = planAtlasAllowlistSeed({ atlasIds, silentIds, inventoryById: new Map() });
  console.log("  credentials absent — not contacting production");
  console.log("  would SELECT wf_inventory for " + atlasIds.length + " ids");
  console.log("  payloads: 0 (no inventory rows read)");
  console.log("  missing inventory: " + empty.missingInventory.length + " (unknown until a keyed SELECT)");
  console.log("  writes: 0");
  process.exit(0);
}

async function fetchInventory(ids) {
  const byId = new Map();
  const headers = { apikey: reader, Authorization: "Bearer " + reader };
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    const q = url + "/rest/v1/wf_inventory?select=place_id,name,lat,lng,category,signals,status&place_id=in.("
      + chunk.map((id) => '"' + encodeURIComponent(id) + '"').join(",") + ")";
    let r;
    try {
      r = await fetch(q, { headers });
    } catch (e) {
      console.error("ingest-atlas-place-allowlist: FAIL-CLOSED — wf_inventory fetch failed. No write.");
      process.exit(1);
    }
    if (!r.ok) {
      console.error("ingest-atlas-place-allowlist: FAIL-CLOSED — wf_inventory read " + r.status + ". No write.");
      process.exit(1);
    }
    const rows = await r.json();
    if (!Array.isArray(rows)) {
      console.error("ingest-atlas-place-allowlist: FAIL-CLOSED — wf_inventory returned a non-array. No write.");
      process.exit(1);
    }
    for (const row of rows) {
      if (row && row.place_id) byId.set(row.place_id, row);
    }
  }
  return byId;
}

const inventoryById = await fetchInventory(atlasIds);
const plan = planAtlasAllowlistSeed({ atlasIds, silentIds, inventoryById });

if (plan.refusedSilent.length) {
  console.error("ingest-atlas-place-allowlist: FAIL-CLOSED — silent ids entered the plan: " + plan.refusedSilent.join(", "));
  process.exit(1);
}

console.log("  inventory hits: " + plan.payloads.length);
console.log("  missing inventory (reported, not invented): " + plan.missingInventory.length);
for (const id of plan.missingInventory.slice(0, 12)) console.log("    - " + id);
if (plan.missingInventory.length > 12) console.log("    … +" + (plan.missingInventory.length - 12) + " more");

if (!gate.write) {
  console.log("  writes: 0 (dry-run)");
  process.exit(0);
}

const seen = new Date().toISOString();
const body = plan.payloads.map((p) => ({ ...p, seen_at: seen }));
const wr = await fetch(url + "/rest/v1/wf_place_ids", {
  method: "POST",
  headers: {
    apikey: svc,
    Authorization: "Bearer " + svc,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=minimal",
  },
  body: JSON.stringify(body),
});
if (!wr.ok) {
  console.error("ingest-atlas-place-allowlist: FAIL-CLOSED — wf_place_ids write " + wr.status + ". " + (await wr.text()).slice(0, 240));
  process.exit(1);
}
console.log("  wrote " + body.length + " wf_place_ids rows from inventory (no Google)");
