#!/usr/bin/env node
// Wayfind Trend Score V1 (lib/trendEngine.js): the model's invariants and the
// worked examples from the owner brief (2026-11-12), asserted on the CALL of
// the real scorer. If a weight changes by accident, an ordering below fails.
// Spec: docs/trending-model-v1.md.
import assert from "node:assert/strict";
import { scoreTrendCandidate, rankTrendCandidates, trendEligibility, TREND_V1 } from "../lib/trendEngine.js";
import { velocityFromRows } from "../lib/trendingSocialServer.js";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const DAY = 86400000;
const NOW = Date.parse("2026-11-12T17:00:00Z"); // a Thursday
const ctx = { today: "2026-11-12", nowMs: NOW, origin: { lat: 27.34, lng: -82.53 }, accountMedianViewsPerDay: 10 }; // Sarasota
const score = (c) => scoreTrendCandidate(c, ctx).score;

const PLACES = {
  sarasota: { lat: 27.34, lng: -82.53 }, parrish: { lat: 27.58, lng: -82.42 }, orlando: { lat: 28.37, lng: -81.52 },
  kissimmee: { lat: 28.34, lng: -81.53 }, cocoa: { lat: 28.32, lng: -80.61 }, miami: { lat: 25.78, lng: -80.19 }, tampa: { lat: 27.95, lng: -82.46 },
};
const ev = (id, where, start, end, extra = {}) => ({ type: "event", id, ...PLACES[where], start_date: start, end_date: end, photo: "x", verified: true, href: "/e/" + id, city: where, ...extra });
const pl = (id, where, extra = {}) => ({ type: "place", id, ...PLACES[where], photo: "x", verified: true, href: "/p/" + id, city: where, ...extra });

// ── The eight brief examples ────────────────────────────────────────────────
const X = {
  surfingSantas: { kind: "social", id: "ig:surf", entity: ev("surfing-santas", "cocoa", "2026-12-24", "2026-12-24"),
    signals: { owned: false, publishedMs: NOW - 1 * DAY, independentCreators: 0 } },
  gaylord: { kind: "social", id: "ig:gay", entity: ev("ice-gaylord", "kissimmee", "2026-11-13", "2027-01-03"),
    signals: { owned: false, publishedMs: NOW - 2 * DAY, independentCreators: 0 } },
  newCafe: { kind: "place", id: "cafe", entity: pl("cafe", "parrish"),
    signals: { firstSeenMs: NOW - 2 * DAY, recentActions: 6, baselineActions: 2 } },
  disneySprings: { kind: "place", id: "ds", entity: pl("ds", "orlando"),
    signals: { recentActions: 30, baselineActions: 140 } },
  localTonight: { kind: "event", id: "tonight", entity: ev("tonight", "sarasota", "2026-11-12", "2026-11-12"), signals: {} },
  evergreen: { kind: "place", id: "evergreen", entity: pl("evergreen", "tampa"), signals: {} },
  farViral: { kind: "event", id: "miami", entity: ev("miami", "miami", "2026-11-14", "2026-11-15"), signals: { independentCreators: 6 } },
  newReel: { kind: "social", id: "ig:new", entity: { type: "guide", id: "g", ...PLACES.tampa, photo: "x", verified: true, href: "/guides/g", city: "tampa" },
    signals: { owned: true, publishedMs: NOW - 2 * 3600000, views: 0, independentCreators: 0 } },
};
const S = Object.fromEntries(Object.entries(X).map(([k, c]) => [k, score(c)]));
console.log("worked examples:", JSON.stringify(S));

// Surfing Santas ranks with NO place record: an event-only social asset.
ok(trendEligibility(X.surfingSantas, ctx).ok && S.surfingSantas > 0, "Surfing Santas (event on a beach, no place) is eligible and scores");
// The local event starting tonight beats the far-away viral one for a Sarasota user...
ok(S.localTonight > S.farViral, `local tonight (${S.localTonight}) outranks the Miami viral event (${S.farViral}) for a Sarasota user`);
// ...but the far one is not impossible: it still beats an evergreen with no momentum.
ok(S.farViral > S.evergreen && S.farViral > S.disneySprings, "a far viral event with 6 creators still beats evergreen attractions with no fresh signal");
// Anti rich-get-richer: Disney Springs' huge normal traffic is not momentum.
ok(S.disneySprings < S.newCafe, `the new café with rising Wayfind interest (${S.newCafe}) outranks Disney Springs at its normal level (${S.disneySprings})`);
ok(S.disneySprings <= 25 && S.evergreen <= 30, "an evergreen place with no fresh evidence stays low (no lifetime popularity input)");
// A brand new Wayfind Reel is surfaced, but publishing alone does not make it #1.
ok(S.newReel > S.evergreen && S.newReel > S.surfingSantas, "a brand new Wayfind Reel is discoverable above stale and far items");
ok(S.newReel < S.localTonight, "publishing a Reel does not outrank a local event happening tonight");
ok(scoreTrendCandidate(X.newReel, ctx).labels.includes("New on Wayfind's Instagram"), "a fresh owned post says so");
// Gaylord (opens tomorrow) beats Surfing Santas (6 weeks out) on urgency.
ok(S.gaylord > S.surfingSantas, "ICE! opening tomorrow outranks a Christmas Eve event six weeks out");

