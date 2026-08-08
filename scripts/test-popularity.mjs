// scripts/test-popularity.mjs — lock test for the Tier-2 popularity fetchers
// (lib/popularity.js + the cron). Pins: metrics are oriented higher=better
// and NEVER fabricated (missing field or weak match -> no row), routing by
// category, the TripAdvisor budget cap, service-only batch fn, cron auth.
import { readFileSync } from "fs";
import { nameSim, matchConfidence, bestMatch, sourcesFor, SOURCE_CAPS, CONFIDENCE_FLOOR } from "../lib/popularity.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };

// matching
ok(nameSim("Anna Maria Oyster Bar", "Anna Maria Oyster Bar Ellenton") > 0.7, "near-identical names score high");
ok(nameSim("PopStroke", "Olive Garden") < 0.2, "unrelated names score low");
const place = { name: "Siesta Beach", lat: 27.2675, lng: -82.5497 };
ok(matchConfidence(place, { name: "Siesta Beach", lat: 27.2676, lng: -82.5498 }) > 0.95, "same name + same spot ≈ 1");
ok(matchConfidence(place, { name: "Siesta Beach", lat: 27.4, lng: -82.4 }) < 0.75, "same name 10mi away loses the proximity share");
ok(matchConfidence(place, { name: "Siesta Beach", lat: null, lng: null }) <= 0.7, "no coords never scores higher than with coords");
ok(bestMatch(place, [{ name: "Turtle Beach", lat: 27.22, lng: -82.51 }]) === null, "weak best match -> null, not a bad row");
ok(CONFIDENCE_FLOOR >= 0.5, "confidence floor is real");

// routing
ok(sourcesFor("food").includes("yelp") && !sourcesFor("food").includes("wikipedia"), "food -> yelp, not wikipedia");
ok(sourcesFor("beach").includes("wikipedia") && sourcesFor("attractions").includes("wikipedia"), "attractions/beaches -> wikipedia");
ok(sourcesFor("shopping").includes("foursquare"), "everything -> foursquare");
ok(SOURCE_CAPS.tripadvisor <= 25, "tripadvisor per-run cap respects the 5k/month tier");

// source contract
const lib = readFileSync(new URL("../lib/popularity.js", import.meta.url), "utf8");
ok(/besttime[\s\S]{0,200}address/i.test(lib), "besttime absence is documented (needs addresses we do not store), not silent");
ok(/ticketmaster\/predicthq — event demand/.test(lib), "event-demand sources documented as follow-ups, not faked");
ok(/typeof m\.cand\.popularity !== "number"\)\s*\{[^}]*return null/.test(lib), "foursquare popularity is used only when the API returns it (tier-gate intact through the 2026 dual-endpoint migration)");
ok(lib.includes("places-api.foursquare.com/places/search") && lib.includes('"X-Places-Api-Version": "2025-06-17"'), "foursquare fetcher reaches the post-sunset Places API (legacy v3 died 2026-05-15 — the silent zero-rows root cause)");
ok(lib.includes("r.fsq_place_id || r.fsq_id"), "both response generations parse (fsq_place_id new, fsq_id legacy)");
ok(/export const POP_DIAG/.test(lib) && /notePop\(/.test(lib), "per-source outcome diagnostics exist — a dead source must name itself in the cron log");
const route = readFileSync(new URL("../app/api/cron/popularity/route.js", import.meta.url), "utf8");
ok(route.includes('auth !== "Bearer " + secret'), "cron is CRON_SECRET-gated");
ok(route.includes("SUPABASE_SERVICE_ROLE_KEY"), "writes go through the service role");
ok(route.includes('onConflict: "place_id,source"'), "one row per place per source (upsert)");
ok(route.includes("wf_popularity_stale_batch"), "batch = the stalest places, not a random scan");
ok(route.includes('recordPulse("popularity:" + src'), "every source records its OWN jobPulse — a dead source flatlines its pulse and job-watch emails it by name (the 3-month silent Foursquare death can never recur)");
ok(/onlyNoKey \? 0 : spent\[src\]/.test(route), "a missing key pulses idle (not configured != failing) — deliberate key removal never pages");
const vj = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
ok((vj.crons || []).some((c) => c.path === "/api/cron/popularity" && /\*\/[12]\b/.test(c.schedule)), "cron runs at least every 2 hours (accelerated 2026-08-08 for the post-sunset coverage rebuild)");

// v6.57: Wikimedia calls must carry the descriptive User-Agent (their API
// policy — datacenter IPs without it are rejected; the 0/50 first harvest).
{
  const lp = readFileSync(new URL("../lib/popularity.js", import.meta.url), "utf8");
  ok(lp.includes('"user-agent": "WayfindBot/1.0'), "wikipedia fetcher lost its User-Agent — prod harvests silently zero out");
  ok((lp.match(/WIKI_UA\)/g) || []).length >= 2, "both wikimedia calls (search + pageviews) must carry the UA");
}

console.log(`test-popularity: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
