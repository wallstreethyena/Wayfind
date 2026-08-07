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
import { creatorBoostFor, evidenceBoost, EVIDENCE_CAP_FRAC } from "../lib/creatorBoost.js";
// The real ordering key the home list sorts on, so the invariant below is
// asserted end to end rather than against a formula retyped into this file.
import { driveDeduction } from "../lib/todaysBest.js";
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
const callSites = (HOME.match(/creatorBoostFor\(/g) || []).length;
ok(callSites >= 5, `a creator term is applied at ${callSites} ranking sites (expected >= 5) — the home feed, holidays, merit sort and the two fit sorts`);
ok(!/hasCreatorVideo\([^)]*\)\s*\?\s*VIDEO_BOOST/.test(HOME),
   "no ranking site still applies the OLD flat, unfloored boost — a leftover one would rank a 3.7-star place off a creator video");
ok(/function hasCreatorVideo\(p\)[\s\S]{0,600}creatorVideosFor\(p\)/.test(HOME), "hasCreatorVideo() (now the BADGE predicate) still resolves through creatorVideosFor()");
ok(/\bhasCreatorVideo\(p\) \? \[\{ key: "creatorvideo"/.test(HOME), "…and it is what drives the visible badge, so a boosted place is never silently boosted");

// ── 1b. THE FLOOR AND THE REACH SCALE ────────────────────────────────────────
ok(creatorBoost.CREATOR_MIN_RATING >= 4 && creatorBoost.CREATOR_MIN_REVIEWS >= 20,
   `the quality floor is real (${creatorBoost.CREATOR_MIN_RATING}★ / ${creatorBoost.CREATOR_MIN_REVIEWS} reviews) — a floor below 4 would not exclude anything the owner asked to exclude`);
ok(creatorBoostFor({ id: "x", name: "n", rating: 3.7, reviews: 56 }) === 0, "a 3.7-star place is never moved by a creator video, even a curated one");
ok(creatorBoostFor({ id: "x", name: "n", rating: 4.9, reviews: 15 }) === 0, "a 4.9-star place with 15 reviews is never moved — too few reviews to stand behind");
ok(creatorBoostFor({ id: "x", name: "n", reviews: 5000 }) === 0, "an UNRATED place is never moved — the floor fails closed, it does not assume the best");
{
  const palmette = entries.find((e) => e.key === "palmette-tampa");
  const riverwalk = entries.find((e) => e.key === "riverwalk-terrace-tampa");
  ok(!!palmette && !!riverwalk, "the two sub-floor curated places are still CURATED — the floor governs rank, it does not delete the creator's work");
  ok(creatorVideosFor({ id: palmette.pid, name: "x" }).length === 1, "…and Palmette still resolves its video for the place card");
  ok(creatorBoostFor({ id: palmette.pid, name: "x", rating: 3.7, reviews: 56 }) === 0, "…while earning no rank boost at all");
}
{
  // ── THE CURVE — asserted on RETURNED VALUES, not on constants ────────────
  // Q = 91 is 4.6★ / 500 reviews through wayfindScore(), a real shape from the
  // curated corpus rather than a number invented for the test.
  const Q = 91;
  const at = (r) => evidenceBoost(Q, r);
  ok(at(11900) > at(2800) && at(2800) > at(650),
     `more reach earns a bigger boost (650→+${at(650)}, 2800→+${at(2800)}, 11900→+${at(11900)}) — the owner's ask, and the thing a hard clamp at the cap would have destroyed`);
  ok(at(0) > 0, "a video with no recorded reach still earns something, never nothing");
  ok(at(10 ** 9) <= Math.ceil(EVIDENCE_CAP_FRAC * Q),
     `the boost is capped at ${EVIDENCE_CAP_FRAC * 100}% of the place's OWN quality (+${at(10 ** 9)} against ${Q}) — a viral post cannot buy unbounded rank`);
  ok(at(11900) - at(650) >= 4,
     `the reach band still SPREADS (+${at(650)} → +${at(11900)}) — a bound that lands 650 likes and 11,900 likes on the same number is not a scale, it is a clamp`);

  // ── BOUNDED RELATIVE TO QUALITY ──────────────────────────────────────────
  ok(evidenceBoost(98, 10 ** 9) > evidenceBoost(80, 10 ** 9),
     "a better place has more headroom than a floor-quality one — the ceiling is a share of quality, never a flat number");
  ok(evidenceBoost(null, 10 ** 9) === 0 && evidenceBoost(0, 10 ** 9) === 0,
     "an unrated place earns no evidence boost — 15% of nothing is nothing, and the floor already failed it closed");

  // ── THE §0.1 INVARIANT, END TO END ON THE REAL ORDERING KEY ──────────────
  // key = wayfindScore/10 − driveDeduction(mi) + boost/10   (lib/todaysBest.js)
  const key = (q, mi, reach) => q / 10 - driveDeduction(mi) + (reach == null ? 0 : evidenceBoost(q, reach)) / 10;
  ok(key(98, 1, null) > key(80, 1, 10 ** 9),
     `an excellent place with no video outranks a floor-quality place with a viral one (${key(98, 1, null).toFixed(2)} vs ${key(80, 1, 10 ** 9).toFixed(2)}) — evidence re-orders the qualified set, it never inverts it`);
  ok(key(98, 1, null) > key(80, 25, 10 ** 9),
     `…and beats its 25-mile version comfortably (${key(98, 1, null).toFixed(2)} vs ${key(80, 25, 10 ** 9).toFixed(2)}) — distance now outweighs the evidence term, which it did not before v6.97`);
  ok(key(91, 3, 650) > key(91, 3, null),
     "a creator video still visibly lifts a place above its own unboosted self — this is bounded, not neutered");
  ok(key(91, 3, 11900) > key(98, 3, null),
     "…and a well-backed good place can still beat an unbacked better one — evidence has to be able to change the answer or it is decoration");
}
{
  // THE HEAD CAP, at the exact numbers the owner chose.
  const mk = (n, boosted) => Array.from({ length: n }, (_, i) => ({ i, boosted }));
  const rows = [...mk(6, true), ...mk(6, false)].map((r, i) => ({ ...r, i }));
  const capped = creatorBoost.capCreatorHead(rows, (r) => r.boosted);
  const headBoosted = capped.slice(0, creatorBoost.CREATOR_HEAD).filter((r) => r.boosted).length;
  ok(headBoosted === creatorBoost.CREATOR_HEAD_MAX,
     `at most ${creatorBoost.CREATOR_HEAD_MAX} of the top ${creatorBoost.CREATOR_HEAD} are creator picks (got ${headBoosted}) — otherwise one creator owns the whole list`);
  ok(capped.length === rows.length, "the cap DEMOTES, it never drops a place");
  ok(capped.slice(0, 3).every((r) => r.boosted), "…and the creator picks that do make the head are the strongest ones, still at the very top");
  const demotedAt = capped.findIndex((r, i) => i >= creatorBoost.CREATOR_HEAD && r.boosted);
  ok(demotedAt === creatorBoost.CREATOR_HEAD, `a demoted pick lands immediately after the head (slot ${demotedAt + 1}), not at the bottom of the list`);
}
ok(/capCreatorHead\(/.test(readFileSync(path.join(REPO, "lib/todaysBest.js"), "utf8")),
   "the ANSWER-FIRST list applies the head cap — that list leads the home page, so a cap only on the grid below it would be cosmetic");
ok(/creatorBoostFor\(/.test(readFileSync(path.join(REPO, "lib/todaysBest.js"), "utf8")),
   "…and applies the boost at all, which it did not before v6.96");

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
  ok(displayedWfScore(P(83, { rating: 4.0, reviews: 500 })) === 83, "a place below the 4.2-star floor is not lifted by the display path either");
  ok(displayedWfScore(P(83, { rating: 4.9, reviews: 12 })) === 83, "…nor is a place below the 30-review floor");
}

console.log(`check-creator-video-boost: PASS (${pass} assertions)`);
