#!/usr/bin/env node
// scripts/photo-inventory-audit.mjs — READ-ONLY, ZERO-SPEND, inventory-wide photo audit.
// A reporting TOOL, not a guard (not in scripts/guards.txt). Definitions: docs/PHOTO_AUDIT.md;
// the same inventory numbers as plain SQL: supabase/sql/photo_audit.sql.
//
// Usage:
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/photo-inventory-audit.mjs [--out=audit.json] [--compare=prev.json]
//   node scripts/photo-inventory-audit.mjs --static-only     # no env needed: guides + code surfaces only
//
// ZERO SPEND, by construction: only HTTP GETs against Supabase REST select endpoints. It
// never imports lib/spendGate.js, never calls Google, and never requests /api/photo (if a
// future edit adds one it MUST send header `x-wayfind-photo-probe: 1` and `nospend=1`).
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GUIDES } from "../lib/guides.js";
import { guideRegions } from "../lib/guideIndex.js";
import { DEDICATED_GUIDE_ROUTES } from "../lib/guideDedicatedRoutes.js";
import { guideCardPhoto } from "../lib/guideCardPhoto.js";
import { guideHero } from "../lib/guideHero.js";
import { PHOTO_SURFACES, NON_PHOTO_IMAGE_FILES } from "../lib/photoSurfaces.js";
import { blogTargets, loadBlogTargets } from "../lib/creditedPhotoTargets.js";
import { siteTodayStr } from "../lib/siteTime.js";
import {
  classifyInventory, summarizeOutcomes, guideRungs, guideHeroCoverage, blogPhotoResolution,
  eventImageKinds, histogram, surfaceAudit, compareFlat, headline,
} from "./lib/photoInventoryAudit.mjs";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const flag = (n) => (args.find((a) => a.startsWith(`--${n}=`)) || "").slice(n.length + 3);
const staticOnly = args.includes("--static-only");
const outPath = flag("out");
const comparePath = flag("compare");

const URL_ = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!staticOnly && (!URL_ || !KEY)) {
  console.error([
    "photo-inventory-audit: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (read-only SELECTs).",
    "  SUPABASE_URL=https://<project>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/photo-inventory-audit.mjs --out=audit.json",
    "  No keys? run supabase/sql/photo_audit.sql in the SQL editor, or pass --static-only for the code/guide sections.",
  ].join("\n"));
  process.exit(2);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: "application/json" };
async function select(table, query, pageSize = 1000) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const r = await fetch(`${URL_}/rest/v1/${table}?${query}&limit=${pageSize}&offset=${offset}`, { headers });
    if (!r.ok) throw new Error(`supabase ${r.status} ${table}: ${(await r.text()).slice(0, 200)}`);
    const page = await r.json();
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

const report = { generatedAt: new Date().toISOString(), mode: staticOnly ? "static-only" : "full" };

// ── static: guides ──────────────────────────────────────────────────────────
{
  const today = siteTodayStr();
  const all = {};
  for (const { guides } of guideRegions(GUIDES)) for (const g of guides) { const { slug, ...rest } = g; all[slug] = rest; }
  const published = Object.fromEntries(Object.entries(all).filter(([, g]) => !g.published || String(g.published) <= today));
  report.guides = {
    listed: Object.keys(all).length,
    published: Object.keys(published).length,
    dedicatedRoutes: [...DEDICATED_GUIDE_ROUTES].filter((s) => s in all).length,
    rungs: guideRungs(published, (g) => guideCardPhoto(g)),
    hero: guideHeroCoverage(published, guideHero),
    note: "rung 'place' = the card asks the photo route (no-spend) for the first placeId; it only has an image if that place has a ref/owned photo.",
  };
}

// ── static: code surfaces ───────────────────────────────────────────────────
{
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next") continue;
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(js|jsx)$/.test(name)) files.push({ rel: path.relative(REPO, p).replace(/\\/g, "/"), src: readFileSync(p, "utf8") });
    }
  };
  walk(path.join(REPO, "app"));
  walk(path.join(REPO, "lib"));
  const registered = new Set([...PHOTO_SURFACES.flatMap((s) => s.components || []), ...Object.keys(NON_PHOTO_IMAGE_FILES)]); // non-photo brand/static art is documented in lib/photoSurfaces.js, not a blind spot
  // The modules that DEFINE the helpers are not renderers.
  const DEFINERS = new Set(["lib/cardPhotoRequest.js", "lib/imageState.js"]);
  report.surfaces = surfaceAudit(files.filter((f) => !DEFINERS.has(f.rel)), registered);
  report.surfaces.scanned = files.length;
}

