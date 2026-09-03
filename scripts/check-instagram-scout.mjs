#!/usr/bin/env node
// scripts/check-instagram-scout.mjs — the Instagram scout, executed.
//
// Four laws, and the reason each exists:
//
//  1. IT SHIPS DARK. Without credentials every builder returns null and the
//     route makes ZERO network calls. Same rule as lib/affiliates.js: a missing
//     partner id renders nothing rather than emitting a broken link.
//  2. IT NEVER SCRAPES. No instagram.com URL is ever constructed. Every read is
//     graph.facebook.com. Scraping is what gets the account banned, and the ban
//     is permanent — so this is asserted, not left to reviewer memory.
//  3. A CAPTION IS NOT AN EVENT. toCandidate refuses a post with no seasonal
//     substance, and the pipeline writes wf_social_candidates — never wf_events.
//     An Instagram caption is evidence an event may exist, never proof of when.
//  4. IT STAYS INSIDE META'S CAP. 30 unique hashtags per rolling 7 days is an
//     account-level limit; blowing it degrades the whole app's Instagram access.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { toCandidate, rankCandidates, engagementScore, isVideo, captionSignals, HASHTAG_WEEKLY_LIMIT } from "../lib/instagramGraph.js";
import { IG_HANDLES, IG_HASHTAGS, hashtagsForWeek } from "../lib/instagramSources.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };

// ── 1. ships dark / lights up, BY CALL IN A CHILD PROCESS ────────────────
// The dark and lit paths are decided by env, so this guard must NOT read the
// ambient environment (scripts/check-guard-hermeticity.mjs): a developer with a
// real IG token in their shell would otherwise get a different verdict than CI.
// Each mode runs in a child process with an EXPLICIT env, the pattern
// scripts/check-monetized-degrade.mjs established.
function probe(env) {
  const src = `
    import { igConfigured, hashtagIdUrl, hashtagMediaUrl, businessDiscoveryUrl } from ${JSON.stringify(path.join(ROOT, "lib/instagramGraph.js"))};
    console.log(JSON.stringify({
      configured: igConfigured(),
      hashtag: hashtagIdUrl("#PumpkinPatch"),
      media: hashtagMediaUrl("123"),
      discovery: businessDiscoveryUrl("@HunsaderFarms"),
      badHandle: businessDiscoveryUrl("bad handle!"),
      badTag: hashtagIdUrl("bad tag!"),
    }));`;
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", src], {
    // No ambient env at all — not even PATH, because process.execPath is
    // absolute. The child sees exactly the two variables under test, so this
    // guard answers the same in a clean shell and in one with a real IG token.
    env, encoding: "utf8", timeout: 20000,
  });
  return JSON.parse(out);
}

const dark = probe({ IG_GRAPH_TOKEN: "", IG_BUSINESS_ACCOUNT_ID: "" });
ok(dark.configured === false, "unconfigured -> igConfigured() is false");
ok(dark.hashtag === null, "unconfigured -> no hashtag lookup URL");
ok(dark.media === null, "unconfigured -> no hashtag media URL");
ok(dark.discovery === null, "unconfigured -> no business discovery URL");

const placeholder = probe({ IG_GRAPH_TOKEN: "[SENSITIVE]", IG_BUSINESS_ACCOUNT_ID: "[SENSITIVE]" });
ok(placeholder.configured === false, "a `vercel env pull` [SENSITIVE] placeholder counts as UNCONFIGURED, never as a token");

const lit = probe({ IG_GRAPH_TOKEN: "TESTTOKEN", IG_BUSINESS_ACCOUNT_ID: "17841400000000000" });
ok(lit.configured === true, "configured -> igConfigured() is true");
ok(/^https:\/\/graph\.facebook\.com\/v\d+\.\d+\/ig_hashtag_search\?/.test(lit.hashtag), "hashtag lookup hits graph.facebook.com");
ok(lit.hashtag.includes("q=pumpkinpatch"), "…with the tag normalised (# stripped, lowercased)");
ok(/business_discovery\.username\(hunsaderfarms\)/.test(decodeURIComponent(lit.discovery)), "business discovery normalises the handle (@ stripped, lowercased)");
ok(lit.badHandle === null && lit.badTag === null, "a malformed handle or tag builds no URL at all");

