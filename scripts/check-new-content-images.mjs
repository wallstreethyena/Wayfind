#!/usr/bin/env node
// scripts/check-new-content-images.mjs — apply lib/imagePublicationGate.js to
// content that is NEW or CHANGED versus origin/main: places, events, guides, blog.
//
//   node scripts/check-new-content-images.mjs                 # git diff origin/main...HEAD
//   node scripts/check-new-content-images.mjs --files a b c   # pure mode (tests inject paths)
//
// WHERE EACH CONTENT TYPE LIVES (and what this runner reads):
//   events  data/*.json (e.g. halloween-release-2026-10-13.json, fall-2026-*.json:
//           records with event_id) and lib/*.js event registries
//           (lib/fall*.js, lib/curated*.js ...: exported rows with hero_image).
//   guides  data/guide-pick-photos/<slug>.json (source of truth for pick/hero photos).
//   places  lib/*.js rows with place_id + an image key, data/*.json place rows, and
//           supabase/migrations/*.sql statements that write hero_image / photo_url /
//           image_url (URL-looking literals in those statements are checked).
//   blog    CROSS-REPO GAP: the blog lives in a SEPARATE repository; this repo has no
//           blog posts. The rule is wired anyway for content/blog, data/blog and
//           app/blog (.json, or .md/.mdx frontmatter image|hero_image|cover|og_image),
//           so a blog added here is gated. Blog posts in the other repo are NOT
//           covered until that repo runs this runner (copy the two files).
//
// "NEW or CHANGED" is per RECORD, not per file: a record is checked only if its id
// or its image string appears on an added line of the diff, so legacy records in a
// touched file are not re-litigated. --files mode checks every record in the files.
// A record with NO image passes: "no photo, neutral fallback" is a valid state.
//
// NEVER fetches a URL. Judges the reference, source, attribution and honesty only.
// If origin/main is unavailable (shallow clone), the runner says so and scans 0 files
// rather than failing the build (the same posture as check-guide-cta-single-capture).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkImageRecord } from "../lib/imagePublicationGate.js";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PROVENANCE_FILE = "data/fall-festival-photo-provenance.json";
const SKIP = [/^data\/guide-pick-photos\/_reports\//, /license-evidence/, /^lib\/imagePublicationGate\.js$/, /^lib\/guidePickPhotoManifest\.js$/, /^lib\/guideCardPhotoIndex\.js$/, new RegExp("^" + PROVENANCE_FILE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$")];
const BLOG_RX = /(^|\/)(content|data|app)\/blog\/.+\.(json|md|mdx)$/;
const REC_IMAGE_KEYS = ["hero_image", "image", "photo_url", "image_url", "photo"];

export function classifyFile(rel) {
  if (SKIP.some((r) => r.test(rel))) return null;
  if (BLOG_RX.test(rel)) return "blog";
  if (/^data\/guide-pick-photos\/[^/]+\.json$/.test(rel)) return "guide-pick";
  if (/^data\/.+\.json$/.test(rel)) return "data-json";
  if (/^lib\/[^/]+\.js$/.test(rel)) return "lib-js";
  if (/^supabase\/migrations\/.+\.sql$/.test(rel)) return "sql";
  return null;
}

function typeFor(rec, rel) {
  if (rec.event_id || /event|fall|halloween|christmas|curated/i.test(rel)) return rec.place_id && !rec.event_id && !/event|fall|halloween|christmas/i.test(rel) ? "place" : "event";
  if (/guide/i.test(rel) || rec.picks) return "guide";
  return "place";
}

function walk(node, visit, depth = 0, seen = new Set()) {
  if (!node || typeof node !== "object" || depth > 8 || seen.has(node)) return;
  seen.add(node);
  if (!Array.isArray(node) && REC_IMAGE_KEYS.some((k) => k in node)) visit(node);
  for (const v of Array.isArray(node) ? node : Object.values(node)) walk(v, visit, depth + 1, seen);
}

function fm(text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split("\n")) {
    const kv = /^([A-Za-z_]+)\s*:\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, "").trim();
  }
  return out;
}

