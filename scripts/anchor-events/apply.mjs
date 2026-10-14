#!/usr/bin/env node
// scripts/anchor-events/apply.mjs — the REVIEWED fix path for anchor events.
//
// anchor-watch finds problems; a person reviews them and commits a fixes file
// (scripts/anchor-events/fixes/*.json). This script applies exactly those
// reviewed edits to wf_events and nothing else.
//
// Fixes file: [{ "event_id": "...", "set": { "<field>": <new> },
//                "expect": { "<field>": <previous value> },
//                "source_url": "https://...", "note": "..." }]
//
// Guard rails (all enforced BEFORE any write):
//   - only ALLOWED fields; anything else refuses the entry
//   - `expect` must name EVERY field in `set` (and nothing else): the reviewer
//     states the previous value they saw, so a stale review cannot overwrite
//   - source_url must be https (the evidence for the change)
//   - event_status must be one of the existing vocabulary
//   - lat/lng set together: both inside Florida's box, or both null (clear)
//   - the entry must be reversible: the rollback entry it implies has to pass
//     these same rules, otherwise the entry is refused up front
// Per field, against the row read by exact event_id (exactly one row):
//   current == set     -> already-applied: skipped, never overwritten
//   current == expect  -> apply
//   anything else      -> conflict: the WHOLE entry is refused (someone else
//                         changed it; their correction is never overwritten)
// --apply writes with a PATCH that is CONDITIONAL on the expected values
// (event_id=eq.X&field=eq.<expect> / field=is.null) and requires exactly one
// returned row, then re-reads the row and verifies every written field.
// --dry (DEFAULT) reads and prints the plan; it never writes.
// --apply requires --audit <file> (JSONL, one line per changed field) and
// --rollback <file> (a fixes file that undoes this run: set=before, expect=after).
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (the CLI only), GITHUB_RUN_ID (label).
// Usage: node scripts/anchor-events/apply.mjs [--dry|--apply --audit a.jsonl --rollback r.json] file.json [...]
import { readFileSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sbEnv } from "../../lib/serverCache.js";

export const ALLOWED_FIELDS = Object.freeze(["lat", "lng", "place_id", "official_event_url", "official_ticket_url",
  "start_date", "end_date", "start_time", "end_time", "event_status", "category", "venue", "address",
  "hero_image", "hero_image_kind", "image_alt", "schedule_note", "last_verified_at"]);
export const IMAGE_KIND_VOCAB = Object.freeze(["event", "venue"]);
export const STATUS_VOCAB = Object.freeze(["scheduled", "postponed", "cancelled", "sold_out"]);
export const FL_BBOX = Object.freeze({ minLat: 24.3, maxLat: 31.1, minLng: -87.7, maxLng: -79.8 });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (o) => o && typeof o === "object" && !Array.isArray(o);

/** Value equality as the database would see it (null is only equal to null). */
export function sameVal(a, b, field = "") {
  if (a == null || b == null) return a == null && b == null;
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  if (/_at$/.test(field)) { const x = Date.parse(String(a)), y = Date.parse(String(b)); return Number.isFinite(x) && Number.isFinite(y) ? x === y : String(a) === String(b); }
  if (/_time$/.test(field)) { const t = (v) => { const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(v)); return m ? `${m[1].padStart(2, "0")}:${m[2]}:${m[3] || "00"}` : String(v); }; return t(a) === t(b); }
  return String(a) === String(b);
}

