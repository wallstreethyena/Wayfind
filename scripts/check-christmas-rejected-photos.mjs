#!/usr/bin/env node
// A photo rejected in review never comes back (owner, 2026-11-05).
//
// THE GAP THIS CLOSES. Photo batch #2150 merged on green guards at 20:29Z on
// 2026-11-03; the visual review that rejected its composited WEC carriage
// scene and four off-event Amelia shots happened at 21:11Z, after merge. The
// guards check provenance, size and format, not what a reviewer accepted, so
// the composite shipped to production. #2152 then carried the removal, but
// nothing on main remembered the rejection: a branch cut before that removal
// (or a re-download under a new name) could restore the same picture with
// every guard green.
//
// data/christmas-rejected-photos.json is the reviewed rejection record. This
// guard fails when a rejected photo is reachable by PATH, by SOURCE URL, or by
// identical BYTES on any Christmas photo surface:
//   * CHRISTMAS_STATIC_GALLERY (cards, cover, gallery, viewer, event pages,
//     eventStaticCover for og images all read it through christmasStaticPhotos)
//   * CHRISTMAS_LICENSED_PHOTOS (lib/christmasPhotos.js)
//   * the reviewed venue photo manifest (docs/curation/christmas-venue-photos-*.json)
//   * every file under public/place-photos and public/events (bytes)
// Scopes: global = nowhere; christmas = no Christmas surface; event = not for
// the listed events. Asserted on the CALL of the resolver as well as the data.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { CHRISTMAS_STATIC_GALLERY, christmasStaticPhotos } from "../lib/christmasPlacePhotos.js";
import { CHRISTMAS_LICENSED_PHOTOS } from "../lib/christmasPhotos.js";

const root = process.cwd();
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

export function rejectedIndex(registry) {
  const byHash = new Map(), byPath = new Map(), byHref = new Map();
  for (const p of registry.photos || []) {
    byHash.set(p.sha256, p);
    for (const f of p.files || []) byPath.set(f, p);
    if (p.source_href) byHref.set(p.source_href, p);
  }
  return { byHash, byPath, byHref };
}
const appliesTo = (p, eventKey) => p.scope === "global" || p.scope === "christmas" || (p.events || []).includes(eventKey);

// Pure: every reason a gallery map serves a rejected photo for an event key.
export function galleryViolations(gallery, index, readBytes) {
  const out = [];
  for (const [key, list] of Object.entries(gallery || {})) {
    for (const e of list || []) {
      const src = String(e.src || e.file || "");
      const hits = [index.byPath.get(src), index.byHref.get(String(e.href || ""))];
      const bytes = readBytes(src);
      if (bytes) hits.push(index.byHash.get(sha(bytes)));
      for (const p of hits) if (p && appliesTo(p, key)) out.push(`${key}: ${src} is the rejected photo ${p.files[0]} (${p.scope}: ${p.why})`);
    }
  }
  return [...new Set(out)];
}

const registry = JSON.parse(fs.readFileSync(path.join(root, "data/christmas-rejected-photos.json"), "utf8"));
ok(Array.isArray(registry.photos) && registry.photos.length >= 15, "the rejection record lists the reviewed rejections (" + (registry.photos || []).length + ")");
for (const p of registry.photos) {
  ok(/^[0-9a-f]{64}$/.test(p.sha256) && p.files?.length && ["global", "christmas", "event"].includes(p.scope) && p.why, "rejection row is complete: " + (p.files?.[0] || p.sha256));
  if (p.scope === "event") ok(p.events?.length > 0, "an event scoped rejection names its events: " + p.files[0]);
}
const index = rejectedIndex(registry);
const readPublic = (src) => {
  if (!src.startsWith("/")) return null;
  const abs = path.join(root, "public", src);
  return fs.existsSync(abs) && fs.statSync(abs).isFile() ? fs.readFileSync(abs) : null;
};

// Controls: the detector finds a rejected path, a rejected source URL and rejected bytes
// under a new name, and leaves an unrelated photo alone (else a clean result proves nothing).
const composite = registry.photos.find((p) => p.scope === "global");
const amelia = registry.photos.find((p) => p.scope === "event");
ok(composite && amelia, "fixtures exist for a global and an event scoped rejection");
const fakeBytes = Buffer.from("rejected bytes control");
const ctlIndex = rejectedIndex({ photos: [...registry.photos, { sha256: sha(fakeBytes), files: ["/x/old.jpg"], scope: "christmas", why: "control" }] });
ok(galleryViolations({ "any-event": [{ src: composite.files[0] }] }, index, () => null).length === 1, "control: a rejected path is caught on any event");
ok(galleryViolations({ "any-event": [{ src: "/new/name.jpg", href: composite.source_href }] }, index, () => null).length === 1, "control: a re-download of a rejected source URL is caught");
ok(galleryViolations({ "any-event": [{ src: "/new/renamed.jpg" }] }, ctlIndex, () => fakeBytes).length === 1, "control: identical bytes under a new name are caught");
ok(galleryViolations({ [amelia.events[0]]: [{ src: amelia.files[0] }] }, index, () => null).length === 1, "control: an event scoped rejection is caught on its own event");
ok(galleryViolations({ "dickens-on-centre-2026": [{ src: "/elsewhere/x.jpg", href: amelia.source_href }] }, index, () => null).length === 0, "control: an event scoped rejection may still serve the event it actually shows");
ok(galleryViolations({ "any-event": [{ src: "/place-photos/unrelated.jpg", href: "https://example.org/fine.jpg" }] }, index, () => Buffer.from("fine")).length === 0, "control: an unrelated photo passes");

