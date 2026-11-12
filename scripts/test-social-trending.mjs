#!/usr/bin/env node
// test-social-trending — the zero-miss guarantee for social Trending, offline.
//
// Runs the real pipeline (lib/trendingSocial.buildTrendingSocial) over the real
// registries (every @gowayfind.app post in data/social/wayfind-instagram.json,
// every creator reel in the curated libraries) with a hermetic stand-in for
// the live event and place tables, and asserts:
//
//   1. MISSING = 0: every eligible asset sits in exactly one Trending card.
//   2. UNKNOWN = 0: every asset is in a card, excluded WITH a reason, or broken.
//   3. BROKEN = 0 and DUPLICATES = 0 on the real registries.
//   4. Carousels are one card each (never one per slide) and their Reel twins
//      ride in that card.
//   5. Surfing Santas (an event with no place record) is in Trending, and the
//      known-good controls (Central Florida Zoo, Water Street, Gaylord Palms,
//      Leu Gardens, Disney Springs, Jock Lindsey's) still are.
//   6. Brand posts are excluded with reason "brand_post"; nothing unpublished
//      (publish time in the future) is shown.
//   7. Negative controls: an injected duplicate permalink, an unreadable
//      permalink and an unpublished post are each caught, proving the probes
//      can see a defect.
//
// The production twin of this check is scripts/check-social-trending-live.mjs.
import { buildTrendingSocial } from "../lib/trendingSocial.js";
import { allSocialAssets } from "../lib/socialAssets.js";
import { ownedRowToAsset } from "../lib/trendingSocialServer.js";

const NOW = Date.parse("2026-11-12T17:00:00Z");
const TODAY = "2026-11-12";
let n = 0;
const fail = (msg) => { console.error("test-social-trending: FAIL — " + msg); process.exit(1); };
const ok = (cond, msg) => { n++; if (!cond) fail(msg); };
const addDays = (d, k) => new Date(Date.parse(d + "T12:00:00Z") + k * 86400000).toISOString().slice(0, 10);

// Hermetic stand-ins: every referenced event is a scheduled Florida event that
// is on now (a few real dates pinned), every referenced place is an open place.
const PINNED_EVENTS = {
  "surfing-santas-cocoa-beach-2026": ["2026-12-24", "2026-12-24", 28.32, -80.61, "Cocoa Beach"],
  "surfing-santas-of-cocoa-beach-2026": ["2026-12-24", "2026-12-24", 28.32, -80.61, "Cocoa Beach"],
};
function makeDeps(assets, overrides = {}) {
  const eventsById = new Map(), eventsBySlug = new Map(), placesById = new Map();
  for (const a of assets) for (const r of a.entities) {
    if (r.type === "event" && !eventsById.has(r.id)) {
      const pin = PINNED_EVENTS[r.id];
      const e = {
        event_id: r.id, slug: r.id, event_name: r.id.replace(/-/g, " "), city: pin ? pin[4] : "Orlando",
        start_date: pin ? pin[0] : addDays(TODAY, -3), end_date: pin ? pin[1] : addDays(TODAY, 30),
        lat: pin ? pin[2] : 28.54, lng: pin ? pin[3] : -81.38, event_status: "scheduled",
        last_verified_at: "2026-11-10T00:00:00Z", hero_image: null,
      };
      eventsById.set(r.id, e); eventsBySlug.set(r.id, e);
    }
    if (r.type === "place" && !placesById.has(r.id)) {
      placesById.set(r.id, { place_id: r.id, name: "Place " + r.id.slice(-6), locality: "Orlando", lat: 28.54, lng: -81.38, status: "OPERATIONAL" });
    }
  }
  return { today: TODAY, nowMs: NOW, eventsById, eventsBySlug, placesById, velocityByPlace: new Map(), extraOwned: [], ...overrides };
}

const assets = allSocialAssets({});
const { items, audit } = buildTrendingSocial({ origin: { lat: 28.54, lng: -81.38 }, deps: makeDeps(assets) });
const c = audit.counts;

// 1–3: reconciliation.
ok(c.published_owned >= 167, `owned inventory shrank: ${c.published_owned} < 167`);
ok(audit.missing.length === 0, `MISSING must be 0, got ${audit.missing.length}: ${audit.missing.slice(0, 10).join(", ")}`);
ok(audit.unknown.length === 0, `UNKNOWN must be 0, got ${audit.unknown.length}: ${audit.unknown.slice(0, 10).join(", ")}`);
ok(audit.excludedWithoutReason.length === 0, `excluded without a reason: ${audit.excludedWithoutReason.join(", ")}`);
ok(audit.broken.length === 0, `BROKEN must be 0: ${JSON.stringify(audit.broken.slice(0, 5))}`);
ok(audit.duplicates.length === 0, `DUPLICATES must be 0: ${JSON.stringify(audit.duplicates.slice(0, 5))}`);
ok(c.eligible > 0 && items.length > 0, "nothing eligible: the pipeline is not running");
const cardIds = new Set();
for (const it of items) for (const id of [it.id, ...it.alternates.map((x) => x.id)]) {
  ok(!cardIds.has(id), `asset ${id} appears in two cards`); cardIds.add(id);
}
for (const id of audit.eligible) ok(cardIds.has(id), `eligible ${id} is in no card`);