// ── DB sections ─────────────────────────────────────────────────────────────
if (!staticOnly) {
  const inv = await select("wf_inventory", "select=place_id,photo_ref,excluded,status&order=place_id");
  const placePhoto = await select("wf_place_photo", "select=place_id,status,storage_path&order=place_id");
  const activeIds = new Set(placePhoto.filter((r) => r.status === "active").map((r) => r.place_id));
  report.inventory = classifyInventory(inv, activeIds);
  report.inventory.hard_gap_sample = report.inventory.hard_gap_ids.slice(0, 25);
  delete report.inventory.hard_gap_ids;
  report.placePhoto = {
    byStatus: histogram(placePhoto, (r) => r.status),
    activeWithStoragePath: placePhoto.filter((r) => r.status === "active" && r.storage_path).length,
  };
  const queue = await select("wf_photo_repair_queue", "select=place_id,status,failure_reason&order=place_id");
  report.repairQueue = { byStatus: histogram(queue, (r) => r.status), byStatusReason: histogram(queue, (r) => `${r.status} / ${r.failure_reason}`) };

  const d = new Date(`${siteTodayStr()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 14);
  const outcomes = await select("wf_photo_outcome_daily", `select=day,class,n&day=gte.${d.toISOString().slice(0, 10)}&order=day,class`);
  report.outcomes14d = summarizeOutcomes(outcomes);

  const refOf = new Map(inv.map((r) => [r.place_id, r.photo_ref]));
  const blog = await loadBlogTargets({ url: URL_, key: KEY });
  report.blogs = {
    ...blogPhotoResolution({ ids: blog.ids, stats: blog.stats }, (id) => refOf.get(id), activeIds),
    posts: blog.posts.length,
    note: "blog hero/card images are rendered by the separate blog.gowayfind.com repo and are NOT measurable here; this counts picks whose venue resolves AND has a ref/owned photo.",
  };
  delete report.blogs.unresolvable;

  try {
    const events = await select("wf_events", "select=id,hero_image,hero_image_kind&order=id");
    report.events = { rows: events.length, byImageKind: eventImageKinds(events) };
  } catch (e) { report.events = { error: String(e.message || e) }; }
}

// ── output ──────────────────────────────────────────────────────────────────
report.headline = headline(report);
let prev = null;
if (comparePath) { prev = JSON.parse(readFileSync(comparePath, "utf8")); report.compare = compareFlat(report.headline, prev.headline || {}); }
if (outPath) writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");

const md = ["| metric | value |" + (prev ? " prev | delta |" : ""), "|---|---:|" + (prev ? "---:|---:|" : "")];
for (const [k, v] of Object.entries(report.headline)) {
  const c = report.compare && report.compare[k];
  md.push(`| ${k} | ${v} |` + (prev ? ` ${c && c.prev !== null ? c.prev : "-"} | ${c && c.delta !== null ? (c.delta > 0 ? "+" : "") + c.delta : "-"} |` : ""));
}
console.log(md.join("\n"));
if (report.repairQueue) console.log("\nrepair queue (status / reason): " + JSON.stringify(report.repairQueue.byStatusReason));
if (report.placePhoto) console.log("wf_place_photo: " + JSON.stringify(report.placePhoto));
if (report.events) console.log("events: " + JSON.stringify(report.events));
console.log(`\nregistry blind spots (${report.surfaces.blindSpots.length}): image-rendering files in app/ and lib/ not named in any lib/photoSurfaces.js component list`);
for (const b of report.surfaces.blindSpots) console.log(`- ${b.rel} [${b.signals.join(", ")}] fallback=${b.fallback ? "yes" : "NO"}`);
console.log(`\nguides on the monogram rung (${report.guides.rungs.noRealCardImage}): ${report.guides.rungs.monogramSlugs.slice(0, 40).join(", ")}`);
