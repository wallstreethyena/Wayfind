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
// landingMetadata() carries the canonical for the /{cat}/{city} pages —
// assert that once, then accept the call sites.
if (!readFileSync(join(root, "lib", "landing.js"), "utf8").includes("alternates: { canonical: url }")) fail("landingMetadata lost its canonical");
for (const p of pages) {
  if (p === join(root, "app", "page.js")) continue;
  const s = readFileSync(p, "utf8");
  if (!(s.includes("canonical") || s.includes("index: false") || s.includes("landingMetadata("))) fail(`route ${p.slice(root.length)} declares neither a canonical nor noindex — it inherits canonical "/" and reads as a homepage duplicate`);
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
const page = readFileSync(join(root, "app", "page.js"), "utf8");
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

console.log("check-seo: OK — canonical-or-noindex on " + pages.length + " routes, single H1, honest CTAs, named attribution, sitemap clean");