// ── Invariants ─────────────────────────────────────────────────────────────
// Expired events cannot rank.
const ended = { kind: "event", id: "old", entity: ev("old", "sarasota", "2026-11-01", "2026-11-10"), signals: { independentCreators: 4 } };
ok(trendEligibility(ended, ctx).ok === false && trendEligibility(ended, ctx).reason === "event_ended", "an ended event is not eligible");
ok(rankTrendCandidates([ended], ctx).ranked.length === 0, "an ended event never reaches the ranked list");
// A social post about an ended event ages out by its own clock.
ok(!trendEligibility({ kind: "social", id: "s", entity: ended.entity, signals: { publishedMs: NOW - 40 * DAY } }, ctx).ok, "an old post about an ended event is not eligible");
// An older post about an event still ahead stays eligible (the 8 Christmas reels case).
ok(trendEligibility({ kind: "social", id: "s2", entity: ev("ahead", "cocoa", "2026-11-20", "2027-01-03"), signals: { publishedMs: NOW - 46 * DAY } }, ctx).ok, "a 46 day old reel about an event still running stays in Trending");
ok(!trendEligibility({ kind: "social", id: "s3", entity: pl("p", "tampa"), signals: { publishedMs: NOW - 46 * DAY } }, ctx).ok, "a 46 day old post about an evergreen place ages out");
ok(trendEligibility({ kind: "social", id: "s4", entity: pl("p", "tampa"), signals: { publishedMs: NOW - 46 * DAY, inSeason: true } }, ctx).ok, "an in-season seasonal post stays in Trending");
// Velocity elevates a small place; it is relative to its own baseline.
const small = (recent, base) => score({ kind: "place", id: "s", entity: pl("s", "parrish"), signals: { recentActions: recent, baselineActions: base } });
ok(small(12, 2) > small(0, 0) + 15, "strong first-party velocity lifts a small place");
ok(small(300, 1400) < small(12, 2), "a giant at its normal level gets no velocity credit");
ok(small(2, 0) === small(0, 0), "fewer than VELOCITY_MIN_RECENT actions earn nothing (noise floor)");
// Bot / self-click resistance: one device hammering a place counts once a day, or not at all past the cap.
const rows = [];
for (let i = 0; i < 100; i += 1) rows.push({ place_id: "p", device_id: "bot", created_at: new Date(NOW - 3600000).toISOString() });
for (const d of ["a", "b", "c"]) rows.push({ place_id: "p", device_id: d, created_at: new Date(NOW - 7200000).toISOString() });
rows.push({ place_id: "p", device_id: null, created_at: new Date(NOW - 7200000).toISOString() });
const v = velocityFromRows(rows, NOW).get("p");
ok(v.recentActions === 3, `100 clicks from one device count as nothing; 3 real devices count 3 (got ${v.recentActions})`);
const one = velocityFromRows(Array.from({ length: 10 }, () => ({ place_id: "q", device_id: "d", created_at: new Date(NOW - 3600000).toISOString() })), NOW).get("q");
ok(one.recentActions === 1, "ten actions from one device on one day count once");
// Freshness decays.
const fresh = (days) => score({ kind: "social", id: "f", entity: pl("f", "tampa"), signals: { owned: true, publishedMs: NOW - days * DAY } });
ok(fresh(0) > fresh(3) && fresh(3) > fresh(10) && fresh(10) > fresh(25), "freshness decays with post age");
// Distance matters but never zeroes a candidate.
const near = score({ kind: "event", id: "n", entity: ev("n", "sarasota", "2026-11-14", "2026-11-14"), signals: {} });
const far = score({ kind: "event", id: "m", entity: ev("m", "miami", "2026-11-14", "2026-11-14"), signals: {} });
ok(near > far && far > 0, "nearer ranks higher, farther still scores");
// Sold out removes urgency.
ok(score({ ...X.localTonight, entity: { ...X.localTonight.entity, ticket_status: "sold_out" } }) < S.localTonight - 20, "a sold out event loses its urgency");
// Duplicates collapse: two posts about one event are ONE card with an alternate.
const twoPosts = rankTrendCandidates([
  { ...X.gaylord, id: "ig:a" }, { ...X.gaylord, id: "ig:b", signals: { ...X.gaylord.signals, publishedMs: NOW - 5 * DAY } },
], ctx);
ok(twoPosts.ranked.length === 1 && twoPosts.ranked[0].id === "ig:a" && twoPosts.ranked[0].alternates[0] === "ig:b" && twoPosts.collapsed.length === 1, "two posts about one event collapse into one card, the fresher leads, the other is kept as an alternate");
// Repetition: no metro takes more than MAX_PER_METRO_TOP of the head when others wait; nothing is dropped.
const crowd = [];
for (let i = 0; i < 8; i += 1) crowd.push({ kind: "event", id: "t" + i, entity: ev("t" + i, "tampa", "2026-11-12", "2026-11-12", { metro: "tampa" }), signals: {} });
crowd.push({ kind: "event", id: "o1", entity: ev("o1", "orlando", "2026-11-13", "2026-11-13", { metro: "orlando" }), signals: {} });
const spread = rankTrendCandidates(crowd, ctx).ranked;
ok(spread.length === 9, "the diversity pass drops nothing");
ok(spread.slice(0, TREND_V1.MAX_PER_METRO_TOP + 1).some((c) => c.id === "o1"), "another metro breaks into the head before a fifth Tampa event");
// Every score is explained.
const r = scoreTrendCandidate(X.newCafe, ctx);
ok(Math.abs(r.receipt.reduce((t, x) => t + x.points, 0) - r.score) < 0.5 && r.receipt.every((x) => x.key && x.label), "the receipt adds up to the score and names every term");
ok(r.labels.includes("Wayfind is seeing this take off") && r.labels.includes("New this week"), "labels come only from evidence in the receipt");
ok(scoreTrendCandidate(X.evergreen, ctx).labels.length === 0, "no evidence, no trending label");

console.log(`test-trend-engine: OK — ${checks} assertions (8 brief examples ordered as designed; eligibility, velocity, bot cap, decay, distance, collapse, diversity, receipts)`);