/** Returns an array of refusal reasons (empty = entry is acceptable). */
export function validateEntry(e) {
  const why = [];
  if (!e || typeof e !== "object") return ["entry is not an object"];
  if (!e.event_id || typeof e.event_id !== "string") why.push("missing event_id");
  if (typeof e.source_url !== "string" || !/^https:\/\/[^\s/]+\.[^\s/]+/i.test(e.source_url)) why.push("source_url must be an https URL");
  const set = e.set;
  if (!isObj(set) || !Object.keys(set).length) { why.push("set is empty"); return why; }
  for (const k of Object.keys(set)) if (!ALLOWED_FIELDS.includes(k)) why.push(`field not allowed: ${k}`);
  // expect: the previous value of EVERY field in set, nothing more, nothing less.
  if (!isObj(e.expect)) why.push("expect is required: {field: previousValue} for every field in set");
  else {
    for (const k of Object.keys(set)) if (!(k in e.expect)) why.push(`expect missing for field: ${k}`);
    for (const k of Object.keys(e.expect)) if (!(k in set)) why.push(`expect has a field not in set: ${k}`);
    for (const k of Object.keys(set)) if (k in e.expect && sameVal(e.expect[k], set[k], k)) why.push(`expect equals set for ${k} (nothing to change)`);
  }
  if ("event_status" in set && !STATUS_VOCAB.includes(set.event_status)) why.push(`event_status must be one of ${STATUS_VOCAB.join("/")}`);
  if ("hero_image_kind" in set && set.hero_image_kind !== null && !IMAGE_KIND_VOCAB.includes(set.hero_image_kind)) why.push(`hero_image_kind must be one of ${IMAGE_KIND_VOCAB.join("/")} or null`);
  if ("lat" in set !== "lng" in set) why.push("lat and lng must be set together");
  if ("lat" in set && "lng" in set) {
    const clear = set.lat === null && set.lng === null;
    const lat = Number(set.lat), lng = Number(set.lng);
    if (!clear && (typeof set.lat === "boolean" || typeof set.lng === "boolean" || set.lat === null || set.lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)
      || lat < FL_BBOX.minLat || lat > FL_BBOX.maxLat || lng < FL_BBOX.minLng || lng > FL_BBOX.maxLng)) why.push("lat/lng outside Florida");
  }
  for (const k of ["start_date", "end_date"]) if (k in set && set[k] != null && !DATE_RE.test(String(set[k]))) why.push(`${k} must be YYYY-MM-DD`);
  for (const k of ["official_event_url", "official_ticket_url", "hero_image"]) if (k in set && set[k] != null && !/^https:\/\//i.test(String(set[k]))) why.push(`${k} must be https`);
  return why;
}

/** PostgREST filter fragment for "column currently equals v" (URL-encoded). */
export function eqFilter(field, v) {
  return v == null ? `${field}=is.null` : `${field}=eq.${encodeURIComponent(String(v))}`;
}

/** The entry that undoes `applied` ({field: {before, after}}): set=before, expect=after. */
export function rollbackEntry(e, applied, runId) {
  const set = {}, expect = {};
  for (const [f, d] of Object.entries(applied)) { set[f] = d.before; expect[f] = d.after; }
  return { event_id: e.event_id, set, expect, source_url: e.source_url, note: `rollback of ${runId}` };
}

/**
 * @param {object[]} entries
 * @param {object} o  { fetchImpl, sb, apply, log, runId, onChange(change) }
 * @returns {{results: object[], failed: number}}
 * results[i] = { event_id, ok, status, applied, plan?, changes?, refused?, error? }
 *   status: apply | already-applied | conflict | refused | failed | applied
 *   plan[j] = { field, before, after, status: apply|already-applied|conflict }
 *   changes[j] = { field, before, after } (fields really written)
 */
