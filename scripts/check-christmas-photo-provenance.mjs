// Guard: every Christmas licensed photo has provenance (allowed license, source url, creator),
// no stray image, no duplicate bytes across slugs, each file decodes with sane dimensions.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { CHRISTMAS_LICENSED_PHOTOS } from "../lib/christmasPhotos.js";

const root = process.cwd();
const dir = path.join(root, "public/events/christmas");
const prov = JSON.parse(fs.readFileSync(path.join(root, "data/christmas-photo-provenance.json"), "utf8"));
const ALLOWED = new Set(["CC0", "PD", "CC BY", "CC BY-SA"]);
const IMG = /\.(webp|jpe?g|png|gif|avif)$/i;
const bad = [];
let n = 0;
// Controls: the decoder must accept a real webp and reject garbage, or the file check proves nothing.
const good = await sharp({ create: { width: 640, height: 400, channels: 3, background: "#123456" } }).webp().toBuffer();
if (!((await sharp(good).metadata()).width === 640)) bad.push("control: decoder failed on a valid webp");
let rejected = false; try { await sharp(Buffer.from("not an image")).metadata(); } catch { rejected = true; }
if (!rejected) bad.push("control: decoder accepted garbage");
if (ALLOWED.has("CC BY-NC") || ALLOWED.has("All rights reserved")) bad.push("control: allowed set too wide");
n += 3;
const entries = Array.isArray(prov.photos) ? prov.photos : (bad.push("provenance.photos is not an array"), []);
const byFile = new Map();
for (const e of entries) {
  const where = e.slug || "?";
  if (byFile.has(e.file)) bad.push(where + ": file listed twice " + e.file);
  byFile.set(e.file, e);
  const lic = String(e.license || "").replace(/\s+\d(\.\d)?.*$/, "").trim();
  if (!ALLOWED.has(lic)) bad.push(where + ": license not allowed: " + e.license);
  for (const k of ["slug", "file", "source_url", "creator", "license_url", "depicted_venue", "verified_at", "evidence"]) if (!e[k]) bad.push(where + ": missing " + k);
  if (e.source_url && !/^https:\/\//.test(e.source_url)) bad.push(where + ": source_url not https");
  const m = CHRISTMAS_LICENSED_PHOTOS[e.slug];
  if (!m || m.file !== e.file) bad.push(where + ": lib/christmasPhotos.js map missing or file differs");
  else if (!m.credit || !m.credit.includes(e.creator)) bad.push(where + ": visible credit does not name the creator");
  n += 10;
}
for (const slug of Object.keys(CHRISTMAS_LICENSED_PHOTOS)) if (!entries.some((e) => e.slug === slug)) bad.push(slug + ": wired in lib but no provenance");
// Live coverage excludes a photo that a wf_events row's own (credited) photo
// shadows (2026-10-14: Nights of Lights, Central Florida Zoo lantern festival).
for (const e of entries) if ("shadowed_by_db_photo" in e && typeof e.shadowed_by_db_photo !== "boolean") bad.push((e.slug || "?") + ": shadowed_by_db_photo must be true or false");
const shadowed = entries.filter((e) => e.shadowed_by_db_photo === true);
for (const slug of ["nights-of-lights-staug-2026", "cf-zoo-lantern-festival-2026"]) if (!shadowed.some((e) => e.slug === slug)) bad.push(slug + ": shown live with the wf_events Google photo, must be marked shadowed_by_db_photo");
n += entries.length + 2;
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.startsWith(".")) : [];
const seen = new Map();
for (const f of files) {
  n++;
  if (!IMG.test(f)) { bad.push(f + ": not an image file"); continue; }
  if (!byFile.has(f)) bad.push(f + ": image without provenance");
  const buf = fs.readFileSync(path.join(dir, f));
  const h = crypto.createHash("sha256").update(buf).digest("hex");
  if (seen.has(h)) bad.push(f + ": duplicate of " + seen.get(h)); else seen.set(h, f);
  if (buf.length > 120 * 1024) bad.push(f + ": over 120KB");
  try {
    const md = await sharp(buf).metadata();
    if (!(md.width >= 400 && md.height >= 250 && md.width <= 3000 && md.height <= 3000)) bad.push(f + ": odd dimensions " + md.width + "x" + md.height);
  } catch (err) { bad.push(f + ": does not decode " + err.message); }
}
for (const f of byFile.keys()) if (!files.includes(f)) bad.push(f + ": provenance entry without file");
if (bad.length) { console.error("check-christmas-photo-provenance: FAIL\n" + bad.join("\n")); process.exit(1); }
console.log("check-christmas-photo-provenance: OK, " + n + " assertions, " + entries.length + " photos (" + (entries.length - shadowed.length) + " live, " + shadowed.length + " shadowed by a wf_events photo), " + files.length + " files in public/events/christmas");
