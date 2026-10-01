#!/usr/bin/env node
/**
 * find-guide-pick-photo-candidates — MANUAL sourcing tool (not part of the build).
 *
 * For one guide, lists every pick that has no committed photo in
 * lib/guidePickPhotoManifest.js (including picks already recorded as a gap, so
 * a later pass can retry them), searches two free, licence-checkable sources:
 *
 *   1. Wikimedia Commons (File namespace, live extmetadata licence)
 *   2. Openverse (Flickr + Commons index), restricted to licences that allow
 *      commercial use AND modification
 *
 * and keeps only candidates whose licence is one the pick-photo contract
 * accepts (CC0, CC BY / BY-SA 2.0–4.0; never NC, ND, GFDL-only or PDM).
 * For each pick it writes a numbered contact sheet so a human (or agent) can
 * visually confirm the photo really shows THAT place before anything is
 * ingested. Nothing here writes to data/ or public/ — ingestion is
 * scripts/ingest-guide-pick-photo.mjs, one reviewed photo at a time.
 *
 *   node scripts/find-guide-pick-photo-candidates.mjs <slug> [--pick "<exact name>"] [--query "<extra search>"] [--out <dir>]
 *
 * Output: <out>/<slug>/<n>-<pick>/candidates.json + sheet.jpg (default out: tmp/pick-photo-candidates)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { GUIDES } from "../lib/guides.js";
import { GUIDE_PICK_PHOTOS } from "../lib/guidePickPhotoManifest.js";

// Commons throttles non-browser agents from shared cloud egress; this string
// still identifies the tool and a contact page, per Wikimedia UA policy.
export const UA = "Mozilla/5.0 (compatible; WayfindGuidePhotoSourcing/1.0; +https://gowayfind.com/about)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (html) => String(html || "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, " ").trim();

/** Normalise a licence label to the contract's exact strings, or null when not allowed. */
export function allowedLicence(short, url = "") {
  const s = `${short || ""} ${url || ""}`;
  if (/\bNC\b|\bND\b|-nc|-nd/i.test(s)) return null;
  if (/CC0|publicdomain\/zero/i.test(s)) return "CC0 1.0 Universal";
  const m = /CC[ -]BY(-SA)?[ -]([234]\.0)/i.exec(short || "") || /licenses\/by(-sa)?\/([234]\.0)/i.exec(url || "");
  return m ? `CC BY${m[1] ? "-SA" : ""} ${m[2]}` : null;
}

export async function getJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
    if (res.ok) return res.json();
    if (res.status !== 429 && res.status < 500) throw new Error(`${res.status} ${url}`);
    await sleep(4000 * (i + 1));
  }
  throw new Error(`gave up after ${tries} tries: ${url}`);
}

