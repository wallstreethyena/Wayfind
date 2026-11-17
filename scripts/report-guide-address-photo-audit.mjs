#!/usr/bin/env node
// One-shot audit writer. Not a guard: it reads the live site for broken images.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { GUIDES } from "../lib/guides.js";
import { GUIDE_PLACE_RAILS } from "../lib/guidePlaceRails.js";
import { FLORIDA_FALL_GUIDE_EVENTS_2026 } from "../lib/floridaFallGuide2026.js";
import { guideHero, NEUTRAL_GUIDE_HERO } from "../lib/guideHero.js";
import { GUIDE_PICK_PHOTOS } from "../lib/guidePickPhotoManifest.js";
import { guideContextPhoto } from "../lib/guideContextPhotos.js";
import { guideUsesNeutralFallback } from "../lib/guideNeutralFallback.js";
import { guideWhereForRecord, pickNeedsStreetAddress } from "../lib/guidePlaceAddress.js";

const OUT_DIR = "docs/wayfind/audits";
const STAMP = "2026-11-17";
const SITE = "https://www.gowayfind.com";
const FIRST = "florida-christmas-boat-parades-2026";

function photoOf(slug, pick) {
  if (pick?.image) return typeof pick.image === "string" ? pick.image : pick.image.src || "";
  return GUIDE_PICK_PHOTOS[slug]?.picks?.[pick.name]?.src || "";
}

const rows = [];
function add(row) { rows.push(row); }

for (const [slug, guide] of Object.entries(GUIDES)) {
  const hero = guideHero(slug);
  add({
    page: `/guides/${slug}`,
    kind: "hero",
    name: guide.title,
    place: false,
    address: "",
    maps: "",
    photo: hero?.src || "",
    photoNote: hero === NEUTRAL_GUIDE_HERO || !hero?.src ? "placeholder" : "",
  });
  (guide.picks || []).forEach((pick, index) => {
    const needs = pickNeedsStreetAddress(pick);
    const where = needs ? guideWhereForRecord(pick, { slug }) : null;
    const own = photoOf(slug, pick);
    let photo = own;
    let photoNote = "";
    if (!own && guideUsesNeutralFallback(guide)) photoNote = "placeholder";
    else if (!own) {
      const context = guideContextPhoto(slug, pick, guide);
      photo = context?.src || "";
      if (!photo) photoNote = "missing";
    }
    add({
      page: `/guides/${slug}`,
      kind: index === 0 ? "best-pick" : "pick",
      name: pick.name,
      place: needs,
      address: where?.address || "",
      maps: where?.mapsUrl || "",
      source: where?.source || "",
      note: where?.note || "",
      reviewed: where?.reviewed === true,
      photo,
      photoNote,
      placeId: pick.placeId || "",
    });
  });
}

for (const [slug, rail] of Object.entries(GUIDE_PLACE_RAILS)) {
  for (const market of rail.markets || []) {
    for (const item of market.items || []) {
      const where = guideWhereForRecord({ name: item.name, placeId: item.placeId }, { slug });
      add({
        page: `/guides/${slug}`,
        kind: "rail",
        name: item.name,
        place: true,
      address: where?.address || "",
      maps: where?.mapsUrl || "",
      source: where?.source || "",
      note: where?.note || "",
      reviewed: where?.reviewed === true,
      photo: "",
        photoNote: "see-article-photo",
        placeId: item.placeId || "",
      });
    }
  }
}

for (const event of FLORIDA_FALL_GUIDE_EVENTS_2026) {
  const where = guideWhereForRecord({
    name: event.venue || event.event_name,
    placeId: event.place_id,
    address: event.address,
  });
  const photo = event.hero_image || event.image || "";
  add({
    page: "/guides/florida-fall-festivals-2026",
    kind: "event",
    name: event.event_name,
    place: true,
    address: where?.address || "",
    maps: where?.mapsUrl || "",
    source: where?.source || "",
    note: where?.note || "",
    reviewed: where?.reviewed === true,
    photo: typeof photo === "string" ? photo : "",
    photoNote: photo ? "" : "missing",
    placeId: event.place_id || "",
  });
}

const urls = [...new Set(rows.map((r) => r.photo).filter((s) => s && !s.startsWith("data:")))];
const status = new Map();
async function head(url) {
  const abs = url.startsWith("http") ? url : SITE + url;
  try {
    let res = await fetch(abs, { method: "HEAD", redirect: "follow", headers: { "user-agent": "WayfindAudit/1.0" } });
    if (res.status === 405 || res.status === 400 || res.status === 501) {
      res = await fetch(abs, { method: "GET", redirect: "follow", headers: { "user-agent": "WayfindAudit/1.0" } });
      await res.body?.cancel();
    }
    return res.status;
  } catch {
    return 0;
  }
}
if (process.env.SKIP_PHOTO_HTTP !== "1") {
  const queue = urls.slice();
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const url = queue.shift();
      const code = await head(url);
      status.set(url, code);
    }
  }));
}

