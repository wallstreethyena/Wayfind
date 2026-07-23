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
ok(destIsAlive(403) === true, "dest 403 (Cloudflare 'Just a moment') is ALIVE — page exists, don't pull it");
ok(destIsAlive(301) === true && destIsAlive(302) === true, "dest 3xx is alive");
ok(destIsAlive(404) === false && destIsAlive(410) === false && destIsAlive(500) === false, "404/410/5xx are dead");

// #4 affiliate must forward (3xx to a CJ host), not pixel (200 from anrdoezrs)
ok(affiliateForwards(302, "https://cj.dotomi.com/links-t/...") === true, "302 → cj.dotomi.com forwards");
ok(affiliateForwards(200, "") === false, "200 with no redirect = pixel = does NOT forward");
ok(affiliateForwards(302, "https://evil.example/x") === false, "3xx to a non-CJ host does not count");

// #5 full verdict
ok(judgeLink({ affFirstHop: 302, affLocation: "https://cj.dotomi.com/x", destStatus: 403 }).pass === true, "forwards + Cloudflare dest → PASS");
ok(judgeLink({ affFirstHop: 200, affLocation: "", destStatus: 200 }).pass === false, "pixel affiliate → FAIL even if dest is 200");
ok(judgeLink({ affFirstHop: 302, affLocation: "https://cj.dotomi.com/x", destStatus: 404 }).pass === false, "dead dest → FAIL even if affiliate forwards");

// cron contract
const cron = read("app/api/cron/deals-health/route.js");
ok(/CRON_SECRET/.test(cron) && /status:\s*401/.test(cron), "cron is fail-CLOSED on CRON_SECRET");
ok(/wf_deals_needs_check/.test(cron), "cron targets the wf_deals_needs_check view");
ok(/repairAffiliateUrl/.test(cron) && /hasCjPid/.test(cron), "cron repairs the link form and refuses untracked links");
ok(/active:\s*false/.test(cron) && /ends_at/.test(cron), "cron runs the expiry sweep");
ok(/FAIL_THRESHOLD\s*=\s*2/.test(cron), "requires 2 consecutive fails before pulling a deal");
ok(read("vercel.json").includes("/api/cron/deals-health"), "cron registered in vercel.json");

console.log(`test-deals: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
