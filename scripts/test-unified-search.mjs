// Unified search: phrase pages, catalog hits, and the Claude filter's failures.
// No production database and no live model call. The monthly cap is the real
// paidAnthropicRequest ledger path with a stubbed grant.
import assert from "node:assert/strict";
import { GET as searchRoute } from "../app/api/search/route.js";
import { resolveSearchCity } from "../lib/searchIntent.js";
import { searchLibrary } from "../lib/unifiedSearch.js";
import { measureUnderstandRequest, parseUnderstandFilters, searchUnderstandEnabled } from "../lib/searchUnderstand.js";
import { trigramSimilarity } from "../lib/searchRank.js";

const PARRISH = { lat: 27.5859, lng: -82.4254 };
const SARASOTA = { lat: 27.3364, lng: -82.5307 };
const QUIET = { WAYFIND_SEARCH_UNDERSTAND: "" };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

assert.equal(resolveSearchCity({ query: "things to do", lat: null, lng: null }).city.slug, "parrish", "a missing point is not the coordinate 0,0");
assert.equal(searchUnderstandEnabled({}), false, "the Claude layer is off when the flag is absent");
assert.equal(searchUnderstandEnabled({ WAYFIND_SEARCH_UNDERSTAND: "on" }), true);
assert.equal(searchUnderstandEnabled({ WAYFIND_SEARCH_UNDERSTAND: "true" }), false, "only the exact value on enables it");

{
  const things = await searchLibrary({ query: "things to do", ...PARRISH, env: QUIET });
  assert.equal(things.recognized, true);
  assert.equal(things.results[0].kind, "page");
  assert.equal(things.results[0].href, "/things-to-do/parrish");
  assert.equal(things.results[0].title, "Things to do in Parrish");
  assert.equal(things.city.slug, "parrish");
  assert.equal(things.results[0].lead, true);
  assert.equal(things.meta.understand, "skipped_intent");
  assert.equal(things.meta.called, false);

  const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const savedKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const savedFlag = process.env.WAYFIND_SEARCH_UNDERSTAND;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://e2eplaceholder.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "e2e-placeholder-anon-key-not-real";
  process.env.WAYFIND_SEARCH_UNDERSTAND = "";
  try {
    const response = await searchRoute(new Request("https://www.gowayfind.com/api/search?q=things%20to%20do&lat=27.5859&lng=-82.4254"));
    const body = await response.json();
    assert.equal(body.status, "ok");
    assert.equal(body.results[0].href, "/things-to-do/parrish");
    assert.equal(body.results[0].kind, "page");
    assert.equal(body.reason, undefined, "a library hit replaces the place-search miss");
    const beforeGps = await searchRoute(new Request("https://www.gowayfind.com/api/search?q=things%20to%20do"));
    const assumed = await beforeGps.json();
    assert.equal(assumed.results[0].href, "/things-to-do/parrish", "things to do with no point is the home market");
    const unknown = await searchRoute(new Request("https://www.gowayfind.com/api/search?q=pizza"));
    const pizza = await unknown.json();
    assert.equal(pizza.reason, "unsupported_location");
    assert.equal(pizza.results, undefined, "an unknown query with no point does not attach another city's deals");
  } finally {
    if (savedUrl == null) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
    if (savedKey == null) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = savedKey;
    if (savedFlag == null) delete process.env.WAYFIND_SEARCH_UNDERSTAND; else process.env.WAYFIND_SEARCH_UNDERSTAND = savedFlag;
  }
}

{
  const date = await searchLibrary({ query: "date night", ...SARASOTA, env: QUIET });
  assert.equal(date.results[0].href, "/date-night?city=Sarasota");
  assert.equal(date.results[0].kind, "page");
  assert.match(date.results[0].secondary, /Sarasota/);
  assert.equal(date.meta.called, false);
}

