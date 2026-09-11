#!/usr/bin/env node
// scripts/test-bookable-near-me-empty-rail.mjs
//
// Phase 2 — Bookable Near Me rail: empty live Viator is not "experience lane
// done". Cached /api/experiences still fills; non-empty live merges/dedupes;
// Food stays noExperiences; 60-mile UT honesty is unchanged; Bradenton /
// Sarasota / Tampa / Orlando dest filters stay geographically honest.
//
// No paid Viator calls. Tours-route reason classes are exercised with a
// mocked upstream and a child process that cannot inherit real keys/caps.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  experienceLaneWouldRender,
  liveExperienceSeed,
  mergeBrowseExperienceLanes,
  parentOwnsLiveLane,
  resolveBrowseExperienceRows,
  shouldLiveSearchFallback,
} from "../lib/browseExperienceLanes.js";
import { chipCommerce } from "../lib/browseCommerceMap.js";
import { destsWithin } from "../lib/experiencesData.js";
import { filterByChip } from "../lib/experiencesServe.js";
import { dropDeadLinkRows } from "../lib/experienceLinkHealth.js";
import { geoFilterDeals } from "../lib/dealsData.js";
import {
  isViatorProviderState,
  viatorProviderLog,
  viatorSearchOutcomeState,
  VIATOR_PROVIDER_STATES,
} from "../lib/viatorProviderState.js";

const CHILD = "--tours-provider-state";
const SELF = fileURLToPath(import.meta.url);

