#!/usr/bin/env node
/**
 * scripts/check-inventory-select-columns.mjs
 *
 * Every column a route asks wf_inventory for must actually exist. PostgREST
 * fails the WHOLE select when one column is unknown, so a single stale name
 * (2026-10-20: /api/events/christmas asked for `photo_url`; the real column is
 * `photo_ref`) silently empties every place card that query feeds. Live
 * symptom: /api/events/christmas reported sourceFailures: 2 and Sentry logged
 * "column wf_inventory.photo_url does not exist" 280+ times.
 *
 * What it checks (code only, comments stripped):
 *   - supabase.from("wf_inventory").select(<string literal | const NAME>)
 *   - REST URLs containing wf_inventory?select=<columns>
 * Each selected column (aliases `a:b` resolved to b; embeds `x(...)`, `*`,
 * `count` skipped) must be in WF_INVENTORY_COLUMNS, the live column list read
 * from Supabase information_schema on 2026-10-23. A migration that adds a
 * column must add it here too.
 */
// STRUCTURAL-ONLY: the truth is the live wf_inventory schema, which CI cannot reach, and a Next route.js may not export its column list; the scan carries negative, positive and REST controls.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const WF_INVENTORY_COLUMNS = new Set(("place_id,name,lat,lng,category,tags,google_types,primary_type,metro,signals,editorial,photo_ref,status,anchor,source,needs_review,last_verified_at,locked,seen_at,refreshed_at,editorial_card,cuisines,cuisine_confidence,cuisine_sources,cuisine_reason,cuisine_checked_at,cuisine_conf,excluded,exclusion_reason,secondary_categories,locality,county,independent_coords").split(","));

const ROOTS = ["app", "lib"];
const EXT = /\.(?:m?js|jsx|ts|tsx)$/;

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXT.test(name)) out.push(p);
  }
  return out;
}

// Strip comments but keep string contents (columns live inside strings).
function stripComments(src) {
  let out = "", i = 0, q = null;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (q) {
      out += c;
      if (c === "\\") { out += n ?? ""; i += 2; continue; }
      if (c === q) q = null;
      i++; continue;
    }
    if (c === "/" && n === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") q = c;
    out += c; i++;
  }
  return out;
}

function columnsOf(list) {
  return list.split(",").map((t) => t.trim()).filter(Boolean)
    .filter((t) => !t.includes("(") && !t.includes(")") && t !== "*" && !/^count\b/.test(t))
    .map((t) => t.replace(/::\w+$/, ""))                      // cast  col::text
    .map((t) => (t.includes(":") ? t.split(":").pop().trim() : t)) // alias a:col
    .map((t) => t.split("->")[0].trim());                     // JSON path col->>key
}

export function scanSource(src, file = "<src>") {
  const code = stripComments(src);
  const consts = new Map();
  for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(["'])([^"'`\n]*)\2/g)) consts.set(m[1], m[3]);
  const found = [];
  for (const m of code.matchAll(/\.from\(\s*["']wf_inventory["']\s*\)\s*\.select\(\s*(?:(["'])([^"'`]*)\1|([A-Za-z_$][\w$]*))/g)) {
    const list = m[2] ?? consts.get(m[3]);
    if (list == null) continue; // dynamic select: not provable statically
    found.push({ file, list });
  }
  for (const m of code.matchAll(/wf_inventory\?[^"'`\s]*?select=([^&"'`\s$]+)/g)) found.push({ file, list: decodeURIComponent(m[1]) });
  const bad = [];
  for (const f of found) for (const col of columnsOf(f.list)) if (!WF_INVENTORY_COLUMNS.has(col)) bad.push({ file: f.file, col });
  return { selects: found.length, bad };
}

// Controls: the probe must catch a known bad select and pass a known good one.
const neg = scanSource('const C = "place_id,photo_ref,photo_url"; supabase.from("wf_inventory").select(C)');
const pos = scanSource('supabase.from("wf_inventory").select("place_id, name, lat:lat, why:editorial_card->>whyGo, signals->>reviews, status::text")');
const rest = scanSource('fetch(`${u}/rest/v1/wf_inventory?select=place_id,photo_url&limit=5`)');
const ctl = [];
if (!(neg.selects === 1 && neg.bad.length === 1 && neg.bad[0].col === "photo_url")) ctl.push("negative control (const select with photo_url) not caught");
if (!(pos.selects === 1 && pos.bad.length === 0)) ctl.push("positive control (valid literal select) wrongly flagged");
if (!(rest.selects === 1 && rest.bad.length === 1)) ctl.push("REST control (wf_inventory?select=…photo_url) not caught");
if (ctl.length) { console.error("check-inventory-select-columns: FAIL — " + ctl.join("; ")); process.exit(1); }

const files = ROOTS.flatMap((r) => walk(r, []));
let selects = 0; const bad = [];
for (const f of files) {
  const r = scanSource(readFileSync(f, "utf8"), f);
  selects += r.selects; bad.push(...r.bad);
}
if (selects < 3) { console.error(`check-inventory-select-columns: FAIL — only ${selects} wf_inventory selects found; the probe is not seeing the code`); process.exit(1); }
if (bad.length) {
  for (const b of bad) console.error(`check-inventory-select-columns: FAIL — ${b.file} selects wf_inventory.${b.col}, which does not exist`);
  process.exit(1);
}
console.log(`check-inventory-select-columns: OK — ${selects} wf_inventory selects in ${files.length} files use only the ${WF_INVENTORY_COLUMNS.size} real columns (3 controls passed)`);
