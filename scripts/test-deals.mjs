// scripts/test-deals.mjs — locks the wf_deals link-health logic (lib/deals.js)
// and the deals-health cron contract: #1 the working raw-path CJ form (never the
// ?url= pixel), #2 auto-repair of the dead pixel form, #3 Cloudflare 403 = alive,
// #4 the affiliate link must truly FORWARD, #5 every stored link carries our PID.
import { readFileSync } from "fs";
import {
  CJ_PID, hasCjPid, rawPathDeepLink, isDeadPixelForm, sidOf,
  repairAffiliateUrl, destIsAlive, affiliateForwards, judgeLink,
} from "../lib/deals.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

const DEST = "https://www.undercovertourist.com/orlando/walt-disney-world-resort/hotels/";
const PIXEL = `https://www.anrdoezrs.net/links/${CJ_PID}/type/dlg/sid/hotel_wdw/?url=${encodeURIComponent(DEST)}`;
const RAW = `https://www.anrdoezrs.net/links/${CJ_PID}/type/dlg/sid/hotel_wdw/${DEST}`;

// #1 raw-path builder
ok(rawPathDeepLink(DEST, "hotel_wdw") === RAW, "rawPathDeepLink builds the working raw-path form (dest as path segment)");
ok(!/\?url=/.test(rawPathDeepLink(DEST, "x")), "never the ?url= pixel form");
ok(rawPathDeepLink("https://www.viator.com/x", "x") === null, "refuses a non-Undercover host");
ok(rawPathDeepLink("http://undercovertourist.com/x", "x") === null, "refuses non-https");
ok(hasCjPid(RAW) && !hasCjPid("https://undercovertourist.com/x"), "hasCjPid requires PID 101643573");

// #2 pixel detection + repair
ok(isDeadPixelForm(PIXEL) === true, "detects the dead ?url= pixel form");
ok(isDeadPixelForm(RAW) === false, "raw-path form is not flagged as pixel");
ok(sidOf(PIXEL) === "hotel_wdw" && sidOf(RAW) === "hotel_wdw", "extracts the SID from either form");
const rep = repairAffiliateUrl(PIXEL, DEST);
ok(rep.repaired === true && rep.url === RAW, "repairs pixel → raw-path, preserving SID + dest");
const norep = repairAffiliateUrl(RAW, DEST);
ok(norep.repaired === false && norep.url === RAW, "a working link passes through untouched");
ok(hasCjPid(rep.url), "the repaired link still carries the PID");

// #3 Cloudflare-aware dest liveness (the bug the spec's 'must be 200' would hit)
ok(destIsAlive(200) === true, "dest 200 is alive");
ok(destIsAlive(403) === null && destIsAlive(429) === null, "blocked is unknown");
ok(destIsAlive(301) === null && destIsAlive(302) === null, "unresolved redirect is unknown");
ok(destIsAlive(404) === false && destIsAlive(410) === false && destIsAlive(500) === null, "not-found is dead; server error is unknown");

// #4 affiliate must forward (3xx to a CJ host), not pixel (200 from anrdoezrs)
ok(affiliateForwards(302, "https://cj.dotomi.com/links-t/...") === true, "302 → cj.dotomi.com forwards");
ok(affiliateForwards(200, "") === false, "200 with no redirect = pixel = does NOT forward");
ok(affiliateForwards(302, "https://evil.example/x") === false, "3xx to a non-CJ host does not count");

// #5 full verdict
ok(judgeLink({ affFirstHop: 302, affLocation: "https://cj.dotomi.com/x", destStatus: 403 }).pass === false, "blocked destination cannot pass");
ok(judgeLink({ affFirstHop: 200, affLocation: "", destStatus: 200 }).pass === false, "pixel affiliate → FAIL even if dest is 200");
ok(judgeLink({ affFirstHop: 302, affLocation: "https://cj.dotomi.com/x", destStatus: 404 }).pass === false, "dead dest → FAIL even if affiliate forwards");

// cron contract
const cron = read("app/api/cron/deals-health/route.js");
ok(/CRON_SECRET/.test(cron) && /status:\s*401/.test(cron), "cron is fail-CLOSED on CRON_SECRET");
ok(/from\("wf_deals"\)/.test(cron) && /STALE_MS/.test(cron) && !/\.eq\("link_ok", true\)/.test(cron), "cron includes quarantined rows and bounds retries by staleness");
ok(/repairAffiliateUrl/.test(cron) && /hasCjPid/.test(cron), "cron repairs the link form and refuses untracked links");
ok(/active:\s*false/.test(cron) && /ends_at/.test(cron), "cron runs the expiry sweep");
ok(/FAIL_THRESHOLD\s*=\s*2/.test(cron), "requires 2 consecutive fails before pulling a deal");
ok(read("vercel.json").includes("/api/cron/deals-health"), "cron registered in vercel.json");

const { probeMerchant, healthPatch, trackedDeal } = await import('../lib/dealHealth.js');
ok(healthPatch({link_ok:true,fail_count:0},403).link_ok === null, '403 clears false healthy');
ok(healthPatch({link_ok:false,fail_count:2},429).link_ok === false, 'challenge cannot lift quarantine');
ok(healthPatch({link_ok:true,fail_count:1},404).link_ok === false, 'second definite failure quarantines');
ok(healthPatch({link_ok:false,fail_count:2},200).link_ok === true, 'positive control recovers');
ok(trackedDeal(RAW, DEST) && !trackedDeal(RAW + 'evil', DEST), 'exact configured tracking and destination');
let calls = 0;
const fetchStub = async () => { calls++; return new Response(null,{status:302,headers:{location:'https://www.anrdoezrs.net/click-test'}}); };
ok((await probeMerchant(DEST, fetchStub)).status === 0 && calls === 1, 'affiliate redirect is never followed');
calls = 0;
ok((await probeMerchant(RAW, fetchStub)).status === 0 && calls === 0, 'affiliate input causes zero requests');
ok((await probeMerchant(DEST, async()=>new Response(null,{status:403}))).status === 403, 'blocked evidence preserved');
ok(!/probe\(affUrl|fetch\(affUrl/.test(cron) && /probeMerchant\(row.dest_url\)/.test(cron), 'cron probes merchant only');
console.log(`test-deals: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
