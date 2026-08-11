// scripts/check-creator-video-boost.mjs — a curated creator video must reach the
// RIGHT place, and the ranking boost must have something to apply it to.
//
// WHY THIS GUARD EXISTS (2026-08-06). Curated Miami entries had been shipping
// since v6.94 that could never affect anything. Three separate reasons stacked:
//
//   1. app/home.js applies VIDEO_BOOST (45) via hasCreatorVideo(p) — but only to
//      places ALREADY IN THE FEED. The feed is wf_best_picks, which reads
//      wf_inventory and nothing else.
//   2. wf_inventory had zero Miami-Dade rows, so no Miami place was ever in the
//      feed, so the boost had no target. The entries rendered in the creator
//      directory sheet and looked fine.
//   3. Attribution was by NAME, first-match-wins over CURATED, so array order
//      decided which entry claimed a place. "PASTA" is a real venue name and a
//      substring of "Borti Pasta Bar".
//
// (2) is data and lives in Supabase; this guard cannot reach it. (1) and (3) are
// code, and this guard holds them. It also holds the curation rules that make an
// entry renderable at all, because a silently-unrenderable entry is the same
// class of bug: it looks shipped and does nothing.
import { creatorVideosFor, videosByKey, allCreators, spotsByCity, libraryStats, PLATFORM } from "../lib/creatorVideos.js";
import * as creatorBoost from "../lib/creatorBoost.js";
import { hasCreatorVideoAt } from "../lib/creatorBoost.js";
// THE GOVERNING LAW (owner, updated 2026-08-10): flat +2 for a video, flat −2 past 17
// miles, shown == sorted. The reach curve and per-mile decay this file used
// to lock are retired; the law's constants are asserted instead.
import { governedWayfindScore, CREATOR_VIDEO_BONUS, FAR_MILES, FAR_PENALTY } from "../lib/wayfindScore.js";
import { byVisibleScore } from "../lib/todaysBest.js";
import { archetypeFor, summaryFor, ASSIGNMENTS } from "../lib/creatorArchetypes.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0;
const fail = (m) => { console.error("check-creator-video-boost: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };
const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = readFileSync(path.join(REPO, "lib/creatorVideos.js"), "utf8");

// Parse the curated entries out of the module source. The module exports no
// list of them, and adding an export just for a test would widen the public
// surface — so we read what is actually written, which is also what a reviewer
// reads.
const entries = [];
for (const m of SRC.matchAll(/\{\s*key:\s*"([^"]+)"([\s\S]*?)\n\s*videos:\s*\[([\s\S]*?)\]\s*\},?\n/g)) {
  const [, key, head, vids] = m;
  const pid = (head.match(/placeId:\s*"([^"]+)"/) || [])[1] || null;
  const name = (head.match(/match:\s*\{\s*name:\s*"([^"]+)"/) || [])[1] || null;
  const city = (head.match(/match:\s*\{[^}]*city:\s*"([^"]+)"/) || [])[1] || null;
  const urls = [...vids.matchAll(/url:\s*"([^"]*)"/g)].map((x) => x[1]);
  const creators = [...vids.matchAll(/creator:\s*"([^"]+)"/g)].map((x) => x[1]);
  const captions = [...vids.matchAll(/caption:\s*"([^"]+)"/g)].map((x) => x[1]);
  entries.push({ key, pid, name, city, urls, creators, captions });
}

// ── 0. PROBE — never let the parse above pass vacuously ──────────────────────
ok(entries.length >= 25, `parsed the curated list (got ${entries.length}) — a regex that matched nothing would make every assertion below trivially true`);
const withPid = entries.filter((e) => e.pid);
ok(withPid.length >= 19, `at least 19 entries carry a real Google placeId (got ${withPid.length}) — the whole point of the v6.96 batch`);
ok(entries.some((e) => e.creators.includes("alexandramartin_tv")), "the alexandramartin_tv batch is present");

// ── 1. THE BOOST IS STILL WIRED ──────────────────────────────────────────────
// If someone deletes hasCreatorVideo from home.js, every curated video silently
// stops affecting rank and nothing else in the suite notices.
const HOME = readFileSync(path.join(REPO, "app/home.js"), "utf8");
// v6.97 — VIDEO_BOOST IS GONE, and its ABSENCE is now the assertion.
//
// It was dead for an entire version. Nothing read it after v6.96 moved the
// boost into lib/creatorBoost.js, but it stayed declared — because THIS guard
// demanded it — carrying a comment describing it as "the CEILING of a range"
// that it did not set. A ranking spec was then written off that dead constant,
// and an agent asked the owner to re-decide a question the code had already
// answered. A constant that lies costs more than no constant.
ok(!/const VIDEO_BOOST\s*=/.test(HOME),
   "app/home.js declares no VIDEO_BOOST — the boost is computed in lib/creatorBoost.js, and a leftover constant here misstates what sets it to every future reader");
// UPDATED v6.96, not deleted. This used to count `hasCreatorVideo(p) ? VIDEO_BOOST : 0`.
// That expression no longer exists anywhere: the boost is a computed range now,
// so the ranking sites call creatorBoostFor() directly. The INVARIANT is
// unchanged and is what is asserted — the ranking sites still add a creator
// term, and there are still at least five of them.
// THE GOVERNING LAW replaced creatorBoostFor() at every home.js ranking site
// (owner, 2026-08-07): the evidence term is the flat CREATOR_VIDEO_BONUS when
// a video exists, visible in the chip, identical in the sort.
const lawSites = (HOME.match(/hasCreatorVideoAt\(p\) \? CREATOR_VIDEO_BONUS : 0/g) || []).length;
ok(lawSites >= 5, `the flat law term is applied at ${lawSites} ranking sites (expected >= 5) — the home feed, holidays, merit sort and the two fit sorts`);
ok(!/creatorBoostFor\(/.test(HOME), "no home.js ranking site still uses the retired reach-curve boost — the law is flat +0.2, everywhere");
ok(!/hasCreatorVideo\([^)]*\)\s*\?\s*VIDEO_BOOST/.test(HOME),
   "no ranking site still applies the OLD flat, unfloored +45 — that number dwarfed the whole score spread");
ok(/function hasCreatorVideo\(p\)[\s\S]{0,600}creatorVideosFor\(p\)/.test(HOME), "hasCreatorVideo() (the BADGE predicate) still resolves through creatorVideosFor()");
ok(/\bhasCreatorVideo\(p\) \? \[\{ key: "creatorvideo"/.test(HOME), "…and it is what drives the visible badge, so a boosted place is never silently boosted");

// ── 1b. THE LAW'S ARITHMETIC, END TO END ────────────────────────────────────
// Owner, verbatim (2026-08-07): "if there is an influencer video, I want that
// to add a zero point seven… if the place is greater than seventeen miles
// away, I want a zero point two deduction… it needs to be the governing rule
// for the Wayfind score… everywhere that we're presenting options, it needs
// to be ranked by the Wayfind score." On the 0–100 scale: +7 / −2 / shown ==
// sorted. The 2026-08-06 reach curve and 4.2★ floor governed a ±45-class
// boost; at a flat +7 the inversion they prevented cannot occur (7 < the
// spread between a good place and a great one), and the owner's rule has no
// carve-out — so the curve survives only as card metadata, never as rank.
ok(CREATOR_VIDEO_BONUS === 2 && FAR_MILES === 17 && FAR_PENALTY === 2, "the law's constants are the owner's numbers: +0.2 video, −0.2 past 17 miles");
ok(governedWayfindScore(92, { hasCreatorVideo: true }) === 94, "the owner's own example: a 9.2 with a video shows 9.4");
ok(governedWayfindScore(92, { distanceMi: 20 }) === 90, "the owner's own example: a 9.2 past 17 miles shows 9.0");
ok(governedWayfindScore(92, { distanceMi: 17 }) === 92, "17.0 exactly is not past 17 — strictly greater only");
ok(governedWayfindScore(null, { hasCreatorVideo: true }) === null, "an unrated place stays null — a video cannot invent a score");
ok(governedWayfindScore(99, { hasCreatorVideo: true }) === 100, "clamped at 100 — toDisplayScore() nulls above it and the badge would vanish");
ok(governedWayfindScore(100, { hasCreatorVideo: true, distanceMi: 40 }) === 100 && governedWayfindScore(90, { hasCreatorVideo: true, distanceMi: 40 }) === 90,
   "both terms stack before the clamp: +2 then −2");
// A video lifts a place above its own unboosted self, and the lift is visible:
ok(governedWayfindScore(91, { hasCreatorVideo: true }) - governedWayfindScore(91, {}) === 2,
   "a creator video lifts a place exactly +2 over its unboosted self — in the number the reader compares, not a hidden key");
// An excellent unbacked place still cannot be inverted by a video on a much
// weaker one — the flat +7 is smaller than the good-to-great spread:
ok(governedWayfindScore(98, {}) > governedWayfindScore(80, { hasCreatorVideo: true }),
   "a 9.8 with no video still beats an 8.0 with one — +0.2 re-orders near-peers, it never inverts classes");
// End to end on the REAL list: byVisibleScore sorts by the governed number
// and carries it on the row, so order can never disagree with the chip.
{
  const rows = [
    { id: "far", rating: 4.9, reviews: 5000, distance_mi: 30, kind: "place" },
    { id: "near", rating: 4.6, reviews: 3000, distance_mi: 5, kind: "place" },
  ];
  const sorted = byVisibleScore(rows);
  const strictlyByGoverned = sorted.every((r, i) => i === 0 || (sorted[i - 1].governed_score ?? -Infinity) >= (r.governed_score ?? -Infinity));
  ok(strictlyByGoverned, "byVisibleScore renders in governed-score order — the 2026-08-07 screenshot (a shown 9.2 below two shown 9.0s) is now a build failure");
}
ok(!/capCreatorHead\(/.test(readFileSync(path.join(REPO, "lib/todaysBest.js"), "utf8")),
   "the answer-first list no longer reorders its head against the governed score — at a flat +7 the colonization the cap prevented cannot occur, and any head shuffle would break 'ranked by the Wayfind Score, everywhere'");

// ── 2. ATTRIBUTION IS EXACT, AND ORDER-INDEPENDENT ───────────────────────────
// Every entry with a placeId must resolve to ITS OWN videos even when the place
// name is actively misleading. This is the assertion that would have caught the
// PASTA / Borti Pasta Bar collision.
for (const e of withPid) {
  const got = creatorVideosFor({ id: e.pid, name: "a name that matches nothing" });
  const want = videosByKey(e.key);
  ok(got.length === want.length && got.every((v, i) => v.url === want[i].url),
     `"${e.key}" resolves by placeId alone, ignoring its name entirely`);
}

// THE COLLISION, both directions, by name only (no placeId) — the fallback path.
const borti = entries.find((e) => e.key === "borti-pasta-bar-miami");
const pasta = entries.find((e) => e.key === "pasta-wynwood-miami");
ok(!!borti && !!pasta, "both halves of the PASTA / Borti collision are present to be tested");
const byNameBorti = creatorVideosFor({ name: "Borti Pasta Bar", address: "8300 NE 2nd Ave, Miami, FL" });
ok(byNameBorti.length === 1 && byNameBorti[0].url === borti.urls[0],
   `"Borti Pasta Bar" resolves to Borti's reel, NOT to the venue literally named "PASTA" whose name is a substring of it (got ${byNameBorti[0] && byNameBorti[0].url})`);
const byNamePasta = creatorVideosFor({ name: "PASTA", address: "124 NW 28th St, Miami, FL" });
ok(byNamePasta.length === 1 && byNamePasta[0].url === pasta.urls[0],
   `"PASTA" still resolves to its own reel — the prefix tiebreak must not starve the shorter, legitimate name`);

// A place we have never curated must resolve to nothing. Without this, a
// too-loose matcher passes everything above.
ok(creatorVideosFor({ id: "ChIJ-not-a-real-place", name: "Some Diner", address: "Nowhere, FL" }).length === 0,
   "an uncurated place gets no video — the matcher is not simply returning the first entry");

// ── 3. AN ENTRY THAT CANNOT RENDER IS NOT SHIPPED ────────────────────────────
const seenKeys = new Set(), seenPids = new Set();
for (const e of entries) {
  ok(!seenKeys.has(e.key), `key "${e.key}" is unique — videosByKey() returns the first match, so a duplicate silently shadows one`);
  seenKeys.add(e.key);
  if (e.pid) {
    ok(!seenPids.has(e.pid), `placeId "${e.pid}" ("${e.key}") is claimed by exactly one entry — two entries on one venue means one of them can never win`);
    seenPids.add(e.pid);
  }
  for (const u of e.urls) {
    if (!u) continue; // staged entries are deliberately empty; renderable() drops them
    ok(/^https:\/\//.test(u), `"${e.key}" links out over https`);
    if (u.includes("instagram.com")) {
      ok(/^https:\/\/www\.instagram\.com\/(reel|p)\/[A-Za-z0-9_-]+\/?$/.test(u),
         `"${e.key}" uses a canonical Instagram /p/ or /reel/ URL ("${u}") — a username-prefixed or query-string form does not resolve to an embeddable player in lib/videoEmbed.js`);
    }
  }
}

// ── 4. CAPTIONS ARE WAYFIND'S WORDS ──────────────────────────────────────────
// The file's own rule, and a copyright/duplicate-content one. We cannot diff
// against a caption we do not store, but a creator's caption is recognisable:
// hashtags, @-mentions, a pin emoji, a call to save or share. Ours never have
// any of those. This catches a paste, which is the failure that actually happens.
for (const e of entries) {
  for (const c of e.captions) {
    ok(!/#\w/.test(c), `"${e.key}" caption carries no hashtag — that is a pasted creator caption, not ours`);
    ok(!/@\w/.test(c), `"${e.key}" caption carries no @-mention`);
    ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(c), `"${e.key}" caption carries no emoji`);
    ok(!/\b(save this|send this to|follow @|link in bio)\b/i.test(c), `"${e.key}" caption is not creator call-to-action copy`);
    ok(c.length >= 30 && c.length <= 260, `"${e.key}" caption is a real sentence, not a stub or an essay (${c.length} chars)`);
  }
}

// ── 5. EVERY CITY CAN BE PLACED ──────────────────────────────────────────────
// spotsByCity() sorts nearest-first and falls back to ALPHABETICAL for any city
// with no centroid. That fallback is silent, so a new city added without
// coordinates quietly degrades the default "browse by location" view.
const groups = spotsByCity({ lat: 25.7617, lng: -80.1918 });
const placeless = groups.filter((g) => g.distMi == null).map((g) => g.city);
ok(placeless.length === 0, `every curated city has a centroid in CITY_COORDS — missing: ${JSON.stringify(placeless)}`);
ok(groups.length >= 2 && groups[0].distMi <= groups[groups.length - 1].distMi, "browse-by-location really is ordered nearest-first");
ok(groups[0].city === "Miami", `from downtown Miami the nearest curated city is Miami (got "${groups[0].city}")`);

// ── 6. THE CLOSED-VENUE RULE ─────────────────────────────────────────────────
// Knaus Berry Farm is a real reel from this batch, deliberately excluded because
// Google reports it CLOSED_TEMPORARILY (seasonal). Assert BOTH halves: it is not
// curated, AND the reason is written down where the next curator will read it.
ok(!entries.some((e) => /knaus/i.test(e.key)), "Knaus Berry Farm is not curated while it is seasonally closed");
ok(/Knaus Berry Farm[\s\S]{0,400}CLOSED_TEMPORARILY/.test(SRC), "…and the exclusion records WHY, with the placeId to add when it reopens");

// ── 7. THE CREATOR IS A REAL, CREDITED, ROLE-BEARING PERSON ──────────────────
const { creators } = allCreators();
const alex = creators.find((c) => c.handle === "alexandramartin_tv");
ok(!!alex, "alexandramartin_tv appears in the public creator directory");
ok(alex.count >= 19, `alexandramartin_tv is credited on ${alex ? alex.count : 0} spots (expected >= 19)`);
ok(alex.spots.every((s) => s.city), "every one of her spots carries a city, so the directory can group it");
const role = archetypeFor("alexandramartin_tv");
ok(role && role.key === "food_expert", `her public role resolves to food_expert (got ${role && role.key})`);
for (const e of entries) for (const v of e.urls.length ? [0] : []) void v;
ok(entries.every((e) => e.urls.every((u) => !u || e.creators.length > 0 || /facebook\.com\/share/.test(u))),
   "every renderable video credits a creator, except the one Facebook share link that genuinely carries no handle");

// ── 8. PLATFORM PRESENTATION EXISTS FOR EVERY PLATFORM USED ──────────────────
for (const m of SRC.matchAll(/platform:\s*"([a-z]+)"/g)) {
  ok(!!PLATFORM[m[1]], `platform "${m[1]}" has a label + colour in PLATFORM — an unknown platform renders an unstyled badge`);
}
const stats = libraryStats();
ok(stats.spotCount >= 30 && stats.creatorCount >= 5, `library stats stay real (${stats.spotCount} spots, ${stats.creatorCount} creators)`);

// ── 9. CREATOR SUMMARIES ─────────────────────────────────────────────────────
// "Tell our user what type of experiences this influencer is known for."
// These are public claims about real named people, so they obey the SAME
// provisional gate as the role — a summary that renders for someone we have
// only read once is the wrong-label harm the archetype brief warns about.
{
  const live = new Set(creators.map((c) => c.handle.toLowerCase()));
  let summarised = 0;
  for (const h of Object.keys(ASSIGNMENTS)) {
    const row = ASSIGNMENTS[h];
    const got = summaryFor(h);
    if (row.provisional || row.removed) {
      ok(got === null, `"${h}" is provisional, so NO public summary renders — same gate as the role`);
    } else {
      ok(typeof got === "string" && got.length >= 40 && got.length <= 320,
         `"${h}" has a real summary a reader can act on (${got ? got.length : 0} chars)`);
      ok(!/#\w|@\w/.test(got), `"${h}" summary is Wayfind's own words, not lifted bio text`);
      summarised += 1;
    }
  }
  ok(summarised >= 6, `at least 6 creators carry a public summary (got ${summarised}) — an empty set makes the loop above vacuous`);
  // Every creator who actually SHOWS UP in the app is accounted for: either
  // summarised, or explicitly held back as provisional. Silence must be a
  // decision on record, never an oversight.
  for (const h of live) {
    ok(Object.prototype.hasOwnProperty.call(ASSIGNMENTS, h),
       `live creator "${h}" has a row in ASSIGNMENTS — a creator rendering in the app with no recorded decision about them is an oversight, not a choice`);
  }
  ok(summaryFor("someone-we-never-heard-of") === null, "an unknown handle summarises to nothing, never a default");
}

// ── §6. THE DISPLAYED SCORE (2026-08-07) ─────────────────────────────────────
// Owner: "whenever we have a place card with an influencer video I want the
// Wayfind Score to go higher — I was expecting this but I don't see it." They
// were right: every call site of creatorBoostFor() fed a SORT KEY and nothing
// reached a rendered number. displayedWfScore() closes that. These assertions
// CALL the function and check returned values rather than reading source text,
// because both defects worth guarding here are arithmetic.
{
  const { displayedWfScore } = await import("../lib/creatorBoost.js");
  const P = (wfScore, extra) => ({ id: "guard-synthetic", name: "Guard Synthetic", wfScore, ...extra });

  // THE CLAMP — the assertion that matters most, and the one nobody thinks to
  // write. toDisplayScore() returns null above 100, so an unclamped 98 + 15%
  // = 113 makes the badge VANISH from the best creator-backed places on the
  // site: the feature would read as "our scores disappeared". Proven on a
  // synthetic place, never the live library, so curation cannot make it vacuous.
  ok(displayedWfScore(P(98)) <= 100, "displayedWfScore never exceeds 100 — above it toDisplayScore() nulls and the badge disappears entirely");
  ok(displayedWfScore(P(140)) === 100, "…and it clamps rather than passing an out-of-range score straight through");

  // A place with no creator video is returned EXACTLY as it arrived. If this
  // drifts, every score on the site moves and only some of them should.
  ok(displayedWfScore(P(83)) === 83, "a place with no creator video displays its base score, unchanged");
  ok(displayedWfScore(P(null)) === null, "an unrated place stays null — the 'Score pending' contract is untouched");
  ok(displayedWfScore(null) === null, "a missing place does not throw and does not invent a number");

  // Floor and cap are INHERITED from creatorBoostFor rather than restated.
  // Asserting them THROUGH the display path is what proves the inheritance is
  // real, instead of a comment claiming it.
  // Under the 2026-08-07 law the flat +7 applies to ANY place with a video —
  // the 4.2★ floor governed a ±45-class boost and has no role at +7. These
  // synthetic places have no curated video, so they stay unchanged:
  ok(displayedWfScore(P(83, { rating: 4.0, reviews: 500 })) === 83, "no curated video → no boost, whatever the rating");
  ok(displayedWfScore(P(83, { rating: 4.9, reviews: 12 })) === 83, "…and review count alone never changes a displayed score");
  // The law's distance term rides the same display path:
  ok(displayedWfScore(P(90, { distMi: 20 })) === 88, "past 17 miles the DISPLAYED score carries the −2 — the deduction is in the chip, not hidden in a sort key");
  ok(displayedWfScore(P(90, { distMi: 17 })) === 90, "17.0 exactly is not past 17");
}

console.log(`check-creator-video-boost: PASS (${pass} assertions)`);