// 4: carousels.
const byId = new Map(assets.map((a) => [a.id, a]));
const eligibleCarousels = audit.eligible.filter((id) => byId.get(id).format === "carousel");
ok(eligibleCarousels.length > 0, "no eligible carousel to prove the carousel path");
for (const id of eligibleCarousels) {
  const holders = items.filter((it) => it.id === id || it.alternates.some((x) => x.id === id));
  ok(holders.length === 1, `carousel ${id} is in ${holders.length} cards, expected exactly 1`);
}
const leadCarousel = items.find((it) => it.format === "carousel");
ok(!!leadCarousel, "no card is led by a carousel");
for (const t of audit.twins.filter((t) => audit.eligible.includes(t.of))) {
  const holder = items.find((it) => it.id === t.id || it.alternates.some((x) => x.id === t.id));
  const leaderHolder = items.find((it) => it.id === t.of || it.alternates.some((x) => x.id === t.of));
  ok(holder && holder === leaderHolder, `Reel twin ${t.id} does not ride with its carousel ${t.of}`);
}

// 5: controls.
const cardFor = (code) => items.find((it) => it.permalink.includes(code) || it.alternates.some((x) => x.permalink.includes(code)));
const santas = cardFor("DfmcNtqh7jN");
ok(!!santas, "Surfing Santas reel is not in Trending");
ok(santas.entity.type === "event" && /surfing-santas/.test(santas.entity.id), `Surfing Santas card is not keyed to its event: ${JSON.stringify(santas.entity)}`);
ok(santas.entity.href && santas.entity.href.startsWith("/florida-events/"), "Surfing Santas card does not open the event page");
for (const [name, code] of [["Central Florida Zoo", "Ddy4qUuxk-f"], ["Water Street", "DfZptgYI8gd"], ["Gaylord Palms", "DfmY7TNgVSf"],
  ["Jock Lindsey's", "DfnKtx0p8VL"], ["Leu Gardens", "DfoL0r1h-q5"], ["Leu Gardens 2", "Dfn-NRcPVgT"], ["Disney Springs", "Dfn5LEBRZ7K"]]) {
  ok(!!cardFor(code), `known-good control ${name} (${code}) is not in Trending`);
}
const newest = assets.filter((a) => a.owned && a.kind !== "brand").sort((a, b) => b.publishedMs - a.publishedMs)[0];
ok(!!cardFor(newest.permalink.match(/\/(?:p|reel)\/([^/?#]+)/)[1]), `newest owned post ${newest.id} is not in Trending`);

// 6: exclusions are principled.
for (const x of audit.excluded) {
  const a = byId.get(x.id);
  if (a && a.owned && a.kind === "brand" && !String(x.reason).startsWith("twin_of")) ok(x.reason === "brand_post", `brand post ${x.id} excluded as ${x.reason}`);
}
for (const it of items) ok(!it.publishedAt || Date.parse(it.publishedAt) <= NOW, `unpublished asset ${it.id} is shown`);
for (const it of items) if (it.cover) ok(!/cdninstagram|fbcdn|instagram\.com/.test(it.cover.src), `card ${it.id} hotlinks an Instagram asset as its cover`);

// 7: negative controls — the probes can see a defect.
const dupe = { ...byId.get(newest.id), id: "ig:synthetic-dupe" };
const unreadable = { ...byId.get(newest.id), id: "ig:synthetic-broken", permalink: "https://www.instagram.com/" };
// A real-shaped shortcode whose embedded publish time is 3 days from now.
const IG_ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const codeAt = (ms) => { let v = BigInt(ms - 1314220021721) << 23n, out = ""; while (v > 0n) { out = IG_ALPHA[Number(v % 64n)] + out; v /= 64n; } return out; };
const future = { ...byId.get(newest.id), id: "ig:synthetic-future", twinOf: null, permalink: "https://www.instagram.com/p/" + codeAt(NOW + 3 * 86400000) + "/" };
const scheduled = { ...byId.get(newest.id), id: "ig:synthetic-scheduled", twinOf: null, status: "scheduled", permalink: "https://www.instagram.com/p/" + codeAt(NOW - 3600000) + "/" };
const neg = buildTrendingSocial({ origin: null, deps: makeDeps(assets, { extraOwned: [dupe, unreadable, future, scheduled] }) }).audit;
ok(neg.duplicates.some((d) => d.id === "ig:synthetic-dupe" || d.other === "ig:synthetic-dupe"), "negative control: duplicate permalink was not caught");
ok(neg.broken.some((b) => b.id === "ig:synthetic-broken"), "negative control: unreadable permalink was not caught");
ok(neg.excluded.some((x) => x.id === "ig:synthetic-future" && x.reason === "not_yet_published") && !neg.eligible.includes("ig:synthetic-future"), "negative control: an unpublished post was not held back");
ok(neg.excluded.some((x) => x.id === "ig:synthetic-scheduled" && x.reason === "not_published:scheduled") && !neg.eligible.includes("ig:synthetic-scheduled"), "negative control: a scheduled (not yet published) post was not held back");

// 7b: every post folded into a card is still reachable (its own link), and a
// Wayfind roundup post is titled by itself, not by its first linked plan.
for (const it of items) for (const a of it.alternates) ok(/^https:\/\/www\.instagram\.com\/(p|reel)\//.test(a.permalink), `alternate ${a.id} in card ${it.id} has no link`);
{
  const roundup = items.find((it) => it.id === "ig:DfmwfHEFvPw");
  ok(!roundup || roundup.title !== roundup.entity.name, `the multi-plan carousel ig:DfmwfHEFvPw is titled by one plan (${roundup && roundup.title})`);
  if (roundup) ok(!/[\u2010-\u2015-]|#|@/.test(roundup.title), `post title carries a dash, tag or mention: ${roundup.title}`);
}

// 8: rows from the ingestion table (wf_owned_social) override the snapshot.
{
  const code = newest.permalink.match(/\/(?:p|reel)\/([^/?#]+)/)[1];
  const base = { shortcode: code, permalink: newest.permalink, format: newest.format, published_at: new Date(newest.publishedMs).toISOString(), caption: "x", place_ids: [], event_ids: [] };
  const run = (row) => buildTrendingSocial({ origin: null, deps: makeDeps(assets, { extraOwned: [ownedRowToAsset(row)] }) });
  const del = run({ ...base, lifecycle: "deleted", eligibility: "excluded", exclusion_reason: "deleted_on_instagram" }).audit;
  ok(del.excluded.some((x) => x.id === newest.id && /^not_published:deleted|^excluded:deleted_on_instagram/.test(x.reason)) && !del.eligible.includes(newest.id), "a post deleted on Instagram (table row) still shows");
  const brand = run({ ...base, lifecycle: "published", eligibility: "excluded", exclusion_reason: "ad_creative" }).audit;
  ok(brand.excluded.some((x) => x.id === newest.id), "a table brand exclusion does not apply");
  const cover = run({ ...base, lifecycle: "published", eligibility: "eligible", cover_url: "https://gbhtoehdxkzjsmmkisgu.supabase.co/storage/v1/object/public/owned-social/" + code + ".jpg" });
  const card = cover.items.find((it) => it.id === newest.id || it.alternates.some((x) => x.id === newest.id));
  ok(card && cover.audit.missing.length === 0, "a table-synced eligible post is not in Trending");
  if (card && card.id === newest.id) ok(card.cover && card.cover.kind === "post" && /owned-social/.test(card.cover.src), "the stored first-party cover is not used for our own post");
  const brandSnap = assets.find((x) => x.owned && x.kind === "brand" && !x.twinOf);
  const bcode = brandSnap.permalink.match(/\/(?:p|reel)\/([^/?#]+)/)[1];
  const back = buildTrendingSocial({ origin: null, deps: makeDeps(assets, { extraOwned: [ownedRowToAsset({ shortcode: bcode, permalink: brandSnap.permalink, format: brandSnap.format, published_at: new Date(NOW - 86400000).toISOString(), caption: "x", place_ids: [], event_ids: [], lifecycle: "published", eligibility: "eligible" })] }) }).audit;
  ok(!back.excluded.some((x) => x.id === brandSnap.id && x.reason === "brand_post"), "the ingestion table cannot reinstate a post the snapshot marked brand");
  const cdn = run({ ...base, lifecycle: "published", eligibility: "eligible", cover_url: "https://scontent.cdninstagram.com/v/x.jpg" }).items.find((it) => it.id === newest.id);
  ok(!cdn || !cdn.cover || !/cdninstagram/.test(cdn.cover.src), "an Instagram CDN cover leaked onto a card");
}

console.log(`test-social-trending: OK — ${n} assertions; ${assets.length} assets (${c.published_owned} owned: ${c.owned_reels} reels, ${c.owned_carousels} carousels, ${c.owned_images} images; ${c.creator_assets} creator), eligible ${c.eligible}, in ${c.in_trending_cards} cards, excluded ${c.excluded}, twins riding ${c.twins_represented_by_carousel}, missing 0, unknown 0, broken 0, duplicates 0`);