let pass = 0;
const fail = (m) => { console.error("test-bookable-near-me-empty-rail: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

if (process.argv[2] === CHILD) {
  await runToursProviderState();
  process.exit(0);
}

const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const fnStart = home.indexOf("function UnifiedBrowseCommerceRail(");
ok(fnStart >= 0, "UnifiedBrowseCommerceRail is still defined in app/home.js");
const nextFn = home.indexOf("\nfunction ", fnStart + 30);
const fnBody = home.slice(fnStart, nextFn > 0 ? nextFn : home.length);

const exp = (code, title, extra = {}) => ({
  code,
  title,
  image: extra.image === undefined ? "https://media.test/" + code + ".jpg" : extra.image,
  product_code: extra.product_code,
});

// ── 1. empty live is not done ────────────────────────────────────────────
ok(liveExperienceSeed([]).length === 0, "[] is not a live seed");
ok(liveExperienceSeed(null).length === 0, "null is not a live seed");
ok(parentOwnsLiveLane([]) === true, "passing [] means the parent already tried live Viator");
ok(parentOwnsLiveLane(undefined) === false, "omitting the prop means this rail owns the live fallback");
ok(parentOwnsLiveLane(null) === true, "Family mounts with browseTours=null while the parent fetch is in flight — still parent-owned");

const cachedFamily = [
  exp("AQ1", "The Florida Aquarium in Tampa General Admission"),
  exp("FAM2", "Family Friendly Zoo Adventure"),
  exp("NOIMG", "Family Friendly Petting Zoo", { image: null }),
];
const fromEmptyLive = resolveBrowseExperienceRows({
  initialExperiences: [],
  cachedRows: cachedFamily,
});
ok(fromEmptyLive.map((r) => r.code).join(",") === "AQ1,FAM2,NOIMG",
  "browseTours=[] + cached experiences keeps the cached rows (the Bradenton Family defect)");
ok(fromEmptyLive.filter(experienceLaneWouldRender).map((r) => r.code).join(",") === "AQ1,FAM2",
  "cached experiences with artwork would render; imageless rows stay dropped");
ok(shouldLiveSearchFallback({ initialExperiences: [], cachedCount: 0 }) === false,
  "parent-owned empty live must not fire a second paid /api/viator/tours search");

// ── 2. non-empty live merges / dedupes with cache ────────────────────────
const live = [exp("AQ1", "The Florida Aquarium in Tampa General Admission"), exp("LIVE1", "Clearwater Marine Aquarium Admission")];
const merged = resolveBrowseExperienceRows({ initialExperiences: live, cachedRows: cachedFamily });
ok(merged.map((r) => r.code).join(",") === "AQ1,LIVE1,FAM2,NOIMG",
  "non-empty Viator + cached experiences merge; duplicate AQ1 is kept once");
ok(merged.filter((r) => r.code === "AQ1").length === 1, "duplicate product code is collapsed");
ok(mergeBrowseExperienceLanes(
  [exp("X1", "Same Title Twice")],
  [exp("X2", "Same Title Twice")],
).map((r) => r.code).join(",") === "X1",
  "duplicate titles collapse, live wins");

const withDealsTitles = new Set([
  ...merged.filter(experienceLaneWouldRender).map((r) => String(r.title).toLowerCase()),
  "busch gardens tampa bay tickets",
]);
ok(withDealsTitles.size === 4, "experiences + a UT deal keep distinct titles (no invented duplicate)");

// ── 3. both empty → honest UT-only / empty experience lane ───────────────
ok(resolveBrowseExperienceRows({ initialExperiences: [], cachedRows: [] }).length === 0,
  "both lanes empty → no invented experience cards");
ok(shouldLiveSearchFallback({ initialExperiences: [], cachedCount: 0 }) === false,
  "both empty under a parent-owned live lane still does not paid-search again");

// ── 4. Food remains noExperiences ────────────────────────────────────────
for (const sub of ["all", "dinner", "breakfast", "lunch"]) {
  const plan = chipCommerce("food", sub);
  ok(plan.noExperiences === true, `Food:${sub} still declares noExperiences`);
  ok(resolveBrowseExperienceRows({
    noExperiences: plan.noExperiences,
    initialExperiences: live,
    cachedRows: cachedFamily,
  }).length === 0, `Food:${sub} cannot render cached or live tours`);
  ok(shouldLiveSearchFallback({ noExperiences: true, cachedCount: 0 }) === false,
    `Food:${sub} never live-searches Viator`);
}
ok(chipCommerce("family", "all").noExperiences === false, "negative control: Family still sells experiences");

// ── 5. 60-mile UT honesty + city dest honesty ────────────────────────────
const CITIES = {
  bradenton: { lat: 27.4989, lng: -82.5748 },
  sarasota: { lat: 27.3364, lng: -82.5307 },
  tampa: { lat: 27.9506, lng: -82.4572 },
  orlando: { lat: 28.5384, lng: -81.3789 },
};
const ORLANDO_DEST = "663";
const GULF_DESTS = new Set(["25738", "5403", "22457", "666"]);
for (const [city, loc] of Object.entries(CITIES)) {
  const dests = destsWithin(loc, 60);
  if (city === "orlando") {
    ok(dests.includes(ORLANDO_DEST) && dests.every((id) => id === ORLANDO_DEST || !GULF_DESTS.has(id)),
      `Orlando @60mi keeps Orlando and does not import the Gulf set`);
  } else {
    ok(!dests.includes(ORLANDO_DEST), `${city} @60mi must not pull Orlando dest 663`);
    ok(dests.some((id) => GULF_DESTS.has(id)), `${city} @60mi still reaches a Gulf market`);
  }
}

const CACHED_ROWS = [
  { product_code: "AQ1", title: "The Florida Aquarium in Tampa General Admission", categories: ["museums"], dest_id: "666", image: "https://img.test/aq.jpg", link_ok: true },
  { product_code: "LG1", title: "LEGOLAND Florida Theme Park Ticket", categories: ["theme"], dest_id: "663", image: "https://img.test/lg.jpg", link_ok: true },
  { product_code: "KY1", title: "Sarasota Guided Mangrove Tunnel Kayak Tour", categories: ["kayaking"], dest_id: "25738", image: "https://img.test/ky.jpg", link_ok: true },
  { product_code: "DEAD1", title: "Family Friendly Zoo Day", categories: ["theme"], dest_id: "666", image: "https://img.test/z.jpg", link_ok: false },
  { product_code: "NOIMG", title: "Family Friendly Petting Zoo", categories: ["theme"], dest_id: "666", image: null, link_ok: true },
];
const familyCat = chipCommerce("family", "all").catalogParam;
ok(familyCat === "theme,concept:family", `Family/All asks theme + concept:family (got ${familyCat})`);

function familyEligibleAt(cityKey) {
  const dests = new Set(destsWithin(CITIES[cityKey], 60));
  const inMarket = CACHED_ROWS.filter((r) => dests.has(r.dest_id));
  const live = dropDeadLinkRows(filterByChip(inMarket, familyCat));
  return live.filter((r) => experienceLaneWouldRender({ code: r.product_code, image: r.image, title: r.title }));
}

const bradentonCards = familyEligibleAt("bradenton");
ok(bradentonCards.some((r) => r.product_code === "AQ1"), "Bradenton Family can surface a Tampa aquarium (family intent + 60mi + image + link_ok)");
ok(!bradentonCards.some((r) => r.product_code === "LG1"), "Bradenton Family must not invent Orlando LEGOLAND at 60mi");
ok(!bradentonCards.some((r) => r.product_code === "KY1"), "a Gulf kayak tour is not Family/theme inventory");
ok(!bradentonCards.some((r) => r.product_code === "DEAD1"), "link_ok=false never renders");
ok(!bradentonCards.some((r) => r.product_code === "NOIMG"), "imageless family rows fail closed");
ok(familyEligibleAt("sarasota").some((r) => r.product_code === "AQ1") && !familyEligibleAt("sarasota").some((r) => r.product_code === "LG1"),
  "Sarasota @60mi matches Bradenton's Gulf honesty");
ok(familyEligibleAt("tampa").some((r) => r.product_code === "AQ1") && !familyEligibleAt("tampa").some((r) => r.product_code === "LG1"),
  "Tampa @60mi keeps Gulf family inventory and refuses Orlando");
ok(familyEligibleAt("orlando").some((r) => r.product_code === "LG1") && !familyEligibleAt("orlando").some((r) => r.product_code === "AQ1"),
  "Orlando @60mi keeps its own theme inventory and does not import Tampa");

const deals = [
  { id: "ut-bg", maps_to: "busch gardens tampa bay", scope: "local", title: "Busch Gardens Tampa Bay tickets" },
  { id: "ut-wdw", maps_to: "walt disney world", scope: "local", title: "Walt Disney World tickets" },
];
ok(geoFilterDeals(deals, CITIES.bradenton.lat, CITIES.bradenton.lng).map((d) => d.id).join(",") === "ut-bg",
  "Bradenton UT honesty: Busch Gardens in, WDW out (60mi)");
ok(geoFilterDeals(deals, CITIES.sarasota.lat, CITIES.sarasota.lng).map((d) => d.id).join(",") === "ut-bg",
  "Sarasota UT honesty unchanged");
ok(geoFilterDeals(deals, CITIES.tampa.lat, CITIES.tampa.lng).map((d) => d.id).join(",") === "ut-bg",
  "Tampa UT honesty unchanged");
ok(geoFilterDeals(deals, CITIES.orlando.lat, CITIES.orlando.lng).map((d) => d.id).join(",") === "ut-wdw",
  "Orlando UT honesty: WDW in, Busch Gardens out at 60mi");

ok(/DEAL_RADIUS_MI = 60/.test(readFileSync(new URL("../lib/dealsData.js", import.meta.url), "utf8")),
  "DEAL_RADIUS_MI stays 60 — this fix must not loosen UT geo");
ok(/mi:\s*"60"/.test(fnBody), "the experiences table read stays on the 60-mile rung");

// ── 6. rail wiring: empty array no longer short-circuits the table ───────
ok(!/if \(Array\.isArray\(initialExperiences\)\) \{ setExperiences\(initialExperiences\); return; \}/.test(fnBody),
  "the empty-array short-circuit is gone from UnifiedBrowseCommerceRail");
ok(/mergeBrowseExperienceLanes\(liveSeed, cached\)/.test(fnBody),
  "the rail actually calls the merge helper on live + cached rows");
ok(/if \(!rows\.length && !parentOwnsLive\) rows = await liveSearch\(\);/.test(fnBody),
  "liveSearch is gated on parentOwnsLive so Family browseTours=[] cannot double-spend");
ok(/\/api\/experiences\?/.test(fnBody), "the table read remains");
ok(fnBody.indexOf("|| plan.noExperiences ||") < fnBody.indexOf("/api/experiences?"),
  "Food noExperiences still gates before the table read");
ok(fnBody.indexOf("|| plan.noExperiences ||") < fnBody.indexOf("/api/viator/tours?"),
  "Food noExperiences still gates before liveSearch");
ok(/browseCat === "family"[^\n]*initialExperiences=\{browseTours\}/.test(home),
  "Family still passes browseTours into the rail (the empty-array case this guards)");

// ── 7. provider-state classifier (no secrets) ────────────────────────────
ok(VIATOR_PROVIDER_STATES.join(",") === "no_key,no_cap,gate_shut,ledger_denied,upstream_error,zero_candidates,integrity_rejected,success",
  "the reason-class list is exactly the approved set");
ok(viatorSearchOutcomeState({ candidateCount: 0, verifiedCount: 0 }) === "zero_candidates", "no raw results → zero_candidates");
ok(viatorSearchOutcomeState({ candidateCount: 4, verifiedCount: 0 }) === "integrity_rejected", "candidates that all fail geo/integrity → integrity_rejected");
ok(viatorSearchOutcomeState({ candidateCount: 4, verifiedCount: 2 }) === "success", "verified hits → success");
const log = viatorProviderLog("no_key", 0);
ok(log.tag === "viator_provider_state" && log.provider_state === "no_key" && log.item_count === 0,
  "structured log carries only tag + reason + count");
ok(!("cap" in log) && !("key" in log) && !("VIATOR_MONTH_CAP" in log),
  "structured log never carries cap or credential fields");
for (const s of VIATOR_PROVIDER_STATES) ok(isViatorProviderState(s), `${s} is a known reason class`);

const toursSrc = readFileSync(new URL("../app/api/viator/tours/route.js", import.meta.url), "utf8");
ok(/provider_state/.test(toursSrc) && /toursJson\(/.test(toursSrc),
  "/api/viator/tours returns a provider_state field");
ok(/return toursJson\(\[\], "no_key"\)/.test(toursSrc), "missing key is labeled no_key, not a bare items:[]");
ok(!/VIATOR_MONTH_CAP/.test(toursSrc), "the tours route never names or prints the cap env");
ok(!/console\.log\([^)]*VIATOR_API_KEY/.test(toursSrc), "the tours route never logs the key identifier next to a value");

// ── 8. hermetic GET: every empty class is distinguishable ────────────────
const child = spawnSync(process.execPath, [SELF, CHILD], {
  env: { NODE_ENV: "test" },
  encoding: "utf8",
  timeout: 60000,
});
if (child.status !== 0) {
  fail("tours provider-state child failed:\n" + (child.stdout || "") + (child.stderr || ""));
}
ok(/tours-provider-state: OK/.test(child.stdout || ""), "child reported every reason class against a mocked upstream");

console.log(`test-bookable-near-me-empty-rail: OK — ${pass} assertions (empty live keeps cache, merge/dedupe, Food closed, 60mi UT + dest honesty, provider_state classes, no secrets)`);

async function runToursProviderState() {
  const { GET } = await import("../app/api/viator/tours/route.js");
  const { credential } = await import("../lib/envPlaceholder.js");
  let n = 0;
  const assert = (c, m) => { if (!c) throw new Error(m); n += 1; };
  const FAKE_KEY = "wf-test-viator-key-not-a-real-credential";
  assert(credential(FAKE_KEY) === FAKE_KEY, "fixture key is not a placeholder sentinel");

  const call = (q) => GET(new Request("https://wayfind.test/api/viator/tours?" + q));
  const read = async (res) => ({ status: res.status, json: await res.json() });

  process.env.VIATOR_API_KEY = "";
  process.env.WAYFIND_GATE = "open";
  process.env.VIATOR_MONTH_CAP = "12";
  {
    const { json } = await read(await call("q=Sarasota-nokey"));
    assert(json.items.length === 0 && json.provider_state === "no_key", "no_key");
  }

  process.env.VIATOR_API_KEY = FAKE_KEY;
  delete process.env.VIATOR_MONTH_CAP;
  process.env.WAYFIND_GATE = "open";
  {
    const { json } = await read(await call("q=Sarasota-nocap"));
    assert(json.items.length === 0 && json.provider_state === "no_cap", "no_cap");
    assert(!("cap" in json) && !String(JSON.stringify(json)).includes("12"), "no_cap response has no cap number");
  }

  process.env.VIATOR_MONTH_CAP = "12";
  process.env.WAYFIND_GATE = "shut";
  {
    const { json } = await read(await call("q=Sarasota-shut"));
    assert(json.items.length === 0 && json.provider_state === "gate_shut", "gate_shut");
  }

  process.env.WAYFIND_GATE = "open";
  delete process.env.SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  {
    const { json } = await read(await call("q=Sarasota-ledger"));
    assert(json.items.length === 0 && json.provider_state === "ledger_denied", "ledger_denied when the ledger cannot grant");
  }

  const savedFetch = globalThis.fetch;
  const product = (code, destId, title) => ({
    productCode: code,
    productUrl: `https://www.viator.com/tours/Tampa/${code}/d${destId}-${code}`,
    title,
    destinations: [{ destinationId: destId }],
    images: [{ variants: [{ url: "https://media.viator.com/" + code + ".jpg", width: 400 }] }],
    reviews: { combinedAverageRating: 4.8, totalReviews: 120 },
    pricing: { summary: { fromPrice: 29 } },
  });
  const viatorOk = (results) => new Response(JSON.stringify({ products: { results } }), { status: 200 });
  process.env.WAYFIND_GATE = "open";
  process.env.VIATOR_MONTH_CAP = "12";
  process.env.VIATOR_API_KEY = FAKE_KEY;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("wf_spend_take")) return new Response("true", { status: 200, headers: { "content-type": "application/json" } });
    if (u.includes("api.viator.com")) return globalThis.__viatorBody;
    if (u.includes("verified_offers")) return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    throw new Error("blocked fetch: " + u.slice(0, 100));
  };
  process.env.SUPABASE_URL = "https://ledger.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "wf-test-service-role-not-real";

  globalThis.__viatorBody = new Response("nope", { status: 503 });
  {
    const { json } = await read(await call("q=Sarasota-upstream&mode=city&destId=25738&lat=27.336&lng=-82.531"));
    assert(json.provider_state === "upstream_error" && json.items.length === 0, "upstream_error");
  }

  globalThis.__viatorBody = viatorOk([]);
  {
    const { json } = await read(await call("q=Sarasota-zero&mode=city&destId=25738&lat=27.336&lng=-82.531"));
    assert(json.provider_state === "zero_candidates" && json.items.length === 0, "zero_candidates");
  }

  globalThis.__viatorBody = viatorOk([product("FOREIGN1", "684", "Las Vegas Strip Night Tour")]);
  {
    const { json } = await read(await call("q=Sarasota-integrity&mode=city&destId=25738&lat=27.336&lng=-82.531"));
    assert(json.provider_state === "integrity_rejected" && json.items.length === 0, "integrity_rejected");
  }

  globalThis.__viatorBody = viatorOk([product("AQ1", "25738", "The Florida Aquarium in Tampa General Admission")]);
  {
    const { json } = await read(await call("q=Sarasota-success&mode=city&destId=25738&lat=27.336&lng=-82.531"));
    assert(json.provider_state === "success" && json.items.length === 1, "success");
    assert(json.items[0].code === "AQ1", "success returns the verified product, not an invented one");
    const blob = JSON.stringify(json);
    assert(!blob.includes(FAKE_KEY), "success body never echoes the fixture key");
    assert(!blob.includes("VIATOR_MONTH_CAP"), "success body never names the cap env");
  }

  globalThis.fetch = savedFetch;
  console.log(`tours-provider-state: OK — ${n} assertions`);
}