// ── 2. it never scrapes ───────────────────────────────────────────────────
// CODE ONLY. These files DOCUMENT the dead scraping endpoints (?__a=1) and say
// in prose that they never write wf_events — so a naive substring scan flags the
// very comments that explain the rule. CLAUDE.md's own lesson: model the scope,
// do not approximate it. Comments and string literals are blanked first.
function stripComments(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, " ")   // block comments
    .replace(/^\s*\/\/.*$/gm, " ")        // whole-line comments
    .replace(/([^:"'`])\/\/.*$/gm, "$1 ");  // trailing comments, sparing "https://"
}
// Comments removed, STRING LITERALS KEPT. An earlier version of this guard also
// blanked strings — and a red-prove that inserted a real
// fetch("https://www.instagram.com/p/...?__a=1") sailed straight through it,
// because the URL lives in a string. Blanking strings would have made the most
// important assertion in this file unable to fail.
const libRaw = read("lib/instagramGraph.js");
const routeRaw = read("app/api/cron/instagram-scout/route.js");
const sourcesRaw = read("lib/instagramSources.js");
const lib = stripComments(libRaw), route = stripComments(routeRaw), sources = stripComments(sourcesRaw);
const code = lib + route + sources;
// Controls: the stripper must keep real code and must remove the prose, or every
// assertion below passes vacuously.
ok(/function toCandidate/.test(lib) && /export async function GET/.test(route), "control: stripComments() keeps real declarations (the scan is not vacuous)");
ok(/graph\.facebook\.com/.test(lib), "control: stripComments() keeps string literals — the scrape check can actually fail");
ok(!/robots\.txt/.test(lib), "control: stripComments() removed the prose (the robots.txt comment is gone)");
const scrapeShapes = [/fetch\(\s*["'`]https:\/\/(?:www\.)?instagram\.com/, /__a=1/, /instagram\.com\/p\/[^"'`]*\/?\?/, /puppeteer|playwright/i];
for (const rx of scrapeShapes) ok(!rx.test(code), `no scraping shape in the pipeline (${rx})`);
ok(!/https:\/\/(?:www\.)?instagram\.com/.test(lib), "lib/instagramGraph.js never constructs an instagram.com URL");

// ── 3. a caption is not an event ──────────────────────────────────────────
const dated = { id: "a", permalink: "https://instagram.com/p/a", media_type: "VIDEO", like_count: 500, comments_count: 40, caption: "Pumpkin Festival — October 10 & 11, 9am to 5pm!" };
const vibes = { id: "b", permalink: "https://instagram.com/p/b", media_type: "IMAGE", like_count: 9000, comments_count: 700, caption: "gorgeous light today ✨" };
const undatedFall = { id: "c", permalink: "https://instagram.com/p/c", media_type: "IMAGE", like_count: 800, comments_count: 20, caption: "our corn maze is back!" };
ok(toCandidate(vibes, { source: "hashtag" }) === null, "a viral post with no seasonal substance is NOT a lead, however many likes it has");
const dc = toCandidate(dated, { source: "hashtag", tag: "pumpkinpatch" });
const uc = toCandidate(undatedFall, { source: "hashtag", tag: "cornmazeflorida" });
ok(!!dc && dc.has_date && dc.has_time, "a caption naming a date and a time is recorded as dated and timed");
ok(!!uc && uc.has_date === false, "a seasonal caption with no date is kept, but flagged undated");
ok(dc.lead_score > uc.lead_score, "the dated video outranks the undated post despite lower raw engagement");
ok(dc.is_video === true && isVideo(vibes) === false, "video is identified from media_type — the owner asked for the videos first");
ok(engagementScore({ like_count: 100, comments_count: 10 }) === 130, "engagement weights a comment 3x a like");
ok(engagementScore({ like_count: 100, comments_count: 0 }, 1000) > engagementScore({ like_count: 100, comments_count: 0 }, 100000),
  "a small local account is not buried by a big one (follower-normalised)");
ok(captionSignals("every weekend in October").dated === true, "recurring phrasing counts as a date hint");
ok(rankCandidates([uc, dc, uc]).map((c) => c.media_id).join(",") === "a,c", "ranking dedups by media id and puts the strongest lead first");
// the boundary that matters
ok(/wf_social_candidates/.test(routeRaw) && !/wf_events/.test(route), "the scout writes wf_social_candidates and NEVER wf_events (code, not the comment saying so)");
ok(/ignoreDuplicates: false/.test(routeRaw), "re-seeing a lead updates it rather than resurrecting a rejected one");

// ── 4. inside Meta's cap ──────────────────────────────────────────────────
ok(HASHTAG_WEEKLY_LIMIT === 30, "the documented Meta cap is pinned in code");
const wk = hashtagsForWeek(new Date("2026-09-03"), 8);
ok(wk.length === 8 && new Set(wk).size === 8, "a weekly slice is 8 unique tags");
ok(wk.length <= HASHTAG_WEEKLY_LIMIT, "…comfortably inside the 30-per-7-days account cap");
const wk2 = hashtagsForWeek(new Date("2026-09-10"), 8);
ok(wk2.join(",") !== wk.join(","), "the slice rotates week to week so every tag gets covered");
ok(new Set(IG_HASHTAGS).size === IG_HASHTAGS.length, "no duplicate hashtags (a duplicate silently wastes the weekly budget)");
ok(new Set(IG_HANDLES.map((h) => h.handle)).size === IG_HANDLES.length, "no duplicate handles");
ok(IG_HANDLES.every((h) => /^[a-z0-9._]{1,30}$/.test(h.handle) && h.why), "every handle is lowercase-valid and carries the reason it is watched");
ok(/wf_social_source_health/.test(routeRaw), "a handle that cannot be resolved is recorded, not retried forever");

// ── 5. the setup path is documented ───────────────────────────────────────
const doc = read("docs/INSTAGRAM_SETUP.md");
ok(/ig_hashtag_search/.test(doc) && /business_discovery/.test(doc), "the doc names both sanctioned endpoints");
ok(/30 unique hashtags/i.test(doc), "the doc states the rate cap");
ok(/share counts do not exist/i.test(doc.toLowerCase()) || /shares.*not.*available/i.test(doc), "the doc is explicit that share counts are not obtainable for other accounts");

console.log(fail ? `check-instagram-scout: FAIL — ${fail} failed, ${pass} passed` : `check-instagram-scout: OK — ${pass} assertions; sanctioned API only, ships dark, leads never become events on their own`);
process.exit(fail ? 1 : 0);
