#!/usr/bin/env node
// scripts/anchor-events/apply.mjs — the REVIEWED fix path for anchor events.
//
// anchor-watch finds problems; a person reviews them and commits a fixes file
// (scripts/anchor-events/fixes/*.json). This script applies exactly those
// reviewed edits to wf_events and nothing else.
//
// Fixes file: [{ "event_id": "...", "set": { "<field>": <value> }, "source_url": "https://...", "note": "..." }]
//
// Guard rails (all enforced BEFORE any request):
//   - only ALLOWED fields; anything else refuses the entry
//   - source_url must be https (the evidence for the change)
//   - event_status must be one of the existing vocabulary
//   - lat/lng must be numbers inside Florida's box, and set together
// --dry (DEFAULT) GETs the current row and prints before/after; no PATCH.
// --apply PATCHes with Prefer: return=representation and asserts the returned
// row really holds the new values. Exit non-zero if any entry fails.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Usage: node scripts/anchor-events/apply.mjs [--dry|--apply] [file.json ...]
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sbEnv } from "../../lib/serverCache.js";

export const ALLOWED_FIELDS = Object.freeze(["lat", "lng", "place_id", "official_event_url", "official_ticket_url",
  "start_date", "end_date", "start_time", "end_time", "event_status", "category", "venue", "address",
  "hero_image", "image_alt", "schedule_note", "last_verified_at"]);
export const STATUS_VOCAB = Object.freeze(["scheduled", "postponed", "cancelled", "sold_out"]);
export const FL_BBOX = Object.freeze({ minLat: 24.3, maxLat: 31.1, minLng: -87.7, maxLng: -79.8 });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Returns an array of refusal reasons (empty = entry is acceptable). */
export function validateEntry(e) {
  const why = [];
  if (!e || typeof e !== "object") return ["entry is not an object"];
  if (!e.event_id || typeof e.event_id !== "string") why.push("missing event_id");
  if (typeof e.source_url !== "string" || !/^https:\/\/[^\s/]+\.[^\s/]+/i.test(e.source_url)) why.push("source_url must be an https URL");
  const set = e.set;
  if (!set || typeof set !== "object" || Array.isArray(set) || !Object.keys(set).length) { why.push("set is empty"); return why; }
  for (const k of Object.keys(set)) if (!ALLOWED_FIELDS.includes(k)) why.push(`field not allowed: ${k}`);
  if ("event_status" in set && !STATUS_VOCAB.includes(set.event_status)) why.push(`event_status must be one of ${STATUS_VOCAB.join("/")}`);
  if ("lat" in set !== "lng" in set) why.push("lat and lng must be set together");
  if ("lat" in set && "lng" in set) {
    const lat = Number(set.lat), lng = Number(set.lng);
    if (typeof set.lat === "boolean" || typeof set.lng === "boolean" || set.lat === null || set.lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)
      || lat < FL_BBOX.minLat || lat > FL_BBOX.maxLat || lng < FL_BBOX.minLng || lng > FL_BBOX.maxLng) why.push("lat/lng outside Florida");
  }
  for (const k of ["start_date", "end_date"]) if (k in set && !DATE_RE.test(String(set[k]))) why.push(`${k} must be YYYY-MM-DD`);
  for (const k of ["official_event_url", "official_ticket_url", "hero_image"]) if (k in set && set[k] != null && !/^https:\/\//i.test(String(set[k]))) why.push(`${k} must be https`);
  return why;
}

const sameVal = (a, b) => (typeof a === "number" || typeof b === "number") ? Number(a) === Number(b) : String(a ?? "") === String(b ?? "");

/**
 * @returns {{results: object[], failed: number}}
 * results[i] = { event_id, ok, applied, refused?, error?, diff? }
 */
export async function applyFixes(entries, { fetchImpl, sb, apply = false, log = () => {} }) {
  const h = { apikey: sb.key, Authorization: `Bearer ${sb.key}`, "Content-Type": "application/json" };
  const results = [];
  for (const e of entries) {
    const id = e && e.event_id;
    const why = validateEntry(e);
    if (why.length) { log(`REFUSED ${id || "(no id)"}: ${why.join("; ")}`); results.push({ event_id: id, ok: false, applied: false, refused: why }); continue; }
    const rowUrl = `${sb.url}/rest/v1/wf_events?event_id=eq.${encodeURIComponent(id)}`;
    try {
      const cols = Object.keys(e.set).join(",");
      const g = await fetchImpl(`${rowUrl}&select=event_id,${cols}`, { headers: h, cache: "no-store", signal: AbortSignal.timeout(20000) });
      if (!g.ok) throw new Error(`read HTTP ${g.status}`);
      const cur = await g.json();
      if (!Array.isArray(cur) || cur.length !== 1) throw new Error(`expected exactly 1 row, found ${Array.isArray(cur) ? cur.length : "?"}`);
      const diff = Object.keys(e.set).map((k) => ({ field: k, before: cur[0][k] ?? null, after: e.set[k] }));
      log(`${apply ? "APPLY" : "DRY"} ${id} (${e.source_url})${e.note ? " - " + e.note : ""}`);
      for (const d of diff) log(`   ${d.field}: ${JSON.stringify(d.before)} -> ${JSON.stringify(d.after)}`);
      if (!apply) { results.push({ event_id: id, ok: true, applied: false, diff }); continue; }
      const p = await fetchImpl(rowUrl, { method: "PATCH", headers: { ...h, Prefer: "return=representation" }, body: JSON.stringify(e.set), cache: "no-store", signal: AbortSignal.timeout(20000) });
      if (!p.ok) throw new Error(`patch HTTP ${p.status}`);
      const back = await p.json();
      if (!Array.isArray(back) || back.length !== 1) throw new Error("patch returned no single row");
      const bad = Object.keys(e.set).filter((k) => !sameVal(back[0][k], e.set[k]));
      if (bad.length) throw new Error(`returned row does not hold new value for: ${bad.join(", ")}`);
      log(`   OK ${id} verified from returned row`);
      results.push({ event_id: id, ok: true, applied: true, diff });
    } catch (err) {
      log(`FAILED ${id}: ${String(err && err.message || err)}`);
      results.push({ event_id: id, ok: false, applied: false, error: String(err && err.message || err) });
    }
  }
  return { results, failed: results.filter((r) => !r.ok).length };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  if (apply && args.includes("--dry")) { console.error("apply: choose --dry or --apply, not both"); process.exit(2); }
  let files = args.filter((a) => !a.startsWith("--"));
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixes");
  if (!files.length) files = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => path.join(dir, f));
  const sb = sbEnv();
  if (!sb) { console.error("apply: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"); process.exit(2); }
  let failed = 0, total = 0;
  for (const f of files) {
    let entries;
    try { entries = JSON.parse(readFileSync(f, "utf8")); if (!Array.isArray(entries)) throw new Error("not a list"); }
    catch (e) { console.error(`apply: cannot read ${f}: ${e.message}`); process.exit(1); }
    console.log(`# ${f}: ${entries.length} entr${entries.length === 1 ? "y" : "ies"} (${apply ? "APPLY" : "dry run"})`);
    const r = await applyFixes(entries, { fetchImpl: globalThis.fetch, sb, apply, log: (m) => console.log(m) });
    failed += r.failed; total += entries.length;
  }
  console.log(`apply: ${total - failed}/${total} ok, ${failed} failed (${apply ? "applied" : "dry run, nothing written"})`);
  process.exit(failed ? 1 : 0);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch((e) => { console.error("apply: " + (e && e.stack || e)); process.exit(1); });