/** Extract { rec, ctxType } records from one file. Returns { records, skipped }. */
export async function extractRecords(rel, text) {
  const kind = classifyFile(rel);
  const records = [];
  let skipped = 0;
  const push = (rec, type) => records.push({ rec, type, file: rel });
  if (!kind) return { records, skipped };
  if (kind === "guide-pick") {
    let d; try { d = JSON.parse(text); } catch { return { records, skipped: 1 }; }
    const slug = d.slug || rel;
    for (const [n, e] of Object.entries(d.picks || {})) push({ ...e, id: `${slug}:${n}` }, "guide");
    if (d.hero && typeof d.hero === "object") push({ ...d.hero, id: `${slug}:hero` }, "guide");
  } else if (kind === "data-json") {
    let d; try { d = JSON.parse(text); } catch { return { records, skipped: 1 }; }
    walk(d, (n) => push(n, typeFor(n, rel)));
  } else if (kind === "blog") {
    if (rel.endsWith(".json")) {
      let d; try { d = JSON.parse(text); } catch { return { records, skipped: 1 }; }
      walk(d, (n) => push(n, "blog"));
    } else {
      const f = fm(text);
      const key = ["image", "hero_image", "cover", "cover_image", "og_image", "thumbnail"].find((k) => k in f);
      if (key) push({ ...f, id: rel, image: f[key] }, "blog");
    }
  } else if (kind === "lib-js") {
    if (!/\b(hero_image|photo_url|image_url)\b/.test(text)) return { records, skipped };
    try {
      const mod = await import(pathToFileURL(path.join(REPO, rel)).href);
      walk(Object.values(mod), (n) => push(n, typeFor(n, rel)));
    } catch { skipped = 1; }
  } else if (kind === "sql") {
    const type = /wf_events/.test(text) ? "event" : /guide/i.test(rel) ? "guide" : "place";
    for (const stmt of text.split(";")) {
      if (!/\b(hero_image|photo_url|image_url)\b/i.test(stmt)) continue;
      for (const m of stmt.matchAll(/'((?:[^']|'')*)'/g)) {
        const lit = m[1].replace(/''/g, "'");
        if (/^(?:https?:|javascript:|data:|\/\/)/i.test(lit) && /\.(?:jpe?g|png|webp|avif|gif|svg)\b|^javascript:|^data:|^http:|\/api\/photo/i.test(lit)
          || /^\/(?:[\w-]+\/)+[\w.-]+\.(?:jpe?g|png|webp|avif|gif|svg)$/i.test(lit) || /^(?:undefined|null)$/i.test(lit)) {
          push({ id: `${path.basename(rel)}`, image: lit }, type);
        }
      }
    }
  }
  return { records, skipped };
}

function loadProvenance() {
  try { return JSON.parse(readFileSync(path.join(REPO, PROVENANCE_FILE), "utf8")); } catch { return {}; }
}

function addedText(rel, base) {
  if (!base) return null;
  try {
    const out = execFileSync("git", ["diff", "-U0", `${base}...HEAD`, "--", rel], { cwd: REPO, encoding: "utf8", maxBuffer: 64 << 20 });
    return out.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).join("\n");
  } catch { return null; }
}

function recordIsNew(rec, added) {
  if (added === null) return true;
  const ids = [rec.event_id, rec.id, rec.slug, rec.place_id, rec.placeId].filter((s) => typeof s === "string" && s);
  if (ids.some((s) => added.includes(s))) return true;
  for (const k of REC_IMAGE_KEYS.concat("src")) {
    const v = rec[k];
    if (typeof v === "string" && (added.includes(`"${v}"`) || added.includes(`'${v}'`) || (v && added.includes(v)))) return true;
  }
  return false;
}

/** Pure core: files -> { scanned, checked, problems, skipped }. */
export async function scanFiles(files, { base = null } = {}) {
  const provenance = loadProvenance();
  const problems = [];
  let scanned = 0, checked = 0, skipped = 0;
  const byType = { place: 0, event: 0, guide: 0, blog: 0 };
  for (const rel of files) {
    const kind = classifyFile(rel);
    if (!kind) continue;
    const abs = path.isAbsolute(rel) ? rel : path.join(REPO, rel);
    if (!existsSync(abs)) { problems.push({ file: rel, code: "IMG_FILE_UNREADABLE", message: `${rel}: file not found` }); continue; }
    scanned += 1;
    const text = readFileSync(abs, "utf8");
    const { records, skipped: sk } = await extractRecords(rel, text);
    skipped += sk;
    const added = addedText(rel, base);
    for (const { rec, type } of records) {
      if (!recordIsNew(rec, added)) continue;
      checked += 1; byType[type] += 1;
      const r = checkImageRecord(rec, { type, provenance });
      for (const p of r.problems) problems.push({ file: rel, ...p });
    }
  }
  return { scanned, checked, problems, skipped, byType };
}

