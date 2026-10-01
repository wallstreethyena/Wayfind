// scripts/test-landing-ssr-rails.mjs
//
// The partner rails on /things-to-do/<city> must be in the SERVER HTML.
//
// TourStrip / IntentPartnerPick / ThemeParkRail are "use client" and used to fill
// only from useEffect fetches, so `curl /things-to-do/sarasota` held none of their
// /api/*/go links. This RENDERS the real components with server seeds
// (renderToStaticMarkup does not run effects, so the markup IS the server HTML)
// and asserts on the RESULT, and CALLS the seed helpers with injected readers.
//
//   1. rendered markup contains /api/commerce/go links, none on a partner host,
//      no pid=, for all three rails
//   2. NO seed -> NO markup (the old client-only behaviour is untouched)
//   3. a beach / natural_feature row never becomes a ThemeParkRail Book link
//   4. seed helpers are fail-soft: throw / dark / hang -> undefined, never throw
//   5. seed helpers never pass cache:"no-store" (would flip the ISR page dynamic)
//   6. lib/landing.js actually passes the seeds at each <TourStrip/<IntentPartnerPick/
//      <ThemeParkRail (JSX position, comments stripped)
//
// Assertions are on rendered output / call results; #6 is source-level and says so.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";
import { loadComponent } from "./lib/jsxLoad.mjs";

