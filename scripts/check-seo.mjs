// Guardrail: the SEO architecture contract (launch rules + audit, July 2026).
//
// 1. EVERY route must either declare its own canonical or be noindexed —
//    the root layout carries canonical "/" and Next.js metadata inheritance
//    hands it to any page that doesn't override, silently telling Google
//    that page is a duplicate of the homepage (the bug that flattened the
//    site's architecture).
// 2. ONE H1 per page: the layout footer heading stays demoted to a div.
// 3. Honest CTAs: "Book this experience" may not label related-product links.
// 4. E-E-A-T surfaces stay: named attribution, /about, /editorial-policy,
//    /how-wayfind-ranks, and the methodology link on every guide.
// 5. Thin utility pages (/events, /coupons, /map) stay noindexed until they
//    render real crawlable inventory.
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error("check-seo: FAIL — " + m); process.exit(1); };

// 1. canonical-or-noindex on every page.js under app/ (the app-shell
//    homepage inherits its canonical from the root layout by design).
const pages = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== "api" && f !== "components") walk(p); } else if (f === "page.js") pages.push(p); } };
walk(join(root, "app"));
// landingMetadata() / trending metadata carry the canonical for their pages —
// assert that once each, then accept the call sites.
if (!readFileSync(join(root, "lib", "landing.js"), "utf8").includes("alternates: { canonical: url }")) fail("landingMetadata lost its canonical");
const trendingLib = readFileSync(join(root, "lib", "trending.js"), "utf8");
if (!trendingLib.includes("alternates: { canonical: url }")) fail("trending metadata lost its canonical");
if (!readFileSync(join(root, "lib", "placeData.js"), "utf8").includes("alternates: { canonical: url }")) fail("place-page metadata lost its canonical");
// VideoObject rich-result schema is DEFERRED (owner decision; no re-hosting of a
// creator's frame) behind lib/videoObjectGate.js. Enforce that no VideoObject JSON-LD
// or og:video meta is actually EMITTED until that gate is deliberately wired. Match
// real emission (quoted @type / quoted meta value), not prose that mentions them.
if (/"@type"\s*:\s*"VideoObject"|["']og:video["']/.test(trendingLib)) fail("VideoObject/og:video is gated (lib/videoObjectGate.js) — do not emit until every eligibility condition is met (creator permission + a real self-served thumbnail + no-click render + verification)");
for (const p of pages) {
  if (p === join(root, "app", "page.js")) continue;
  const s = readFileSync(p, "utf8");
  if (!(s.includes("canonical") || s.includes("index: false") || s.includes("landingMetadata(") || s.includes("trendingMetadata(") || s.includes("trendingIndexMetadata(") || s.includes("placePageMetadata(") || s.includes("placesIndexMetadata("))) fail(`route ${p.slice(root.length)} declares neither a canonical nor noindex — it inherits canonical "/" and reads as a homepage duplicate`);
}

// 2. layout contract: homepage canonical, JSON-LD, footer links, no H1.
const lay = readFileSync(join(root, "app", "layout.js"), "utf8");
if (!/alternates: \{ canonical: "\/" \}/.test(lay)) fail("homepage canonical missing from layout — ?go= app states would go uncanonicalized");
if (lay.includes("<h1")) fail("the shared layout renders an H1 — every article would carry a duplicate H1 (demote to div)");
if (!lay.includes('type="application/ld+json"')) fail("JSON-LD missing from layout");
for (const t of ['href={"/guides/', 'href={"/culture/', 'href="/terms"', 'href="/about"', 'href="/editorial-policy"', 'href="/how-wayfind-ranks"']) if (!lay.includes(t)) fail("footer links missing: " + t);
if (!lay.includes("People use Wayfind to")) fail("use-case links missing from server footer");
if (!lay.includes("affiliate links")) fail("affiliate disclosure missing from server footer");
if (!lay.includes('rel="preconnect"')) fail("preconnect hints missing");
if (/\n  title: "Wayfind",/.test(lay)) fail("homepage title must carry search intent, not just the brand");
if (!lay.includes("Things to Do Near You")) fail("homepage title keywords missing");

// 3. app shell: nav anchors + go-param handoff survive.
const page = readFileSync(join(root, "app", "home.js"), "utf8");
if (!page.includes('href={{ home: "/", events: "/events", coupons: "/coupons", map: "/map", saved: "/favorites", itinerary: "/itinerary" }[s.id]')) fail("bottom nav anchors missing hrefs");
if (!page.includes('get("go")')) fail("go-param handoff missing");

// 4. indexing rules per route class.
for (const r of ["favorites", "itinerary"]) { const s = readFileSync(join(root, "app", r, "page.js"), "utf8"); if (!s.includes("index: false")) fail("/" + r + " must be noindex (private)"); }
for (const r of ["events", "coupons", "map"]) { const s = readFileSync(join(root, "app", r, "page.js"), "utf8"); if (!s.includes("index: false")) fail("/" + r + " is indexable but renders no crawlable inventory — noindex it or render real listings"); }
for (const r of [["l", "[key]"], ["w"], ["s", "[code]"], ["p", "[id]"]]) { const s = readFileSync(join(root, "app", ...r, "page.js"), "utf8"); if (!s.includes("index: false")) fail("/" + r[0] + " share/app-state pages must be noindexed (infinite query space)"); }

// 5. sitemap lists only index-worthy routes.
const sm = readFileSync(join(root, "app", "sitemap.js"), "utf8");
for (const t of ['"/about"', '"/editorial-policy"', '"/how-wayfind-ranks"', '"/guides"']) if (!sm.includes(t)) fail("sitemap missing " + t);
for (const t of ['"/events"', '"/map"']) if (sm.includes(t)) fail("sitemap lists noindexed route " + t);

// 6. honest CTAs + E-E-A-T.
const culture = readFileSync(join(root, "app", "culture", "[metro]", "page.js"), "utf8");
if (culture.includes("Book this experience")) fail('culture pages label related tours "Book this experience" — only exact products may say that');
for (const f of ["about", "editorial-policy", "how-wayfind-ranks"]) if (!existsSync(join(root, "app", f, "page.js"))) fail(`/${f} page missing`);
const guide = readFileSync(join(root, "app", "guides", "[slug]", "page.js"), "utf8");
if (!guide.includes("Gabriel Pereira")) fail("guides lost their named attribution");
if (!guide.includes("How we rank")) fail("guides lost the ranking-methodology link");
if (guide.includes("By the Wayfind editorial team")) fail("anonymous 'editorial team' byline resurfaced");

// 6b. the landing search is cache-first with stale-if-error — a Google
//     quota blip must never prerender the landing pages without their lists.
const landingLib = readFileSync(join(root, "lib", "landing.js"), "utf8");
if (!landingLib.includes("wf_places_cache")) fail("landing search lost its durable cache — builds would burn Google quota and 429s would empty every landing list");
if (!landingLib.includes("serve stale")) fail("landing search lost stale-if-error");

// 7. destination hubs exist and the Sarasota culture page links to them
//    instead of carrying every full town profile inline.
const cultureLib = readFileSync(join(root, "lib", "culture.js"), "utf8");
if (!cultureLib.includes("export const TOWN_HUBS")) fail("TOWN_HUBS missing from lib/culture.js");
if (!existsSync(join(root, "app", "florida", "[town]", "page.js"))) fail("/florida/[town] destination hubs missing");
if (!culture.includes('href={"/florida/" + TOWN_HUBS[k]}')) fail("culture pages no longer link town hubs — the oversized inline profiles are banned for hub towns");
const smHubs = readFileSync(join(root, "app", "sitemap.js"), "utf8");
if (!smHubs.includes("TOWN_HUBS")) fail("sitemap missing the /florida destination hubs");

// 8. homepage decision proof (audit #2): the route is a server wrapper that
//    renders real ranked recommendations into the initial HTML, and the
//    loading state explains its inputs instead of "Reading the moment".
const homeRoute = readFileSync(join(root, "app", "page.js"), "utf8");
if (!homeRoute.includes("HomeProof") || !homeRoute.includes("rankedFor(")) fail("homepage lost its server-rendered recommendation proof");
if (!page.startsWith('"use client"')) fail("app/home.js must stay the client app shell");
if (page.includes("Reading the moment")) fail('"Reading the moment" resurfaced — loading copy must state the moment and the factors');
if (!page.includes("Finding the best options for")) fail("contextual loading copy missing");
if (!page.includes("ranked by real reviews, not ads")) fail("loading factors sub-line missing");
if (!lay.includes("decides what\u2019s actually worth your time") && !lay.includes("decides what's actually worth your time")) fail("decision-language value proposition missing from layout");

// 9. THE SHARE-CARD RULE (owner, 2026-07-22, global): every page that sets
//    openGraph ships images with it (Next replaces the whole block — a
//    manual openGraph without images means NO preview image at all), and
//    the flagship surfaces point at their own unique OG endpoint.
for (const p of pages) {
  const src = readFileSync(p, "utf8");
  if (/openGraph\s*:/.test(src) && !/images\s*:/.test(src) && !src.includes("socialMeta(")) fail(p.replace(root + "/", "") + " sets openGraph without images — the share preview goes blank (route through socialMeta or add images)");
}
const uniqueOg = [
  ["app/best-beaches/[metro]/page.js", "/api/og/beaches"],
  ["app/family/page.js", "/api/og/intent"],
  ["app/date-night/page.js", "/api/og/intent"],
  ["app/guides/[slug]/page.js", "/api/og?t="],
  ["app/culture/[metro]/page.js", "/api/og?t="],
  ["app/florida/[town]/page.js", "/api/og?t="],
  ["app/about/page.js", "/api/og?t="],
  ["app/how-wayfind-ranks/page.js", "/api/og?t="],
];
for (const [f, marker] of uniqueOg) {
  const src = readFileSync(join(root, ...f.split("/")), "utf8");
  if (!src.includes(marker)) fail(f + " lost its page-unique share card (" + marker + ") — the global share-card rule");
}

// 9b. events indexing policy (owner, 2026-07-22): the evergreen WINDOW LISTS
//     (this-weekend/tonight/this-month per city) are indexed + sitemapped —
//     SSR'd real inventory with Event schema. Dated event DETAIL pages stay
//     noindexed FOREVER (infinite, rotting inventory), and the SSR list fetch
//     must ride the cacheable GET twin so crawlers can't trigger live
//     provider aggregations.
const evSlug = readFileSync(join(root, "app", "events", "[city]", "[slug]", "page.js"), "utf8");
if (!/WINDOW LISTS enter the index/.test(evSlug) || !evSlug.includes("robots: { index: true, follow: true }")) fail("event window lists lost their indexability");
if (!evSlug.includes("infinite, dated inventory")) fail("event DETAIL pages must stay noindexed — dated inventory rots in the index");
if (!evSlug.includes("/api/events?lat=") || evSlug.includes('method: "POST"')) fail("event list SSR must use the cacheable GET twin, never a live POST per crawl hit");
if (!sm.includes("EVENT_WINDOWS")) fail("sitemap missing the event window lists");

// 10. discoverability locks (v6.55 audit): the flagship beach pages are in
//     the sitemap, carry structured data, and the site declares SearchAction.
if (!sm.includes("BEACH_METROS") || !sm.includes("/best-beaches/")) fail("sitemap missing the /best-beaches flagship pages");
const bbPage = readFileSync(join(root, "app", "best-beaches", "[metro]", "page.js"), "utf8");
if (!bbPage.includes("application/ld+json") || !bbPage.includes('"@type": "ItemList"')) fail("/best-beaches lost its ItemList structured data");
if (!bbPage.includes('"@type": "FAQPage"')) fail("/best-beaches lost its FAQ structured data");
if (!lay.includes("SearchAction")) fail("layout WebSite JSON-LD lost its SearchAction (sitelinks searchbox)");

console.log("check-seo: OK — canonical-or-noindex on " + pages.length + " routes, single H1, honest CTAs, named attribution, share-card rule, sitemap clean");