for (const row of rows) {
  if (!row.photo) {
    if (!row.photoNote) row.photoNote = row.kind === "hero" || row.kind === "pick" || row.kind === "best-pick" || row.kind === "event" ? "missing" : row.photoNote;
    continue;
  }
  if (row.photo.startsWith("/") && !existsSync("public" + row.photo.split("?")[0])) row.photoNote = row.photoNote || "broken-file";
  const code = status.get(row.photo);
  row.http = code;
  if (code && code >= 400) row.photoNote = "broken";
  else if (code === 0) row.photoNote = row.photoNote || "broken";
  if (/placeholder|via\.placeholder|1x1|photo-unavailable/i.test(row.photo)) row.photoNote = "placeholder";
}

const pages = new Set(rows.map((r) => r.page));
const places = rows.filter((r) => r.place);
const fixed = places.filter((r) => r.address && r.maps);
const unresolved = places.filter((r) => !r.address || !r.maps);
const photoGaps = rows.filter((r) => ["missing", "placeholder", "broken", "broken-file"].includes(r.photoNote));

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(list) {
  const headers = ["page", "kind", "name", "placeId", "address", "maps", "source", "note", "addressGap", "photo", "photoNote", "http"];
  const lines = [headers.join(",")];
  for (const row of list) {
    lines.push(headers.map((key) => csvEscape(key === "addressGap" ? (row.place && !row.address ? "yes" : "") : row[key])).join(","));
  }
  return lines.join("\n") + "\n";
}

const first = rows.filter((r) => r.page === `/guides/${FIRST}`);
const firstPhotos = first.filter((r) => ["missing", "placeholder", "broken", "broken-file"].includes(r.photoNote));

function line(row) {
  const address = row.place ? (row.address ? `address: ${row.address}` : (row.reviewed || row.maps ? "address: none, reviewed map link" : "address: unresolved")) : "not a single place";
  const maps = row.maps ? "maps: yes" : (row.place ? "maps: no" : "maps: n/a");
  const source = row.source ? ` Source: ${row.source}.` : "";
  const note = row.note ? ` ${row.note}` : "";
  const photo = row.photoNote ? `photo: ${row.photoNote}` : "photo: present";
  return `- ${row.kind}: ${row.name}. ${address}. ${maps}. ${photo}.${source}${note}`;
}

const md = [];
md.push(`# Guide and blog address and photo audit`);
md.push(``);
md.push(`Checked ${STAMP}. Guides and blog articles are the /guides pages, including the fall festivals guide and Pinto's Farm.`);
md.push(`An address is counted only when it has a street, city, state, and ZIP from repo records, inventory, event rows, or the venue's own page. Census added a ZIP only when the street number and city matched. Nothing here is a guessed address.`);
md.push(``);
md.push(`## Photo gaps on the Christmas boat parades guide`);
md.push(``);
md.push(`Checked first because it was shared on Facebook: ${SITE}/guides/${FIRST}`);
md.push(``);
md.push(`Picture Scrapper list for this page:`);
if (!firstPhotos.length) md.push(`- None.`);
for (const row of firstPhotos) md.push(`- ${row.name}: ${row.photoNote}${row.photo ? ` (${row.photo})` : ""}. HTTP ${row.http || "n/a"}.`);
md.push(``);
md.push(`Every recommendation on that page:`);
for (const row of first) md.push(line(row));
md.push(``);
md.push(`## Counts`);
md.push(``);
md.push(`- Pages audited: ${pages.size}`);
md.push(`- Places and events audited: ${places.length}`);
md.push(`- Addresses fixed with a maps link: ${fixed.length}`);
md.push(`- Unresolved addresses: ${unresolved.length}`);
md.push(`- Photo gaps: ${photoGaps.length}`);
md.push(``);
md.push(`## Photo gaps for the Picture Scrapper`);
md.push(``);
md.push(`Missing photos, placeholder tiles, empty sources, and images that return an error. Existing photos that load are not listed.`);
md.push(``);
for (const row of photoGaps) {
  md.push(`- ${row.page} / ${row.name}: ${row.photoNote}${row.http ? `, HTTP ${row.http}` : ""}${row.photo ? `, ${row.photo}` : ""}`);
}
md.push(``);
md.push(`## Address gaps by page`);
md.push(``);
const byPage = new Map();
for (const row of unresolved) {
  if (!byPage.has(row.page)) byPage.set(row.page, []);
  byPage.get(row.page).push(row);
}
for (const [page, list] of byPage) {
  md.push(`### ${page}`);
  md.push(``);
  for (const row of list) md.push(`- ${row.kind}: ${row.name}${row.placeId ? ` (${row.placeId})` : ""}`);
  md.push(``);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/guide-address-photo-audit-${STAMP}.md`, md.join("\n"));
writeFileSync(`${OUT_DIR}/guide-address-photo-audit-${STAMP}.csv`, toCsv(rows));
writeFileSync(`${OUT_DIR}/guide-address-photo-audit-${STAMP}.json`, JSON.stringify({
  auditedAt: STAMP,
  pages: pages.size,
  places: places.length,
  addressesFixed: fixed.length,
  unresolvedAddresses: unresolved.length,
  photoGaps: photoGaps.length,
  rows,
  photoGapList: photoGaps,
}, null, 2));
writeFileSync(`${OUT_DIR}/guide-photo-gaps-${STAMP}.csv`, toCsv(photoGaps));
console.log(`report-guide-address-photo-audit: pages ${pages.size}, places ${places.length}, fixed ${fixed.length}, unresolved ${unresolved.length}, photo gaps ${photoGaps.length}`);
