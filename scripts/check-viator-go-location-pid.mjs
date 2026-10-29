#!/usr/bin/env node
/**
 * check-viator-go-location-pid — every viator.com Location a redirect route
 * returns carries Wayfind's partner pid, and the bare /api/viator/go?q=
 * branch (no product=, no intent=search) stamps an untagged Partner API
 * productUrl through withViatorTracking.
 *
 * 2026-10-21: that branch handed chooseViatorGoLocation the raw productUrl.
 * The route comment claimed the Partner API URL already carried our pid.
 * It does not. intent=search built pid/mcid/medium by hand; exact ?product=
 * already called the shared builder. A click on the bare search resolve
 * left Viator with no pid=P00320881.
 *
 * ASSERT ON THE CALL. This guard imports each app/api/<star>/go route and
 * invokes GET. It does not grep source for withViatorTracking — a sibling
 * guard owns the static affiliate-tag scan. The Partner API, the spend
 * ledger, and Supabase are intercepted; nothing here can reach the network.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const PID = "P00320881";
const UNTAGGED = "https://www.viator.com/tours/Sarasota/Mote-Marine-Laboratory/d25738-908811P9";
const HUMAN_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36";
const MONITOR_UA = "WayfindSyntheticMonitor/1.0 (+https://www.gowayfind.com)";
const CRAWLER_UA = "curl/8.7.1";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const fixture = new URL(UNTAGGED);
ok(!fixture.searchParams.has("pid") && !fixture.searchParams.has("mcid") && !fixture.searchParams.has("medium"),
  "positive control: the fixture productUrl is deliberately untagged");

process.env.WF_SUPPRESS_ANALYTICS = "1";
process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_guardtest_not_a_real_key";
process.env.VIATOR_API_KEY = "guardtest-viator-key-not-real";
process.env.VIATOR_MONTH_CAP = "999999999";
process.env.WAYFIND_GATE = "open";
process.env.SUPABASE_URL = "https://guardtest-fake-project.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://guardtest-fake-project.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "guardtest-anon-key-not-real";
process.env.SUPABASE_SERVICE_ROLE_KEY = "guardtest-fake-service-role-key-not-real";
delete process.env.WAYFIND_PREVIEW_PUBLIC_EVENTS;

const fetches = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const u = String(url);
  fetches.push(u.split("?")[0]);
  const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  if (u.includes("/rest/v1/rpc/wf_spend_take")) return json(true);
  if (u.includes("/rest/v1/verified_offers")) return json([]);
  if (u.includes("/rest/v1/wf_experiences")) {
    return json([{ product_code: "908811P9", product_url: UNTAGGED, link_ok: true }]);
  }
  if (u.includes("api.viator.com/partner/search/freetext")) {
    return json({
      products: {
        results: [{
          productCode: "908811P9",
          title: "Mote Marine Laboratory Tour in Sarasota",
          productUrl: UNTAGGED,
        }],
      },
    });
  }
  if (u.includes("posthog.com/capture")) return json({});
  return json({ error: "guard-fetch-blocked" }, 503);
};

function findGoRoutes(dir) {
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...findGoRoutes(p));
    else if (ent.name === "route.js" && dir.endsWith(`${path.sep}go`)) out.push(p);
  }
  return out.sort();
}

function headersFrom(ua) {
  // 2026-10-28: a real Chrome sends Fetch Metadata on every navigation; a
  // Chrome UA WITHOUT it is the spoofed-crawler shape lib/redirectTrafficClass.js
  // holds at an interstitial. The human fixture models the real browser.
  return { get: (name) => { const n = String(name).toLowerCase(); return n === "user-agent" ? ua : n === "sec-fetch-mode" ? "navigate" : n === "sec-fetch-dest" ? "document" : null; } };
}

function isViatorHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "viator.com" || host.endsWith(".viator.com");
}

// Returns true when `loc` is a viator.com URL (and then the pid/mcid/medium
// assertions have been recorded). Non-viator Locations are not partner hops.
function assertTagged(loc, label, medium) {
  let u;
  try { u = new URL(loc); } catch {
    ok(false, `${label}: Location is not a URL (${loc})`);
    return false;
  }
  if (!isViatorHost(u.hostname)) return false;
  const pids = u.searchParams.getAll("pid");
  ok(pids.length === 1 && pids[0] === PID, `${label}: viator.com Location must carry pid=${PID} exactly once (got ${loc})`);
  ok(u.searchParams.get("mcid") === "42383", `${label}: mcid=42383 (got ${loc})`);
  const med = u.searchParams.get("medium");
  if (medium) ok(med === medium, `${label}: medium=${medium} per the shared builder (got ${med} in ${loc})`);
  else ok(med === "link" || med === "api", `${label}: medium must be link or api (got ${med} in ${loc})`);
  return true;
}

const routes = findGoRoutes(path.join(REPO, "app", "api"));
ok(routes.some((p) => p.endsWith(`${path.sep}viator${path.sep}go${path.sep}route.js`)),
  "walker found /api/viator/go — a miss here would make the pid sweep vacuous");
ok(routes.some((p) => p.endsWith(`${path.sep}commerce${path.sep}go${path.sep}route.js`)),
  "walker found /api/commerce/go");
ok(routes.length >= 4, `expected the partner redirect routes (viator, commerce, hotels, ticketmaster); found ${routes.length}: ${routes.join(", ")}`);

const BARE_Q = "q=" + encodeURIComponent("Mote Marine") + "&city=Sarasota&region=Sarasota";
const CASES = [
  ["bare-q", BARE_Q],
  ["intent-search", "q=" + encodeURIComponent("kayak sarasota") + "&city=Sarasota&intent=search"],
  ["exact-product", "product=" + encodeURIComponent(UNTAGGED)],
  ["hostile-url", "url=" + encodeURIComponent(UNTAGGED)],
  ["commerce-viator", "provider=viator&offer=908811P9&surface=guide_pick"],
];

let viatorLocations = 0;
let bareQLocation = "";

try {
  for (const routePath of routes) {
    const rel = path.relative(REPO, routePath);
    let mod;
    try {
      mod = await import(pathToFileURL(routePath).href);
    } catch (e) {
      ok(false, `${rel}: import failed (${e && e.message})`);
      continue;
    }
    ok(typeof mod.GET === "function", `${rel} exports GET`);
    if (typeof mod.GET !== "function") continue;
    for (const [name, qs] of CASES) {
      let res;
      try {
        res = await mod.GET({ url: "http://localhost:3000/api/go?" + qs, headers: headersFrom(HUMAN_UA) });
      } catch (e) {
        ok(false, `${rel} ${name}: GET threw (${e && e.message})`);
        continue;
      }
      const status = res && res.status;
      const loc = (res && res.headers && res.headers.get("location")) || "";
      if (status >= 300 && status < 400 && loc) {
        if (assertTagged(loc, `${rel} ${name}`, null)) viatorLocations++;
      }
      if (rel.endsWith(`viator${path.sep}go${path.sep}route.js`) && name === "bare-q") bareQLocation = loc;
    }
  }

  ok(viatorLocations >= 1, "PROBE BROKEN: no redirect route returned a viator.com Location, so the pid sweep never ran");

  {
    let u = null;
    try { u = new URL(bareQLocation); } catch { /* recorded below */ }
    ok(!!u && isViatorHost(u.hostname),
      `bare ?q= (no product=, no intent=search) must 302 to the resolved viator product (got ${bareQLocation}; fetches ${fetches.join(" | ")})`);
    ok(!!u && u.pathname.includes("908811P9"),
      `bare ?q= must keep the resolved product path (got ${bareQLocation})`);
    ok(!!u && !/searchResults/i.test(u.pathname),
      `bare ?q= success is a product page, not searchResults (got ${bareQLocation})`);
    if (u && isViatorHost(u.hostname)) {
      ok(u.searchParams.get("medium") === "link",
        `untagged productUrl must come out medium=link (got ${u.searchParams.get("medium")} in ${bareQLocation})`);
    }
    console.log("BARE_Q_LOCATION " + bareQLocation);
  }

  // Fail-closed branches must stay on our origin. Stamping those with the
  // partner builder would put pid on the homepage.
  const { GET } = await import(pathToFileURL(path.join(REPO, "app/api/viator/go/route.js")).href);
  const closed = async (ua, qs) => {
    const res = await GET({ url: "http://localhost:3000/api/viator/go?" + qs, headers: headersFrom(ua) });
    return (res.headers.get("location") || "");
  };
  const monitorLoc = await closed(MONITOR_UA, "q=" + encodeURIComponent("tampa boat cruise"));
  ok(!/viator\.com/i.test(monitorLoc), `synthetic monitor bare ?q= stays off viator.com (got ${monitorLoc})`);
  const crawlerLoc = await closed(CRAWLER_UA, BARE_Q);
  ok(!/viator\.com/i.test(crawlerLoc), `crawler bare ?q= stays off viator.com (got ${crawlerLoc})`);
  const missingLoc = await closed(HUMAN_UA, "city=Sarasota");
  ok(!/viator\.com/i.test(missingLoc), `missing q stays off viator.com (got ${missingLoc})`);
} finally {
  globalThis.fetch = realFetch;
}

if (fail.length) {
  console.error("check-viator-go-location-pid: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`check-viator-go-location-pid: OK — ${pass} assertions (bare ?q= untagged productUrl comes out tagged; every invoked redirect route's viator.com Location carries pid=${PID})`);