let pass = 0;
const fail = (m) => { console.error("test-landing-ssr-rails: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };
const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const rel = (p) => fileURLToPath(new URL(p, import.meta.url));

const React = (await import("react")).default || (await import("react"));
const { renderToStaticMarkup } = await import("react-dom/server");
const PARTNER_HOSTS = /viator\.com|anrdoezrs\.net|dpbolvw\.net|klook\.com|tiqets\.com|gocity\.com|citypass\.com|tp\.media|getyourguide\.com|undercovertourist\.com/i;
const hrefsOf = (html) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
const goLinks = (html) => hrefsOf(html).filter((h) => /^\/api\/(commerce|viator)\/go\?/.test(h));

// ── TourStrip ────────────────────────────────────────────────────────────
const tourMod = await loadComponent(rel("../app/components/TourStrip.js"), REPO);
const Strip = tourMod.default;
const ROWS = [1, 2, 3].map((i) => ({ code: `25738P${i}`, title: `Kayak tour number ${i} of the bay`, image: `https://media.viator.com/${i}.jpg`, rating: 4.8, reviews: 500 + i, fromPrice: 50 + i,
  url: `https://www.viator.com/tours/x/25738P${i}?mcid=42383&pid=P00308545&medium=api` }));
const stripHtml = renderToStaticMarkup(React.createElement(Strip, { lat: 27.33, lng: -82.53, title: "Book an experience in Sarasota", initialItems: ROWS }));
const stripLinks = goLinks(stripHtml);
ok(stripLinks.length === 3, `seeded TourStrip renders one go-link per row in the server markup (got ${stripLinks.length})`);
ok(stripLinks.every((h) => new URLSearchParams(h.split("?")[1]).get("provider") === "viator"), "every strip link names the viator provider");
ok(PARTNER_HOSTS.test("https://www.viator.com/tours/x?pid=P1") && !PARTNER_HOSTS.test("/api/commerce/go?provider=viator&offer=1"), "positive/negative control: the partner-host matcher flags a raw Viator url and not our own redirect");
ok(hrefsOf(stripHtml).length >= 3, "positive control: the href extractor finds the strip links (else every absence check below is vacuous)");
ok(!hrefsOf(stripHtml).some((h) => PARTNER_HOSTS.test(h)), "no partner host in any strip href");
ok(!/pid=/.test(hrefsOf(stripHtml).join(" ")), "no partner pid in any strip href");
const stripNone = renderToStaticMarkup(React.createElement(Strip, { lat: 27.33, lng: -82.53, title: "t" }));
ok(goLinks(stripNone).length === 0, "positive control: with NO seed the strip's server markup has no links (client-only path unchanged)");
ok(goLinks(renderToStaticMarkup(React.createElement(Strip, { lat: 27.33, lng: -82.53, title: "t", initialItems: [ROWS[0]] }))).length === 0, "a single-item seed still renders nothing (same >=2 rule as the client)");

// ── IntentPartnerPick ────────────────────────────────────────────────────
const pickMod = await loadComponent(rel("../app/components/IntentPartnerPick.js"), REPO);
const Pick = pickMod.default;
const INV = [1, 2, 3].map((i) => ({ code: `25738P${i}`, title: `Guided bay adventure ${i}`, image: `https://media.viator.com/${i}.jpg`, rating: 4.7, reviews: 300 + i, fromPrice: 40 + i, duration: "2h" }));
const pickHtml = renderToStaticMarkup(React.createElement(Pick, { city: "Sarasota", intent: "best-of", inventory: [], initialInventory: INV, lat: 27.33, lng: -82.53 }));
const pickLinks = goLinks(pickHtml);
ok(pickLinks.length >= 3, `seeded IntentPartnerPick renders go-links in server markup (got ${pickLinks.length})`);
ok(!hrefsOf(pickHtml).some((h) => PARTNER_HOSTS.test(h)), "no partner host in any partner-pick href");
ok(goLinks(renderToStaticMarkup(React.createElement(Pick, { city: "Sarasota", intent: "best-of", inventory: [], lat: 27.33, lng: -82.53 }))).length === 0, "positive control: unseeded IntentPartnerPick server markup has no links");
const pickHtml2 = renderToStaticMarkup(React.createElement(Pick, { city: "Sarasota", intent: "best-of", inventory: [], initialInventory: INV, lat: 27.33, lng: -82.53 }));
ok(pickHtml === pickHtml2, "IntentPartnerPick server markup is deterministic (no live-clock ordering on first render => no hydration mismatch)");

// ── ThemeParkRail + beach exclusion ──────────────────────────────────────
const parkMod = await loadComponent(rel("../app/components/ThemeParkRail.js"), REPO);
const Rail = parkMod.default;
const park = (id, name, extra = {}) => ({ id, name, lat: 28.4, lng: -81.5, rating: 4.7, reviews: 90000, wfScore: 90, category: "Activities", primaryType: "amusement_park", types: ["amusement_park", "tourist_attraction"], photo: "/api/photo?ref=x", market: "orlando", ...extra });
const railHtml = renderToStaticMarkup(React.createElement(Rail, { mode: "orlando", initialItems: [park("ChIJmk", "Magic Kingdom Park", { themeParkKey: "magic_kingdom" }), park("ChIJsw", "SeaWorld Orlando", { themeParkKey: "seaworld" })] }));
ok(goLinks(railHtml).length >= 1, `seeded ThemeParkRail renders ticket go-links in server markup (got ${goLinks(railHtml).length})`);
ok(!hrefsOf(railHtml).some((h) => PARTNER_HOSTS.test(h)), "no partner host in any theme-park href");
const beach = park("ChIJbeach", "Siesta Beach", { primaryType: "beach", types: ["beach", "natural_feature", "tourist_attraction"], category: "beach" });
const beachHtml = renderToStaticMarkup(React.createElement(Rail, { mode: "orlando", initialItems: [beach] }));
ok(goLinks(beachHtml).length === 0 && !/Siesta Beach/.test(beachHtml), "a beach / natural_feature row seeded into ThemeParkRail renders NO card and NO Book link");
ok(goLinks(renderToStaticMarkup(React.createElement(Rail, { mode: "orlando" }))).length === 0, "positive control: unseeded ThemeParkRail server markup has no links");

// ── seed helpers, CALLED with injected readers ───────────────────────────
const rails = await import("../lib/landingRails.js");
const seen = [];
const good = async (args) => { seen.push(args); return { dark: false, items: ROWS }; };
const tour = await rails.ssrTourStripItems({ lat: 27.33, lng: -82.53, serve: good });
ok(Array.isArray(tour) && tour.length === 3, "ssrTourStripItems returns the prepared rows from a healthy read");
ok(seen.length === 1 && seen[0].mi === 60 && seen[0].cat === "all" && seen[0].limit === 12, "ssrTourStripItems asks for the same window the client fetch does (mi=60 cat=all limit=12)");
ok(seen.every((a) => !a.fetchInit || a.fetchInit.cache !== "no-store") && seen[0].fetchInit && seen[0].fetchInit.next && seen[0].fetchInit.next.revalidate > 0, "server read goes through the Next data cache (next.revalidate), never cache:no-store");
const throws = async () => { throw new Error("boom"); };
const hangs = () => new Promise(() => {});
ok(await rails.ssrTourStripItems({ lat: 27.33, lng: -82.53, serve: throws }) === undefined, "a throwing read yields undefined (client path), not a throw");
ok(await rails.ssrTourStripItems({ lat: 27.33, lng: -82.53, serve: async () => ({ dark: true, items: [] }) }) === undefined, "a dark table yields undefined");
ok(await rails.ssrTourStripItems({ lat: 27.33, lng: -82.53, serve: hangs, deadlineMs: 30 }) === undefined, "a hung read is abandoned at the deadline");
ok(await rails.ssrTourStripItems({ lat: NaN, lng: 1, serve: good }) === undefined, "no coordinates yields undefined");
ok(await rails.ssrThemeParks({ mode: "orlando", load: throws }) === undefined, "ssrThemeParks is fail-soft");
let parkArgs = null;
ok((await rails.ssrThemeParks({ mode: "orlando", load: async (a) => { parkArgs = a; return [park("a", "Magic Kingdom Park")]; } })).length === 1 && parkArgs.fetchInit.next.revalidate > 0, "ssrThemeParks passes a cacheable fetchInit and returns rows");
const inv = await rails.ssrPartnerInventory({ city: "Sarasota", intent: "best-of", serve: async () => ({ dark: false, items: INV.map((r) => ({ ...r, url: "x" })) }) });
ok(Array.isArray(inv) && inv.length === 3, "ssrPartnerInventory returns qualified owned-cache rows for an owned destination");
ok(await rails.ssrPartnerInventory({ city: "Sarasota", intent: "best-of", serve: throws }) === undefined, "ssrPartnerInventory is fail-soft");
ok(await rails.ssrPartnerInventory({ city: "Nowhereville", intent: "best-of", serve: good }) === undefined, "a non-owned destination yields undefined (paid live legs are never run at render)");
const seeds = await rails.landingRailSeeds({ catSlug: "things-to-do", city: { name: "Orlando", lat: 28.5, lng: -81.4 }, metro: "orlando", railIntent: "best-of",
  deps: { tour: { serve: good }, inventory: { serve: good }, parks: { load: async () => [park("a", "Magic Kingdom Park")] } } });
ok(seeds.tourItems && seeds.partnerInventory && seeds.themeParks, "landingRailSeeds fills all three seeds for orlando things-to-do");
const nb = await rails.landingRailSeeds({ catSlug: "nightlife", city: { name: "Orlando", lat: 28.5, lng: -81.4 }, metro: "orlando", railIntent: null, deps: { tour: { serve: good }, parks: { load: async () => [park("a", "x")] } } });
ok(!nb.tourItems && !nb.partnerInventory && !nb.themeParks, "nightlife (no partner inventory) gets no seeds");

// ── the wiring: landing.js passes the seeds (JSX position; source-level) ──
const landing = readFileSync(rel("../lib/landing.js"), "utf8").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\*[\s\S]*?\*\//gm, "").replace(/^\s*\/\/.*$/gm, ""); // only comments that START a line / JSX comments: a naive strip pairs a "/*" inside a string with a later "*/" and eats real code
ok(/await\s+landingRailSeeds\(/.test(landing), "landing.js CALLS landingRailSeeds");
ok((landing.match(/<TourStrip\s[^>]*initialItems=\{railSeeds\.tourItems\}/g) || []).length === 2, "both <TourStrip/> uses (things-to-do, beaches) receive initialItems");
ok(/<IntentPartnerPick[^>]*initialInventory=\{railSeeds\.partnerInventory\}/.test(landing), "<IntentPartnerPick/> receives initialInventory");
ok(/<ThemeParkRail[^>]*initialItems=\{railSeeds\.themeParks\}/.test(landing), "<ThemeParkRail/> receives initialItems");

// Guides (2026-10-01): the "Bookable highlights" rail on a guide is seeded the
// same way, so it is painted at its final size instead of inserting ~208px
// above pick 1 after a client fetch (0.25 layout shift measured on
// /guides/things-to-do-sarasota). Source-level wiring check — the guide page
// itself needs live data to render; the seed helper and the seeded render are
// CALLED above.
{
  const guide = readFileSync(path.join(REPO, "app/guides/[slug]/page.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok(/import\s*\{\s*ssrPartnerInventory\s*\}\s*from\s*"[^"]*lib\/landingRails"/.test(guide), "guide page imports ssrPartnerInventory");
  ok(/const\s+railSeed\s*=[^;]*await\s+ssrPartnerInventory\(\{\s*city:\s*bridgeCity\.name,\s*intent:\s*railIntent\s*\}\)/.test(guide), "guide page CALLS ssrPartnerInventory for its rail city + intent");
  ok((guide.match(/<IntentPartnerPick[\s\S]{0,240}?initialInventory=\{railSeed\}/g) || []).length === 1, "the guide's one <IntentPartnerPick/> receives initialInventory={railSeed}");
}

console.log(`test-landing-ssr-rails: OK — ${pass} assertions (3 rail components RENDERED with seeds: go-links present in server markup, none on a partner host, none without a seed; beach row renders no Book link; seed helpers CALLED with throwing/dark/hung/healthy readers; wiring in landing.js checked at JSX position — source-level)`);