async function commonsSearch(q) {
  const params = new URLSearchParams({ action: "query", format: "json", formatversion: "2", generator: "search", gsrsearch: q, gsrnamespace: "6", gsrlimit: "10",
    prop: "imageinfo", iiprop: "url|size|extmetadata", iiurlwidth: "960", iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|ObjectName|DateTimeOriginal|GPSLatitude|GPSLongitude|ImageDescription" });
  const j = await getJson("https://commons.wikimedia.org/w/api.php?" + params);
  return (j.query?.pages || []).filter((p) => p.imageinfo?.[0] && /\.(jpe?g|png|webp|tiff?)$/i.test(p.title)).map((p) => {
    const ii = p.imageinfo[0]; const m = ii.extmetadata || {}; const v = (k) => strip(m[k]?.value);
    return { kind: "commons", sourceUrl: "https://commons.wikimedia.org/wiki/" + encodeURIComponent(p.title.replace(/ /g, "_")).replace(/%3A/g, ":"),
      title: p.title.replace(/^File:/, ""), author: v("Artist"), license: allowedLicence(v("LicenseShortName"), v("LicenseUrl")), licenseRaw: v("LicenseShortName"),
      width: ii.width, height: ii.height, preview: ii.thumburl, date: v("DateTimeOriginal").slice(0, 40), description: v("ImageDescription").slice(0, 300),
      gps: v("GPSLatitude") ? `${v("GPSLatitude")},${v("GPSLongitude")}` : null };
  });
}

async function openverseSearch(q) {
  const params = new URLSearchParams({ q, license_type: "commercial,modification", source: "flickr,wikimedia", page_size: "10", mature: "false" });
  const j = await getJson("https://api.openverse.org/v1/images/?" + params);
  return (j.results || []).map((r) => {
    const flickr = r.source === "flickr";
    const lic = r.license === "cc0" ? "CC0 1.0 Universal" : /^by(-sa)?$/.test(r.license) ? `CC ${r.license.toUpperCase()} ${r.license_version}` : null;
    const landing = String(r.foreign_landing_url || "").replace(/^http:/, "https:").replace(/\/$/, "");
    return { kind: flickr ? "flickr" : "commons", sourceUrl: landing, title: r.title, author: r.creator || "", license: allowedLicence(lic || ""), licenseRaw: `${r.license} ${r.license_version}`,
      width: r.width, height: r.height, preview: r.url, imageUrl: r.url, description: (r.tags || []).map((t) => t.name).slice(0, 12).join(", ") };
  });
}

async function previewBuffer(url) {
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`preview ${res.status}`);
  return sharp(Buffer.from(await res.arrayBuffer())).rotate().resize(480, 320, { fit: "cover" }).jpeg({ quality: 70 }).toBuffer();
}

async function contactSheet(cands, file) {
  const cols = 3, w = 480, h = 320, pad = 34;
  const tiles = [];
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    let img;
    try { img = await previewBuffer(c.preview); } catch { c.previewError = true; continue; }
    const label = Buffer.from(`<svg width="${w}" height="${pad}"><rect width="100%" height="100%" fill="#111"/><text x="8" y="23" font-family="sans-serif" font-size="20" fill="#fff">#${i + 1} ${c.kind} ${c.width}x${c.height} ${c.license}</text></svg>`);
    const slot = tiles.length / 2;
    const x = (slot % cols) * w, y = Math.floor(slot / cols) * (h + pad);
    tiles.push({ input: label, left: x, top: y }, { input: img, left: x, top: y + pad });
    await sleep(250);
  }
  if (!tiles.length) return false;
  const n = tiles.length / 2, rows = Math.ceil(n / cols);
  await sharp({ create: { width: cols * w, height: rows * (h + pad), channels: 3, background: "#222" } }).composite(tiles).jpeg({ quality: 72 }).toFile(file);
  return true;
}

export const slugify = (s) => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

async function main() {
  const args = process.argv.slice(2);
  const slug = args[0];
  const opt = (k) => { const i = args.indexOf(k); return i > -1 ? args[i + 1] : null; };
  const out = opt("--out") || "tmp/pick-photo-candidates";
  const list = Array.isArray(GUIDES) ? GUIDES : Object.entries(GUIDES).map(([s, g]) => ({ slug: s, ...g }));
  const guide = list.find((g) => g.slug === slug);
  if (!guide) { console.error(`unknown guide slug: ${slug}`); process.exit(2); }
  const covered = GUIDE_PICK_PHOTOS[slug]?.picks || {};
  const onlyPick = opt("--pick");
  const picks = (guide.picks || []).map((p, i) => ({ p, i })).filter(({ p }) => (onlyPick ? p.name === onlyPick : !covered[p.name] && !p.image));
  const where = guide.region || "Florida";
  for (const { p, i } of picks) {
    const city = p.city || where;
    const queries = [...new Set([opt("--query"), `${p.name} ${city}`, p.name, ...(p.exactNames || [])].filter(Boolean))];
    const seen = new Map();
    for (const q of queries) {
      for (const fn of [commonsSearch, openverseSearch]) {
        // Openverse lists Commons files by curid, so key Commons by file title to drop duplicates.
        try { for (const c of await fn(q)) { const key = c.kind === "commons" ? "commons:" + slugify(c.title.replace(/\.[a-z]+$/i, "")) : c.sourceUrl; if (c.license && c.sourceUrl && !seen.has(key)) seen.set(key, { ...c, query: q }); } }
        catch (e) { console.error(`  ! ${fn.name} "${q}": ${e.message}`); }
        await sleep(1200);
      }
    }
    const cands = [...seen.values()].filter((c) => c.kind !== "commons" || /\/wiki\/File:/.test(c.sourceUrl)).filter((c) => (c.width || 0) >= 800).slice(0, 12);
    const dir = path.join(out, slug, `${String(i + 1).padStart(2, "0")}-${slugify(p.name)}`);
    mkdirSync(dir, { recursive: true });
    const sheet = cands.length ? await contactSheet(cands, path.join(dir, "sheet.jpg")) : false;
    writeFileSync(path.join(dir, "candidates.json"), JSON.stringify({ slug, pick: p.name, city, placeId: p.placeId || null, blurb: p.blurb || null, candidates: cands.map((c, n) => ({ n: n + 1, ...c })) }, null, 1));
    console.log(`${slug} | ${p.name} | ${cands.length} licensed candidate(s)${sheet ? ` | ${path.join(dir, "sheet.jpg")}` : ""}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