export async function applyFixes(entries, { fetchImpl, sb, apply = false, log = () => {}, runId = "local", onChange = () => {} }) {
  const h = { apikey: sb.key, Authorization: `Bearer ${sb.key}`, "Content-Type": "application/json" };
  const results = [];
  const readRow = async (rowUrl, cols) => {
    const g = await fetchImpl(`${rowUrl}&select=event_id,${cols}`, { headers: h, cache: "no-store", signal: AbortSignal.timeout(20000) });
    if (!g.ok) throw new Error(`read HTTP ${g.status}`);
    const cur = await g.json();
    if (!Array.isArray(cur) || cur.length !== 1) throw new Error(`expected exactly 1 row for event_id, found ${Array.isArray(cur) ? cur.length : "?"}`);
    return cur[0];
  };
  for (const e of entries) {
    const id = e && e.event_id;
    const why = validateEntry(e);
    if (!why.length) {
      // Reversibility: the implied rollback must itself pass the rules.
      const rb = validateEntry(rollbackEntry(e, Object.fromEntries(Object.keys(e.set).map((k) => [k, { before: e.expect[k], after: e.set[k] }])), runId));
      if (rb.length) why.push(`cannot be rolled back under the same rules (${rb.join("; ")})`);
    }
    if (why.length) { log(`REFUSED ${id || "(no id)"}: ${why.join("; ")}`); results.push({ event_id: id, ok: false, applied: false, status: "refused", refused: why }); continue; }
    const rowUrl = `${sb.url}/rest/v1/wf_events?event_id=eq.${encodeURIComponent(id)}`;
    const fields = Object.keys(e.set);
    try {
      // Plan (and, under --apply, the write-time re-check: this read happens
      // immediately before the conditional PATCH, which re-checks again in SQL).
      const cur = await readRow(rowUrl, fields.join(","));
      const plan = fields.map((f) => {
        const before = cur[f] ?? null;
        const status = sameVal(before, e.set[f], f) ? "already-applied" : sameVal(before, e.expect[f], f) ? "apply" : "conflict";
        return { field: f, before, after: e.set[f], status };
      });
      // lat/lng move as a pair: a half-applied pair is a conflict, never patched.
      const la = plan.find((d) => d.field === "lat"), ln = plan.find((d) => d.field === "lng");
      if (la && ln && la.status !== ln.status) { la.status = "conflict"; ln.status = "conflict"; }
      const conflicts = plan.filter((d) => d.status === "conflict");
      const todo = plan.filter((d) => d.status === "apply");
      const status = conflicts.length ? "conflict" : todo.length ? "apply" : "already-applied";
      log(`${apply ? "APPLY" : "DRY"} ${id} [${status}] (${e.source_url})${e.note ? " - " + e.note : ""}`);
      for (const d of plan) log(`   ${d.field}: ${d.status}: ${JSON.stringify(d.before)} -> ${JSON.stringify(d.after)}${d.status === "conflict" ? ` (expected ${JSON.stringify(e.expect[d.field])})` : ""}`);
      if (conflicts.length) {
        log(`CONFLICT ${id}: ${conflicts.map((d) => d.field).join(", ")} changed since review; whole entry refused, nothing written`);
        results.push({ event_id: id, ok: false, applied: false, status: "conflict", plan }); continue;
      }
      if (!todo.length || !apply) { results.push({ event_id: id, ok: true, applied: false, status, plan }); continue; }

      const body = Object.fromEntries(todo.map((d) => [d.field, d.after]));
      const url = `${rowUrl}&${todo.map((d) => eqFilter(d.field, e.expect[d.field])).join("&")}`;
      const p = await fetchImpl(url, { method: "PATCH", headers: { ...h, Prefer: "return=representation" }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(20000) });
      if (!p.ok) throw new Error(`patch HTTP ${p.status}`);
      const back = await p.json();
      if (!Array.isArray(back) || back.length !== 1) throw new Error(`conditional patch matched ${Array.isArray(back) ? back.length : "?"} rows (expected exactly 1): the row changed since it was read, nothing was written`);
      const bad = todo.filter((d) => !sameVal(back[0][d.field], d.after, d.field)).map((d) => d.field);
      if (bad.length) throw new Error(`returned row does not hold new value for: ${bad.join(", ")}`);
      // The change is real from here on: record it before any further check.
      const changes = todo.map((d) => ({ field: d.field, before: d.before, after: d.after }));
      for (const c of changes) onChange({ event_id: id, ...c, source_url: e.source_url, note: e.note ?? null });
      // Independent post-write verification: re-read the row.
      const after = await readRow(rowUrl, fields.join(","));
      const bad2 = fields.filter((f) => !sameVal(after[f], e.set[f], f));
      if (bad2.length) { results.push({ event_id: id, ok: false, applied: true, status: "failed", plan, changes, error: `post-write read does not hold new value for: ${bad2.join(", ")}` }); log(`FAILED ${id}: post-write read mismatch ${bad2.join(", ")}`); continue; }
      log(`   OK ${id} verified from returned row and a fresh read`);
      results.push({ event_id: id, ok: true, applied: true, status: "applied", plan, changes });
    } catch (err) {
      log(`FAILED ${id}: ${String(err && err.message || err)}`);
      results.push({ event_id: id, ok: false, applied: false, status: "failed", error: String(err && err.message || err) });
    }
  }
  return { results, failed: results.filter((r) => !r.ok).length };
}

