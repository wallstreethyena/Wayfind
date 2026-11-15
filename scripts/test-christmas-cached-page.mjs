#!/usr/bin/env node
// scripts/test-christmas-cached-page.mjs
//
// /christmas-in-florida is the landing page for paid ads. Every ad click
// carries a unique ?fbclid=, and while the page read the URL every visit was a
// fresh server render (0.9 to 2.8 s before the first byte). It is now ONE
// cached copy. The first attempt (#2408) ran every live read during next build
// and went past the 60 s per page limit, so it was reverted (#2414).
// This locks, by EXECUTING lib/christmasPageData.js:
//   1. during next build it makes ZERO network calls, answers in under a
//      second and still has listings (the build can never hang on it again),
//   2. a refresh with a failed browse or deals read throws (the last good
//      page keeps serving), and a slow photo pass falls back inside its budget,
//   3. the page reads nothing from the request and stays a cached page,
//   4. shared filter links still filter, now in the browser.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const equal = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
// Code only: comments never satisfy a structural check.
const code = (rel) => readFileSync(path.join(root, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── 1. next build: zero network ─────────────────────────────────────────────
// The network is stubbed to throw BEFORE the modules load, and the build phase
// is set the way next build sets it.
const realFetch = globalThis.fetch;
let fetchCalls = 0;
globalThis.fetch = async (input) => { fetchCalls += 1; throw new Error("network is forbidden in this test: " + String(input && input.url || input)); };
process.env.NEXT_PHASE = "phase-production-build";
const { christmasPageData, CHRISTMAS_PHOTO_BUDGET_MS } = await import("../lib/christmasPageData.js");
const { isSsgBuild } = await import("../lib/landingInventory.js");
const { christmasBrowseFacets, christmasBrowsePills } = await import("../lib/christmasBrowse.js");
const { christmasTicketsSchema } = await import("../lib/christmasTickets.js");
let built;
{
  ok(isSsgBuild() === true, "CONTROL: the test runs in the next build phase");
  const started = Date.now();
  built = await christmasPageData();
  const took = Date.now() - started;
  ok(took < 1000, `the build read answers in under 1 s (${took} ms)`);
  ok(fetchCalls === 0, `the build read makes zero network calls (${fetchCalls})`);
  ok(built.building === true && Array.isArray(built.listings) && built.listings.length > 0, `the build page has listings (${built.listings.length})`);
  ok(Array.isArray(built.first.cards) && built.first.cards.length > 0 && built.first.cards.every((c) => c && c.title), "the first browse page has titled cards for the HTML");
  ok(built.first.cards.some((c) => c.ticketRow), "the build cards carry their server built ticket fields");
  ok(built.tickets && Array.isArray(built.tickets.rows) && christmasTicketsSchema(built.tickets)["@type"] === "ItemList", "the featured tickets model and its schema build without a read");
  ok(/^\d{4}-\d{2}-\d{2}$/.test(built.today), "today comes from the site clock");
  // CONTROL: the probe counts. A runtime read whose reader reaches for the
  // network is counted and throws, so the zero above is a real zero.
  delete process.env.NEXT_PHASE;
  ok(isSsgBuild() === false, "CONTROL: without the build phase this is a runtime read");
  let runtimeError = null;
  try { await christmasPageData({ browse: async () => { await fetch("https://wayfind.invalid/rest/v1/wf_events"); } }); } catch (error) { runtimeError = error; }
  ok(runtimeError instanceof Error && fetchCalls === 1, `CONTROL: a runtime read that touches the network is counted and throws (${fetchCalls})`);
  fetchCalls = 0;
  process.env.NEXT_PHASE = "phase-production-build";
}

// ── 2. A background refresh ─────────────────────────────────────────────────
{
  const listings = built.listings;
  const page = { ...built.first };
  const deps = (over = {}) => ({
    building: false, today: built.today, photoBudgetMs: 60,
    browse: async () => ({ listings, page }),
    readDeals: async () => ({ ok: true, deals: new Map() }),
    ticketPhotos: async (model) => ({ ...model, enriched: true }),
    browsePhotos: async (first) => ({ ...first, enriched: true }),
    ...over,
  });
  const good = await christmasPageData(deps());
  ok(good.building === false && good.tickets.enriched === true && good.first.enriched === true && good.listings === listings, "a healthy refresh returns the photo enriched cards");
  await assert.rejects(christmasPageData(deps({ browse: async () => { throw new Error("wf_events down"); } })), /wf_events down/); checks += 1;
  await assert.rejects(christmasPageData(deps({ browse: async () => ({ listings: null, page: null }) })), /listings unavailable/); checks += 1;
  await assert.rejects(christmasPageData(deps({ readDeals: async () => ({ ok: false, deals: new Map() }) })), /ticket deals unavailable/); checks += 1;
  const never = () => new Promise(() => {});
  const started = Date.now();
  const slow = await christmasPageData(deps({ ticketPhotos: never, browsePhotos: never }));
  const took = Date.now() - started;
  ok(took < 1000 && !slow.tickets.enriched && !slow.first.enriched, `a photo pass that never answers falls back inside its budget (${took} ms)`);
  ok(slow.first.cards.length === page.cards.length && slow.tickets.rows.length === good.tickets.rows.length, "the fallback keeps every card, only without the extra photos");
  const broken = await christmasPageData(deps({ ticketPhotos: async () => { throw new Error("photo store down"); } }));
  ok(!broken.tickets.enriched && broken.first.enriched === true, "one failed photo pass falls back alone; the other still enriches");
  ok(CHRISTMAS_PHOTO_BUDGET_MS === 6000, "each photo pass has a 6 s budget in production");
}
globalThis.fetch = realFetch;
delete process.env.NEXT_PHASE;

// ── 3. The page source ──────────────────────────────────────────────────────
{
  const page = code("app/christmas-in-florida/page.js");
  ok(/export default async function Page\(\)\s*\{/.test(page), "Page takes no props, so it cannot read searchParams");
  ok(!/searchParams/.test(page), "the page never uses searchParams (any read makes every ad click a fresh render)");
  ok(!/\b(?:headers|cookies|connection|unstable_noStore|noStore)\s*\(/.test(page), "the page calls no request time API");
  ok(/export const revalidate = 300;/.test(page), "the cached page refreshes every 5 minutes");
  ok(/export const dynamic = "force-static";/.test(page), "force-static keeps the page cached while its live reads stay live");
  ok(!/export const fetchCache\b/.test(page), "no fetchCache override (force-cache would keep each Supabase answer forever)");
  ok(/await christmasPageData\(\)/.test(page) && !/\b(?:fetchCuratedEvents|christmasBrowseCached|supabase\w*)\b/.test(page), "the page reads only through christmasPageData");
  ok(/<ChristmasBrowse initial=\{first\}/.test(page) && !/initialQuery/.test(page), "the first browse page is server rendered and no URL filter is passed down");
  const data = code("lib/christmasPageData.js");
  const buildBranch = data.slice(data.indexOf("if (building) {"), data.indexOf("const [found, dealRead]"));
  ok(buildBranch.length > 100 && /return \{/.test(buildBranch) && !/await|fetch|browse\(|readDeals\(|Photos\(/.test(buildBranch), "the build branch returns before any read or photo pass");
  ok(/christmasBrowseListings\(\[\], today\)/.test(buildBranch), "the build branch renders the research listings that ship in the repo");
  ok(!/buildRead/.test(code("lib/curatedEvents.js")) && /if \(isSsgBuild\(\)\) return \[\];/.test(code("lib/curatedEvents.js")), "fetchCuratedEvents still skips every build time read (no opt in)");
}

// ── 4. Shared filter links filter in the browser ───────────────────────────
{
  const { christmasUrlQuery, default: ChristmasBrowse } = await loadComponent(path.join(root, "app/components/ChristmasBrowse.js"), root);
  ok(typeof ChristmasBrowse === "function" && typeof christmasUrlQuery === "function", "the browse exports its URL reader");
  const facets = { ...christmasBrowseFacets(), pills: christmasBrowsePills(built.listings) };
  const region = facets.regions[0];
  const category = facets.categories[0].id;
  const when = facets.dates[0].id;
  ok(facets.categories.some((c) => c.id === "lights") || facets.pills.some((p) => p.id === "lights"), "CONTROL: lights is a category the filter offers");
  equal(christmasUrlQuery("?fbclid=IwZXh0bgNhZW0&utm_source=meta&utm_medium=paid_social", facets), {}, "an ad click with only marketing params applies no filter (the cached page is the answer)");
  equal(christmasUrlQuery(`?region=${encodeURIComponent(region)}&category=${category}&when=${when}&fbclid=abc`, facets), { region, category, when }, "a shared link with filters applies exactly those filters");
  equal(christmasUrlQuery("?category=lights", facets), { category: "lights" }, "?category=lights filters to lights");
  equal(christmasUrlQuery("?region=Atlantis&category=bogus&when=someday&price=x&audience=y&sort=price", facets), {}, "values the filter does not offer are dropped");
  equal(christmasUrlQuery("?date=2026-12-12&undated=1&q=" + "x".repeat(80), facets), { date: "2026-12-12", undated: true, q: "x".repeat(60) }, "date, undated and a capped search carry over");
  equal(christmasUrlQuery("?date=12/12&undated=yes", facets), {}, "a malformed date or flag is dropped");
  equal(christmasUrlQuery("?lat=27.336&lng=-82.531", facets), { lat: "27.336", lng: "-82.531" }, "a Florida location carries over");
  equal(christmasUrlQuery("?lat=40.7&lng=-74", facets), {}, "a location outside Florida is dropped, like the server parser");
  equal(christmasUrlQuery("?sort=tickets", facets), { sort: "tickets" }, "sort=tickets carries over");
  equal(christmasUrlQuery(null, {}), {}, "no search and no facets is an empty query, never a crash");
  const src = code("app/components/ChristmasBrowse.js");
  ok(/useEffect\(\(\) => \{\s*const fromUrl = christmasUrlQuery\(window\.location\.search, facets\);\s*if \(Object\.keys\(fromUrl\)\.length\) setQuery\(/.test(src), "the browse applies URL filters once after load");
  ok(/useChristmasLocation\(\(\) => \{[^}]*const linked = \{ \.\.\.initialQuery, \.\.\.christmasUrlQuery\(window\.location\.search, facets\) \};\s*return !!\(linked\.lat \|\| linked\.sort === "tickets"\);/.test(src) && /if \(shouldSkip && shouldSkip\(\)\) return undefined;/.test(code("app/components/useChristmasLocation.js")), "the automatic location step reads the link, so a ?lat or ?sort=tickets link is left alone");
}

console.log(`test-christmas-cached-page: OK, ${checks} checks (build read executed with the network stubbed to throw: zero calls; refresh failure and photo budget executed with injected readers; page source checked with comments stripped)`);