{
  const typo = await searchLibrary({ query: "swim with manetees", ...SARASOTA, env: QUIET });
  const guide = typo.results.find((row) => row.href === "/guides/swim-with-manatees-crystal-river");
  assert.ok(guide, `typo query must find the manatee guide, got ${typo.results.map((row) => row.title).join(" | ")}`);
  assert.equal(guide.kind, "guide");
  assert.ok(trigramSimilarity("manetees", "manatees") >= 0.45, "the typo token is inside the trigram band the ranker accepts");
}

{
  const named = await searchLibrary({ query: "swim with manatees", ...SARASOTA, env: QUIET });
  assert.equal(named.results[0].href, "/guides/swim-with-manatees-crystal-river");
  assert.equal(named.results[0].kind, "guide");
}

{
  const coupon = await searchLibrary({ query: "ultimate happy hour", ...SARASOTA, env: QUIET });
  const deal = coupon.results.find((row) => row.kind === "coupon" && /happy hour/i.test(row.title));
  assert.ok(deal, `coupon query must find Ultimate Happy Hour, got ${coupon.results.map((row) => row.title).join(" | ")}`);
  assert.match(deal.href, /^\/coupons#/);
}

{
  const calls = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    calls.push(target);
    if (target.includes("/rpc/wf_search_documents_query")) return json({ error: "missing" }, 404);
    if (target.includes("/wf_events")) {
      return json([{
        event_id: "siesta-key-seafood-festival",
        slug: "siesta-key-seafood-festival",
        event_name: "Siesta Key Seafood Festival",
        city: "Siesta Key",
        start_date: "2026-11-07",
        event_status: "scheduled",
        venue: "Siesta Key",
        tags: ["festival", "seafood"],
        audience: ["families"],
        lat: 27.2665,
        lng: -82.546,
      }]);
    }
    return json([]);
  };
  try {
    const event = await searchLibrary({
      query: "Siesta Key Seafood Festival",
      ...SARASOTA,
      env: { ...QUIET, SUPABASE_URL: "https://search.example.co", SUPABASE_SERVICE_ROLE_KEY: "service-test-key" },
    });
    const hit = event.results.find((row) => row.href === "/florida-events/siesta-key-seafood-festival");
    assert.ok(hit, `event name must surface the festival, got ${event.results.map((row) => row.title).join(" | ")}`);
    assert.equal(hit.kind, "event");
    assert.ok(calls.some((url) => url.includes("/wf_events")), "event fallback reads wf_events when the index RPC is absent");
  } finally {
    globalThis.fetch = previous;
  }
}

