// Guardrail: the launch SEO contract. Server-rendered H1 + crawlable links,
// canonical metadata, JSON-LD, real routes with correct indexing rules, and
// accessible nav anchors.
import { readFileSync, existsSync } from "fs";
const fail = (m) => { console.error("check-seo: FAIL — " + m); process.exit(1); };
const lay = readFileSync(new URL("../app/layout.js", import.meta.url), "utf8");
if (!/alternates: \{ canonical: "\/" \}/.test(lay)) fail("canonical missing");
if (!lay.includes('type="application/ld+json"')) fail("JSON-LD missing");
if (!/<h1[^>]*>Wayfind/.test(lay)) fail("server-rendered H1 missing");
for (const t of ['href={"/guides/', 'href={"/culture/', 'href="/terms"', 'href="/events"']) if (!lay.includes(t)) fail("SEO footer links missing: " + t);
for (const r of ["events", "map", "favorites", "itinerary"]) { if (!existsSync(new URL("../app/" + r + "/page.js", import.meta.url))) fail("route missing: /" + r); }
for (const r of ["favorites", "itinerary"]) { const p = readFileSync(new URL("../app/" + r + "/page.js", import.meta.url), "utf8"); if (!p.includes("robots: { index: false")) fail("/" + r + " must be noindex (private)"); }
for (const r of ["events", "map"]) { const p = readFileSync(new URL("../app/" + r + "/page.js", import.meta.url), "utf8"); if (p.includes("index: false")) fail("/" + r + " must stay indexable"); }
const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
if (!page.includes('href={{ home: "/", events: "/events", map: "/map", saved: "/favorites", itinerary: "/itinerary" }[s.id]')) fail("bottom nav anchors missing hrefs");
if (!page.includes('get("go")')) fail("go-param handoff missing");
const sm = readFileSync(new URL("../app/sitemap.js", import.meta.url), "utf8");
if (!sm.includes('"/events"') || !sm.includes('"/map"')) fail("sitemap missing public routes");
if (!lay.includes("People use Wayfind to")) fail("use-case links missing from server footer");
if (!lay.includes("affiliate links")) fail("affiliate disclosure missing from server footer");
if (!lay.includes('rel="preconnect"')) fail("preconnect hints missing");
const ev = readFileSync(new URL("../app/events/page.js", import.meta.url), "utf8");
const mp = readFileSync(new URL("../app/map/page.js", import.meta.url), "utf8");
if (!ev.includes("/guides") || !mp.includes("/guides")) fail("events/map fallback content missing internal links");
if (/\n  title: "Wayfind",/.test(lay)) fail("homepage title must carry search intent, not just the brand");
if (!lay.includes("Things to Do Near You")) fail("homepage title keywords missing");
console.log("check-seo: OK — SSR H1/links, canonical, JSON-LD, routes + indexing rules, nav anchors");