function gitBase() {
  try {
    execFileSync("git", ["rev-parse", "--verify", "origin/main"], { cwd: REPO, stdio: "ignore" });
    return "origin/main";
  } catch { return null; }
}

async function main() {
  const argv = process.argv.slice(2);
  let files, base = null, mode;
  const fi = argv.indexOf("--files");
  if (fi >= 0) {
    files = argv.slice(fi + 1).map((f) => (path.isAbsolute(f) ? f : f.replace(/^\.\//, "")));
    mode = "--files";
  } else {
    base = gitBase();
    mode = "git diff origin/main...HEAD";
    if (!base) {
      console.log("check-new-content-images: OK — origin/main not available (shallow clone); 0 files scanned, nothing to compare against");
      return 0;
    }
    files = execFileSync("git", ["diff", "--name-only", "--diff-filter=AMR", "origin/main...HEAD"], { cwd: REPO, encoding: "utf8" }).split("\n").filter(Boolean);
  }
  // In --files mode paths outside the repo (temp fixtures) are classified by their repo-relative-looking name.
  const mapped = files.map((f) => f);
  const res = await scanFilesMode(mapped, base);
  if (res.problems.length) {
    console.error(`check-new-content-images: FAIL — ${res.problems.length} problem(s) in ${res.scanned} content file(s) (${res.checked} new/changed record(s) checked)`);
    for (const p of res.problems) console.error(`  ✗ [${p.code}] ${p.file}: ${p.message}`);
    return 1;
  }
  console.log(`check-new-content-images: OK — ${res.scanned} new/changed content file(s) scanned via ${mode}, ${res.checked} record(s) checked (place ${res.byType.place}, event ${res.byType.event}, guide ${res.byType.guide}, blog ${res.byType.blog}); ${res.skipped} unloadable. False-positive surface: only image refs PRESENT on new/changed records can fail; no-image records and the neutral fallback always pass; hosts outside commons/flickr/unsplash/pexels/own origin/Google /api/photo are rejected; the blog repo is not covered.`);
  return 0;
}

// Absolute --files paths (temp fixtures) are read in place; repo-relative ones are classified as-is.
async function scanFilesMode(files, base) {
  const abs = files.filter((f) => path.isAbsolute(f));
  if (!abs.length) return scanFiles(files, { base });
  const out = { scanned: 0, checked: 0, problems: [], skipped: 0, byType: { place: 0, event: 0, guide: 0, blog: 0 } };
  for (const f of files) {
    let r;
    if (path.isAbsolute(f)) {
      // Classify a temp fixture by its basename's repo-style prefix: tmp dirs mirror the repo layout.
      const rel = f.replace(/^.*?\/(data|lib|supabase|content|app)\//, "$1/");
      r = await scanFilesFromText(rel, f);
    } else r = await scanFiles([f], { base });
    out.scanned += r.scanned; out.checked += r.checked; out.skipped += r.skipped;
    out.problems.push(...r.problems);
    for (const k of Object.keys(out.byType)) out.byType[k] += r.byType[k];
  }
  return out;
}

async function scanFilesFromText(rel, abs) {
  const res = { scanned: 0, checked: 0, problems: [], skipped: 0, byType: { place: 0, event: 0, guide: 0, blog: 0 } };
  if (!classifyFile(rel)) return res;
  if (!existsSync(abs)) { res.problems.push({ file: rel, code: "IMG_FILE_UNREADABLE", message: `${abs}: file not found` }); return res; }
  res.scanned = 1;
  const { records, skipped } = await extractRecords(rel, readFileSync(abs, "utf8"));
  res.skipped = skipped;
  const provenance = loadProvenance();
  for (const { rec, type } of records) {
    res.checked += 1; res.byType[type] += 1;
    for (const p of checkImageRecord(rec, { type, provenance }).problems) res.problems.push({ file: rel, ...p });
  }
  return res;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((c) => process.exit(c), (e) => { console.error("check-new-content-images: crashed — " + (e && e.stack || e)); process.exit(2); });
}