const saved = {
  WAYFIND_SEARCH_UNDERSTAND: process.env.WAYFIND_SEARCH_UNDERSTAND,
  WAYFIND_GATE: process.env.WAYFIND_GATE,
  ANTHROPIC_MONTHLY_REQUEST_CAP: process.env.ANTHROPIC_MONTHLY_REQUEST_CAP,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
function restoreEnv() {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
process.env.WAYFIND_SEARCH_UNDERSTAND = "on";
process.env.WAYFIND_GATE = "open";
process.env.ANTHROPIC_MONTHLY_REQUEST_CAP = "10";
process.env.ANTHROPIC_API_KEY = "sk-ant-test-not-a-real-key";
process.env.SUPABASE_URL = "https://search.example.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test-key";

const previousFetch = globalThis.fetch;
try {
  const failureCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    failureCalls.push(target);
    if (target.includes("/rest/v1/rpc/wf_spend_take")) return json(true);
    if (target.includes("/rpc/wf_search_documents_query")) return json({ error: "missing" }, 404);
    if (target.includes("api.anthropic.com")) {
      return json({ content: [{ type: "text", text: "Visit Joe's Crab Shack tonight." }] });
    }
    return json([]);
  };
  const failed = await searchLibrary({ query: "scalloping", ...SARASOTA, env: process.env });
  assert.equal(failed.meta.understand, "invalid");
  assert.equal(failed.meta.called, true);
  assert.ok(failureCalls.some((url) => url.includes("api.anthropic.com")), "a non-phrase query with the flag on calls Claude");
  assert.ok(failed.results.some((row) => row.href === "/guides/florida-scalloping-crystal-river-homosassa"), "an invalid model payload falls back to the catalog");
  assert.ok(failed.results.every((row) => !/Joe's Crab Shack/.test(row.title)), "model prose is never a result");

  const capCalls = [];
  globalThis.fetch = async (url) => {
    const target = String(url);
    capCalls.push(target);
    if (target.includes("/rest/v1/rpc/wf_spend_take")) return json(false);
    if (target.includes("api.anthropic.com")) throw new Error("cap must stop before the model");
    if (target.includes("/rpc/wf_search_documents_query")) return json({ error: "missing" }, 404);
    return json([]);
  };
  const capped = await searchLibrary({ query: "scalloping", ...SARASOTA, env: process.env });
  assert.equal(capped.meta.understand, "cap");
  assert.equal(capped.meta.called, false);
  assert.ok(capCalls.some((url) => url.includes("wf_spend_take")), "the cap check uses the monthly ledger");
  assert.ok(!capCalls.some((url) => url.includes("api.anthropic.com")), "a denied grant never reaches Claude");
  assert.ok(capped.results.some((row) => row.href === "/guides/florida-scalloping-crystal-river-homosassa"), "a hit cap still returns catalog results");

  const slowCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    slowCalls.push(target);
    if (target.includes("/rest/v1/rpc/wf_spend_take")) return json(true);
    if (target.includes("api.anthropic.com")) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 5000);
        init.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      });
      return json({ content: [] });
    }
    return json([]);
  };
  const started = Date.now();
  const timed = await searchLibrary({ query: "scalloping", ...SARASOTA, env: process.env });
  const elapsed = Date.now() - started;
  assert.equal(timed.meta.understand, "timeout");
  assert.ok(elapsed < 4000, `timeout must land near 1.5s, took ${elapsed}ms`);
  assert.ok(timed.results.some((row) => row.href === "/guides/florida-scalloping-crystal-river-homosassa"), "a timed-out model falls back to the catalog");
  assert.ok(slowCalls.some((url) => url.includes("api.anthropic.com")));
} finally {
  globalThis.fetch = previousFetch;
  restoreEnv();
}

assert.equal(parseUnderstandFilters('{"city":"sarasota","category":"food","price":"$","when":"tonight","kid_friendly":false,"keywords":["seafood"]}').city, "sarasota");
assert.equal(parseUnderstandFilters('{"city":"sarasota","venue":"Joe\'s Crab Shack"}'), null, "a place name, or any extra key, rejects the payload");
assert.equal(parseUnderstandFilters('{"keywords":["Joe\'s Crab Shack"]}'), null, "a keyword outside the allowlist rejects the payload");
assert.equal(parseUnderstandFilters("I recommend the beach."), null);

const measured = measureUnderstandRequest("scalloping", "sarasota");
const INPUT_USD_PER_TOKEN = 1 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 5 / 1_000_000;
const perMiss = measured.inputTokens * INPUT_USD_PER_TOKEN + measured.maxOutputTokens * OUTPUT_USD_PER_TOKEN;
console.log(`understand request: input_chars=${measured.inputChars} input_tokens~${measured.inputTokens} max_output_tokens=${measured.maxOutputTokens} worst_case_usd_per_1000_misses=${(perMiss * 1000).toFixed(4)}`);
assert.ok(measured.inputTokens > 50 && measured.inputTokens < 1500, "the filter prompt stays small enough to price");
assert.equal(measured.maxOutputTokens, 120);

console.log("test-unified-search: OK — Parrish things to do, Sarasota date night, typo, guide, coupon, event, invalid model, monthly cap, timeout");
