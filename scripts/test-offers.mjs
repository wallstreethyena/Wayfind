// scripts/test-offers.mjs — locks the Undercover Tourist (CJ) offers provider:
// #1 every offer link carries our PID 101643573 (never an untracked link),
// #2 the deep-link FORM is the verified raw-path form (not the pixel ?url=),
// #3 attraction matching is correct-by-construction (keyed off seeded maps_to),
// #4 the ingest cron is fail-closed + dormant-safe + uses CJ's link verbatim,
// #5 the provider is isolated from Score/ranking and badged honestly in both rails.
import { readFileSync } from "fs";
import {
  CJ_PID, CJ_UT_ADVERTISER, undercoverDeepLink, isUndercoverLink,
  offerLinkIsAttributed, deriveMapsTo, matchUtOffer, ATTRACTION_PLACEMENT, OFFER_BADGE,
} from "../lib/offers.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

// ── #1/#2 the deep-link builder + form ──
ok(CJ_PID === "101643573" && CJ_UT_ADVERTISER === "684659", "confirmed CJ PID + UT advertiser id");
const dl = undercoverDeepLink("https://www.undercovertourist.com/orlando/seaworld-orlando/", "card");
ok(typeof dl === "string" && dl.includes(CJ_PID), "deep link carries our PID");
ok(dl.startsWith(`https://www.anrdoezrs.net/links/${CJ_PID}/type/dlg/sid/card/`), "deep link is the CJ redirect form (anrdoezrs /links/{pid}/type/dlg)");
ok(dl.endsWith("https://www.undercovertourist.com/orlando/seaworld-orlando/"), "destination rides as a RAW PATH SEGMENT (verified form) — not ?url=<encoded>");
ok(!/\?url=/.test(dl), "never the ?url= pixel form");
ok(undercoverDeepLink("https://www.viator.com/x", "card") === null, "refuses to wrap a non-Undercover host (no competitor page through our UT link)");
ok(undercoverDeepLink("http://www.undercovertourist.com/x", "card") === null, "refuses a non-https destination");
ok(undercoverDeepLink("", "card") === null && undercoverDeepLink(null) === null, "null/empty destination → null (ships nothing, not an untracked link)");
ok(undercoverDeepLink("https://www.undercovertourist.com/x", "a b/c?d").includes("/sid/abcd/"), "sid is sanitized into the path");

// ── isUndercoverLink / attribution ──
ok(isUndercoverLink(dl) === true, "recognizes a stored CJ deep link");
ok(isUndercoverLink("https://www.undercovertourist.com/orlando/x/?AID=11556282&PID=101643573&SID=card&cjevent=z") === true, "recognizes a post-redirect PID=101643573 destination");
ok(isUndercoverLink("https://www.viator.com/tours/x?pid=P00308545") === false, "a Viator link is NOT an Undercover link");
ok(isUndercoverLink("https://www.anrdoezrs.net/links/999/type/dlg/x") === false, "a CJ link for a DIFFERENT publisher is not ours");
ok(offerLinkIsAttributed(dl) === true && offerLinkIsAttributed("https://x.com") === false, "offerLinkIsAttributed requires our PID");

// ── #3 attraction matching ──
ok(deriveMapsTo("Walt Disney World Resort") === "walt disney world", "derive: Disney World");
ok(deriveMapsTo("Universal Studios Florida") === "universal orlando", "derive: Universal");
ok(deriveMapsTo("SeaWorld Orlando") === "seaworld orlando", "derive: SeaWorld");
ok(deriveMapsTo("Busch Gardens Tampa Bay") === "busch gardens tampa", "derive: Busch Gardens");
ok(deriveMapsTo("Sarasota Jungle Gardens") === null, "derive: unrelated place → null");
for (const k of ["walt disney world", "universal orlando", "seaworld orlando", "busch gardens tampa", "legoland florida", "kennedy space center"]) {
  const p = ATTRACTION_PLACEMENT[k];
  ok(p && /^\d+$/.test(p.dest_id) && p.city && Number.isFinite(p.lat) && Number.isFinite(p.lng), `placement complete for ${k}`);
}
const utRows = [{ maps_to: "seaworld orlando", product_url: dl }, { maps_to: "walt disney world", product_url: "https://untracked.example/x" }];
ok(matchUtOffer("SeaWorld Orlando", utRows) === utRows[0], "match: SeaWorld place → its UT offer row");
ok(matchUtOffer("Walt Disney World", utRows) === null, "match: rejects a row whose link is NOT attributed");
ok(matchUtOffer("Mote Marine Aquarium", utRows) === null, "match: unrelated place → no offer");
ok(matchUtOffer("SeaWorld", []) === null, "match: empty inventory → null");

// ── #4 ingest cron ──
const cron = read("app/api/cron/offers/route.js");
ok(/CRON_SECRET/.test(cron) && /status:\s*401/.test(cron), "cron is fail-CLOSED on CRON_SECRET");
ok(/CJ_API_TOKEN/.test(cron) && /dark:\s*true/.test(cron), "cron is DORMANT (no-op) without CJ_API_TOKEN");
ok(/product_url:\s*link/.test(cron) && /VERBATIM/.test(cron), "cron uses CJ's own `link` VERBATIM (never rebuilds the URL)");
ok(/on_conflict=product_code/.test(cron) && /merge-duplicates/.test(cron), "cron upserts on product_code (merge-duplicates)");
ok(/offerLinkIsAttributed/.test(cron), "cron drops any product whose link lacks our PID");
ok(read("vercel.json").includes("/api/cron/offers"), "cron is registered in vercel.json");

// ── #5 isolation + honest badging ──
for (const f of ["lib/score.js", "lib/ranking.js"]) ok(!/undercover|offers/i.test(read(f)), `${f} never references the offers provider (Score/rank isolation)`);
const home = read("app/home.js");
ok(home.includes("isUndercoverLink") && home.includes("OFFER_BADGE"), "home.js exp-rail badges UT honestly");
const ttd = read("app/components/ThingsToDoList.js");
ok(ttd.includes("isUndercoverLink") && ttd.includes("OFFER_BADGE"), "ThingsToDoList badges UT honestly");
ok(OFFER_BADGE.includes("Undercover Tourist"), "the badge names Undercover Tourist (honest source disclosure)");

console.log(`test-offers: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