// 1. The static gallery, by path, source and bytes.
const staticBad = galleryViolations(CHRISTMAS_STATIC_GALLERY, index, readPublic);
ok(staticBad.length === 0, "CHRISTMAS_STATIC_GALLERY serves no rejected photo: " + staticBad.join("; "));
// 2. Licensed Christmas photos.
const licensed = Object.fromEntries(Object.entries(CHRISTMAS_LICENSED_PHOTOS).map(([k, v]) => [k, [{ src: "/events/christmas/" + v.file, href: v.href }]]));
const licBad = galleryViolations(licensed, index, readPublic);
ok(licBad.length === 0, "CHRISTMAS_LICENSED_PHOTOS serves no rejected photo: " + licBad.join("; "));
// 3. Reviewed venue photo manifests.
const curDir = path.join(root, "docs/curation");
const manifests = fs.existsSync(curDir) ? fs.readdirSync(curDir).filter((f) => /^christmas-.*photos.*\.json$/.test(f)) : [];
let manifestImages = 0;
const manifestBad = [];
for (const f of manifests) {
  const m = JSON.parse(fs.readFileSync(path.join(curDir, f), "utf8"));
  for (const img of m.images || []) {
    manifestImages += 1;
    const p = index.byHash.get(img.sha256) || index.byHref.get(img.source_url || img.source_href || "");
    if (p && p.scope !== "event") manifestBad.push(`${f}: ${img.local_path} is the rejected photo ${p.files[0]}`);
  }
}
ok(manifestImages > 0, "the reviewed venue manifests were read (" + manifests.length + " manifests, " + manifestImages + " images)");
ok(manifestBad.length === 0, "reviewed manifests carry no rejected photo: " + manifestBad.join("; "));
// 4. Bytes anywhere under public/: global and Christmas scoped rejections must not exist at all;
//    an event scoped one must not sit in that event's folder.
let scanned = 0;
const bytesBad = [];
for (const top of ["public/place-photos", "public/events"]) {
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) { walk(abs); continue; }
      if (!/\.(jpe?g|png|webp|avif|gif)$/i.test(ent.name)) continue;
      scanned += 1;
      const p = index.byHash.get(sha(fs.readFileSync(abs)));
      if (!p) continue;
      const folder = path.basename(path.dirname(abs));
      if (p.scope !== "event" || p.events.includes(folder)) bytesBad.push(path.relative(root, abs) + " is the rejected photo " + p.files[0]);
    }
  };
  if (fs.existsSync(path.join(root, top))) walk(path.join(root, top));
}
ok(scanned > 500, "the byte scan actually swept the photo folders (" + scanned + " files)");
ok(bytesBad.length === 0, "no rejected photo bytes are published: " + bytesBad.join("; "));
// 5. The resolver itself, for every event a rejection names (cards, cover, gallery, viewer and og image all use it).
const resolverBad = [];
for (const p of registry.photos) {
  for (const ev of p.events) {
    for (const ph of christmasStaticPhotos(ev, ev)) {
      const b = readPublic(ph.src);
      const hit = index.byPath.get(ph.src) || index.byHref.get(String(ph.creditHref || "")) || (b && index.byHash.get(sha(b)));
      if (hit && appliesTo(hit, ev)) resolverBad.push(ev + " -> " + ph.src);
    }
  }
}
ok(resolverBad.length === 0, "christmasStaticPhotos returns no rejected photo for any named event: " + resolverBad.join("; "));
// 6. The accepted replacements are still served (removing everything would also pass the checks above).
ok(christmasStaticPhotos("amelia-island-museum-of-history-holiday-home-tour-2026").some((p) => /xmas_04c6ee03d6550dc1/.test(p.src)), "Amelia Holiday Home Tour keeps the organizer's parlor photo");
ok(christmasStaticPhotos("fernandina-holiday-home-tour-2026").length >= 1 && christmasStaticPhotos("fernandina-holiday-home-tour-2026")[0].src === christmasStaticPhotos("amelia-island-museum-of-history-holiday-home-tour-2026")[0].src, "the Amelia research id resolves to the same gallery");
const wec = christmasStaticPhotos("ocala-wec-winter-wonderland-2026");
ok(wec.length >= 5 && wec[0].src === christmasStaticPhotos("wec-winter-wonderland-2026")[0].src, "the WEC research id resolves to the accepted WEC gallery (" + wec.length + " photos)");
ok(christmasStaticPhotos("cocoa-village-holiday-bazaar-2026").length >= 1, "the Cocoa Village bazaar research id resolves to its gallery");
console.log(`check-christmas-rejected-photos: OK, ${checks} assertions (${registry.photos.length} rejected photos, ${Object.keys(CHRISTMAS_STATIC_GALLERY).length} gallery events, ${scanned} published files hashed)`);
