#!/usr/bin/env node
/**
 * ingest-guide-pick-photo — MANUAL tool: add ONE visually reviewed photo to a
 * guide pick, or record why a pick has none. Not part of the build.
 *
 * Photo (after you have LOOKED at it and confirmed it shows this exact place):
 *   node scripts/ingest-guide-pick-photo.mjs --slug <slug> --pick "<exact pick name>" \
 *     --source <commons File: page | flickr photo page> [--image-url <flickr static url>] \
 *     --alt "..." --caption "..." --verification "what you saw that proves identity" \
 *     [--credit "Name"] [--position "50% 50%"] [--file <basename>] [--same-as-card]
 *
 * Gap (no licensed photo of this place exists):
 *   node scripts/ingest-guide-pick-photo.mjs --slug <slug> --pick "<name>" --gap <reason> --note "..." [--needs "<rights holder>"]
 *
 * What it does for a photo, in order, failing closed at each step:
 *   1. re-reads the licence AT THE SOURCE (Commons extmetadata / the live
 *      Flickr photo page) and refuses anything but CC0 / CC BY / CC BY-SA 2.0–4.0
 *   2. downloads a standard-size rendition, resizes to <= 1400px wide WebP and
 *      steps quality down until the file is <= 200KB (the guard's budget)
 *   3. writes public/guides/picks/<slug>/<file>.webp and the contract ENTRY in
 *      data/guide-pick-photos/<slug>.json (removing any gap for that pick),
 *      and appends the outcome to data/guide-pick-photos/_reports/<slug>.csv
 *
 * Afterwards (once per batch): node scripts/build-guide-pick-photos.mjs &&
 * node scripts/build-guide-photo-credits.mjs && node scripts/build-guide-photo-license-evidence.mjs
 * && node scripts/check-guide-pick-photos.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { GUIDES } from "../lib/guides.js";
import { GUIDE_HERO_ART } from "../lib/guideHero.js";
import { UA, allowedLicence, getJson, slugify } from "./find-guide-pick-photo-candidates.mjs";
import { siteTodayStr } from "../lib/siteTime.js";

const GAP_REASONS = new Set(["google-only", "no-verified-source", "public-art", "people-privacy", "not-a-place"]);
const strip = (html) => String(html || "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, " ").trim();
const licenceUrl = (lic) => lic === "CC0 1.0 Universal" ? "https://creativecommons.org/publicdomain/zero/1.0/"
  : `https://creativecommons.org/licenses/${lic.includes("-SA") ? "by-sa" : "by"}/${lic.split(" ").at(-1)}/`;
const modificationNotice = (lic) => "Resized, cropped for display and converted to WebP." + (lic.includes("-SA") ? " The adaptation is released under the same licence." : "");

function args() {
  const a = process.argv.slice(2), o = {};
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith("--")) continue;
    const k = a[i].slice(2);
    if (a[i + 1] === undefined || a[i + 1].startsWith("--")) o[k] = true; else o[k] = a[++i];
  }
  return o;
}

async function commonsLive(sourceUrl) {
  const title = decodeURIComponent(new URL(sourceUrl).pathname.replace(/^\/wiki\//, "")).replace(/_/g, " ");
  const params = new URLSearchParams({ action: "query", format: "json", formatversion: "2", redirects: "1", titles: title, prop: "imageinfo",
    iiprop: "url|size|extmetadata", iiurlwidth: "1920", iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|ObjectName|DateTimeOriginal" });
  const page = (await getJson("https://commons.wikimedia.org/w/api.php?" + params)).query?.pages?.[0];
  if (!page || page.missing || !page.imageinfo) throw new Error(`Commons file not found: ${title}`);
  const ii = page.imageinfo[0], m = ii.extmetadata || {}, v = (k) => strip(m[k]?.value);
  // Commons returns the original when it is already narrower than the requested thumb.
  const download = ii.width > 1920 ? ii.thumburl : ii.url;
  return { license: allowedLicence(v("LicenseShortName"), v("LicenseUrl")), licenseRaw: v("LicenseShortName"), author: v("Artist"), download };
}

async function flickrLive(sourceUrl, imageUrl) {
  const res = await fetch(sourceUrl, { headers: { "user-agent": UA } });
  const html = await res.text();
  if (res.status !== 200) throw new Error(`Flickr page HTTP ${res.status}`);
  const lic = /"license": "(https:\/\/creativecommons\.org\/[^"]+)"/.exec(html);
  const owner = /"owner":\{"pathAlias":"?([^",]*)"?,"username":"([^"]*)","realname":"([^"]*)"/.exec(html);
  const id = new URL(sourceUrl).pathname.split("/")[3];
  if (!imageUrl || !/^https:\/\/live\.staticflickr\.com\//.test(imageUrl) || !imageUrl.includes(`/${id}_`)) throw new Error("--image-url must be the live.staticflickr.com file of this same photo id");
  return { license: allowedLicence("", lic?.[1]), licenseRaw: lic?.[1] || "(none on page)", author: owner ? (owner[3] || owner[2]) : "", download: imageUrl };
}

async function toWebp(buf, out) {
  const meta = await sharp(buf).metadata();
  // Busy scenes can't reach 200KB at 1400px without visible artefacts; step the
  // width down before dropping quality below a clean floor.
  for (const cap of [1400, 1200, 1024]) {
    const width = Math.min(cap, meta.width);
    for (const quality of [80, 74, 68, 62, 56]) {
      const data = await sharp(buf).rotate().resize({ width, withoutEnlargement: true }).webp({ quality }).toBuffer({ resolveWithObject: true });
      if (data.data.length <= 200 * 1024) { writeFileSync(out, data.data); return { width: data.info.width, height: data.info.height, bytes: data.data.length }; }
    }
  }
  throw new Error("could not fit the 200KB budget even at 1024px, quality 56");
}

function csvRow(slug, cells) {
  const file = `data/guide-pick-photos/_reports/${slug}.csv`;
  if (!existsSync(file)) writeFileSync(file, "pick,placeId,source,outcome,reason,needsPermissionFrom\n");
  appendFileSync(file, cells.map((c) => (c == null ? "" : /[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(",") + "\n");
}

async function main() {
  const o = args();
  const list = Array.isArray(GUIDES) ? GUIDES : Object.entries(GUIDES).map(([s, g]) => ({ slug: s, ...g }));
  const guide = list.find((g) => g.slug === o.slug);
  if (!guide) throw new Error(`unknown guide slug: ${o.slug}`);
  const pick = (guide.picks || []).find((p) => p.name === o.pick);
  if (!pick) throw new Error(`"${o.pick}" is not a pick of ${o.slug}`);
  const dataFile = `data/guide-pick-photos/${o.slug}.json`;
  const data = existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, "utf8")) : { slug: o.slug, picks: {}, gaps: {} };
  data.picks ||= {}; data.gaps ||= {};
  const placeId = pick.placeId || null;

  if (o.gap) {
    if (!GAP_REASONS.has(o.gap)) throw new Error(`--gap must be one of ${[...GAP_REASONS].join("/")}`);
    if (!o.note) throw new Error("--note is required for a gap");
    // Re-recording a gap must not erase who could unblock it; keep the existing
    // rights-holder lead unless a new one is passed explicitly.
    const prior = data.gaps[o.pick] || {};
    data.gaps[o.pick] = { reason: o.gap, placeId, needsPermissionFrom: o.needs && o.needs !== true ? o.needs : (prior.needsPermissionFrom ?? null), note: o.note };
    // A pick is either photographed or a gap, never both; drop a rejected photo and its file.
    const rejected = data.picks[o.pick];
    if (rejected) {
      delete data.picks[o.pick];
      // Keep the file if anything else still renders it: another pick in ANY
      // guide (this one included), a data-file hero, or a guideHero.js hero.
      const heroSrcs = new Set(Object.values(GUIDE_HERO_ART).map((a) => a?.src).filter(Boolean));
      const stillUsed = heroSrcs.has(rejected.src) || list.some((g) => {
        try {
          const d = g.slug === o.slug ? data : JSON.parse(readFileSync(`data/guide-pick-photos/${g.slug}.json`, "utf8"));
          return d.hero?.src === rejected.src || Object.values(d.picks || {}).some((e) => e.src === rejected.src);
        } catch { return false; }
      });
      if (!stillUsed && existsSync("public" + rejected.src)) unlinkSync("public" + rejected.src);
    }
    writeFileSync(dataFile, JSON.stringify(data, null, 2) + "\n");
    csvRow(o.slug, [o.pick, placeId, "", "gap", o.gap, data.gaps[o.pick].needsPermissionFrom || ""]);
    console.log(`gap recorded: ${o.slug} / ${o.pick} (${o.gap})`);
    return;
  }

  for (const k of ["source", "alt", "caption", "verification"]) if (!o[k] || o[k] === true) throw new Error(`--${k} is required`);
  const src = new URL(o.source);
  const kind = src.hostname === "commons.wikimedia.org" ? "commons" : src.hostname === "www.flickr.com" ? "flickr" : null;
  if (!kind) throw new Error("--source must be a commons.wikimedia.org/wiki/File: page or a www.flickr.com/photos/<owner>/<id> page");
  const live = kind === "commons" ? await commonsLive(o.source) : await flickrLive(o.source.replace(/\/$/, ""), o["image-url"]);
  if (!live.license) throw new Error(`licence at source is "${live.licenseRaw}", which the pick-photo contract does not allow`);
  const credit = (o.credit && o.credit !== true ? o.credit : live.author).trim();
  if (!credit) throw new Error("source has no author; pass --credit only if the source page names one");

  const res = await fetch(live.download, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`download ${res.status}: ${live.download}`);
  const base = slugify(o.file && o.file !== true ? o.file : o.pick);
  const rel = `/guides/picks/${o.slug}/${base}.webp`;
  mkdirSync(path.dirname("public" + rel), { recursive: true });
  const img = await toWebp(Buffer.from(await res.arrayBuffer()), "public" + rel);

  const sourceUrl = o.source.replace(/\/$/, "");
  data.picks[o.pick] = {
    src: rel, width: img.width, height: img.height, alt: o.alt, caption: o.caption, credit, creditHref: sourceUrl,
    license: live.license, licenseUrl: licenceUrl(live.license), sourceUrl, author: live.author || credit,
    position: o.position && o.position !== true ? o.position : "50% 50%", modificationNotice: modificationNotice(live.license),
    sourceKind: kind, placeId, verification: `${o.verification} Live ${kind === "commons" ? "Commons" : "Flickr"} licence checked: ${live.license}.`,
    sameAsCardPhoto: o["same-as-card"] === true, reviewedAt: siteTodayStr(),
  };
  delete data.gaps[o.pick];
  writeFileSync(dataFile, JSON.stringify(data, null, 2) + "\n");
  csvRow(o.slug, [o.pick, placeId, kind, "used", "", ""]);
  console.log(`ingested ${rel} ${img.width}x${img.height} ${img.bytes}B ${live.license} — ${credit}`);
}

main().catch((e) => { console.error(`ingest failed: ${e.message}`); process.exit(1); });
