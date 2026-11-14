#!/usr/bin/env node
// scripts/report-christmas-photo-coverage.mjs: photo coverage of the live
// Christmas browse. NOT a guard (it needs the network; prebuild runs offline).
//   node scripts/report-christmas-photo-coverage.mjs [baseUrl]
// Fetches /api/christmas/browse?page=N for every page (24 per page), then prints
// JSON counts: total cards, with photo, blank, by rights_class, and broken (a
// HEAD of the first photo src of a sample of cards, at most 60 requests, with a
// polite delay between them).
const BASE = (process.argv[2] || "https://www.gowayfind.com").replace(/\/$/, "");
const MAX_HEADS = 60;
const DELAY_MS = 250;
const CLASSES = ["licensed", "google_attributed", "organizer_unverified", "wayfind_owned", "unknown"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { "user-agent": "wayfind-photo-coverage-report/1.0" };

async function getPage(n) {
  const r = await fetch(`${BASE}/api/christmas/browse?page=${n}`, { headers: UA, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`page ${n}: HTTP ${r.status}`);
  return r.json();
}

const firstPhoto = (card) => {
  const p = Array.isArray(card.photos) && card.photos.find((x) => x && x.src);
  if (p) return { src: p.src, rights: p.rights_class };
  return card.image ? { src: card.image, rights: card.photo_rights_class } : null;
};

const cards = [];
let page = 1, hasMore = true;
while (hasMore && page <= 100) {
  const j = await getPage(page);
  cards.push(...(j.cards || []));
  hasMore = !!j.hasMore;
  page++;
  if (hasMore) await sleep(DELAY_MS);
}

const by_rights_class = Object.fromEntries(CLASSES.map((c) => [c, 0]));
let withPhoto = 0, blank = 0, missingClass = 0;
const covered = [];
for (const card of cards) {
  const p = firstPhoto(card);
  if (!p) { blank++; continue; }
  withPhoto++;
  covered.push(p);
  if (CLASSES.includes(p.rights)) by_rights_class[p.rights]++; else missingClass++;
}

// Sample evenly across the cards that have a photo.
const step = Math.max(1, Math.ceil(covered.length / MAX_HEADS));
const sample = covered.filter((_, i) => i % step === 0).slice(0, MAX_HEADS);
let broken = 0;
const brokenSamples = [];
for (const p of sample) {
  const url = new URL(p.src, BASE).toString();
  try {
    const r = await fetch(url, { method: "HEAD", headers: UA, redirect: "follow", signal: AbortSignal.timeout(15000) });
    if (!r.ok) { broken++; brokenSamples.push({ src: p.src, status: r.status }); }
  } catch (e) { broken++; brokenSamples.push({ src: p.src, status: String(e && e.message || e) }); }
  await sleep(DELAY_MS);
}

console.log(JSON.stringify({
  base: BASE,
  total_cards: cards.length,
  with_photo: withPhoto,
  blank,
  by_rights_class,
  rights_class_missing: missingClass,
  broken: { sampled: sample.length, broken, samples: brokenSamples.slice(0, 10) },
}, null, 2));