/** Audit lines (one per changed field) for results. */
export function auditLine(c, { runId, now = new Date() }) {
  return JSON.stringify({ event_id: c.event_id, field: c.field, before: c.before, after: c.after, source_url: c.source_url, note: c.note ?? null, ts: now.toISOString(), run_id: runId });
}

function parseArgs(argv) {
  const o = { apply: false, dry: false, audit: null, rollback: null, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { const v = argv[++i]; if (v == null || v.startsWith("--")) throw new Error(`${a} needs a file path`); return v; };
    if (a === "--apply") o.apply = true;
    else if (a === "--dry") o.dry = true;
    else if (a === "--audit") o.audit = val();
    else if (a === "--rollback") o.rollback = val();
    else if (a.startsWith("--")) throw new Error(`unknown flag ${a}`);
    else o.files.push(a);
  }
  return o;
}

async function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { console.error("apply: " + e.message); process.exit(2); }
  if (o.apply && o.dry) { console.error("apply: choose --dry or --apply, not both"); process.exit(2); }
  if (o.apply && (!o.audit || !o.rollback)) { console.error("apply: --apply requires --audit <file> and --rollback <file> (no write without an audit trail)"); process.exit(2); }
  if (!o.apply && (o.audit || o.rollback)) { console.error("apply: --audit/--rollback only make sense with --apply"); process.exit(2); }
  let files = o.files;
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixes");
  if (!files.length) {
    if (o.apply) { console.error("apply: --apply needs the fixes file(s) named explicitly"); process.exit(2); }
    files = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => path.join(dir, f));
  }
  const sb = sbEnv();
  if (!sb) { console.error("apply: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"); process.exit(2); }
  const runId = String(process.env.GITHUB_RUN_ID || "") || "local"; // label only; never a credential
  const rollback = [];
  if (o.apply) { writeFileSync(o.audit, ""); writeFileSync(o.rollback, "[]\n"); }
  const onChange = (c) => appendFileSync(o.audit, auditLine(c, { runId }) + "\n");
  let failed = 0, total = 0, conflicts = 0;
  for (const f of files) {
    let entries;
    try { entries = JSON.parse(readFileSync(f, "utf8")); if (!Array.isArray(entries)) throw new Error("not a list"); }
    catch (e) { console.error(`apply: cannot read ${f}: ${e.message}`); process.exit(1); }
    console.log(`# ${f}: ${entries.length} entr${entries.length === 1 ? "y" : "ies"} (${o.apply ? "APPLY" : "dry run"})`);
    const r = await applyFixes(entries, { fetchImpl: globalThis.fetch, sb, apply: o.apply, log: (m) => console.log(m), runId, onChange });
    failed += r.failed; total += entries.length; conflicts += r.results.filter((x) => x.status === "conflict").length;
    for (const x of r.results) if (x.changes && x.changes.length) {
      const src = entries.find((en) => en && en.event_id === x.event_id);
      rollback.unshift(rollbackEntry(src, Object.fromEntries(x.changes.map((c) => [c.field, c])), runId));
    }
    if (o.apply) writeFileSync(o.rollback, JSON.stringify(rollback, null, 2) + "\n");
  }
  console.log(`apply: ${total - failed}/${total} ok, ${failed} failed, ${conflicts} conflict(s) (${o.apply ? "applied" : "dry run, nothing written"})`);
  process.exit(failed ? 1 : 0);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch((e) => { console.error("apply: " + (e && e.stack || e)); process.exit(1); });
