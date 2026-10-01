// scripts/test-landing-offer-dedupe.mjs
//
// One Viator offer, one slot per landing page. IntentPartnerPick (surface
// intent_partner_rail) and TourStrip (surface tour_strip) used to render the SAME
// product twice (measured live 2026-09-30: same provider+code+title+price, same
// resolved destination; only our surface/content params differed). The strip now
// steps aside for anything the rail renders.
//
// Everything here is a CALL: the real components are rendered with overlapping
// fixtures and the go-links are counted per product id across the whole page; the
// shared prepare step the client refresh uses, the server-predicted rail set and the
// server prediction are invoked and asserted on their return values. A positive
// control proves non-overlapping products all still render.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadComponent } from "./lib/jsxLoad.mjs";

const fail = (m) => { console.error("test-landing-offer-dedupe: FAIL — " + m); process.exit(1); };
let pass = 0;
const ok = (c, m) => { if (!c) fail(m); pass += 1; };
const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const rel = (p) => fileURLToPath(new URL(p, import.meta.url));
const React = (await import("react")).default || (await import("react"));
const { renderToStaticMarkup } = await import("react-dom/server");

const Strip = (await loadComponent(rel("../app/components/TourStrip.js"), REPO)).default;
const Pick = (await loadComponent(rel("../app/components/IntentPartnerPick.js"), REPO)).default;
const { prepareTourStripItems } = await import("../lib/tourStripItems.js");
const { railViatorCodes, landingRailSeeds } = await import("../lib/landingRails.js");

const row = (code, extra = {}) => ({ code, title: `Distinct adventure ${code} on the bay`, image: `https://media.viator.com/${code}.jpg`, rating: 4.8, reviews: 500, fromPrice: 50, duration: "2h",
  url: `https://www.viator.com/tours/x/${code}?mcid=42383&pid=P00308545&medium=api`, ...extra });
const links = (html) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&")).filter((h) => h.startsWith("/api/commerce/go?"))
  .map((h) => { const q = new URLSearchParams(h.split("?")[1]); return { offer: q.get("offer"), surface: q.get("surface") }; });
const count = (ls, offer) => ls.filter((l) => l.offer === offer).length;

// ── 1. server prediction: railViatorCodes names exactly what the rail renders ──
const INV = ["AAA1", "BBB2", "CCC3"].map((c) => row(c));
const predicted = railViatorCodes({ city: "Sarasota", intent: "best-of", inventory: INV });
const railHtml = renderToStaticMarkup(React.createElement(Pick, { city: "Sarasota", intent: "best-of", inventory: [], initialInventory: INV, lat: 27.33, lng: -82.53 }));
const railLinks = links(railHtml);
ok(railLinks.length >= 3, `positive control: the rail renders its go-links (got ${railLinks.length})`);
for (const c of ["AAA1", "BBB2", "CCC3"]) ok(predicted.includes(c) && count(railLinks, c) === 1, `railViatorCodes predicts ${c} and the rail renders it once`);
ok(railViatorCodes({ city: "Sarasota", intent: "best-of", inventory: [] }).length === 0 && railViatorCodes({}).length === 0, "no inventory -> no prediction (never throws)");

// ── 2. overlapping page: rail + strip, every product id appears ONCE ──
const STRIP_ROWS = [row("AAA1"), row("BBB2"), row("XXX7"), row("YYY8"), row("ZZZ9")];
const stripItems = prepareTourStripItems({ items: STRIP_ROWS }, { excludeCodes: predicted });
ok(stripItems.map((t) => t.code).sort().join() === "XXX7,YYY8,ZZZ9", `prepare drops rail products BEFORE the slice and backfills (got ${stripItems.map((t) => t.code)})`);
const stripHtml = renderToStaticMarkup(React.createElement(Strip, { lat: 27.33, lng: -82.53, title: "Book", initialItems: stripItems, excludeCodes: predicted }));
const page = links(railHtml).concat(links(stripHtml));
for (const c of ["AAA1", "BBB2", "CCC3", "XXX7", "YYY8", "ZZZ9"]) ok(count(page, c) === 1, `${c} appears exactly once across rail + strip (got ${count(page, c)})`);
ok(links(stripHtml).every((l) => l.surface === "tour_strip") && links(stripHtml).length === 3, "strip still renders its 3 non-overlapping products under surface=tour_strip");
ok(links(railHtml).every((l) => l.surface === "intent_partner_rail"), "the rail keeps ownership of the shared products (surface=intent_partner_rail)");

// ── 3. a stale/undeduped seed is ALSO filtered at render (hydration cannot reintroduce) ──
const dirtySeed = [row("AAA1"), row("XXX7"), row("YYY8")];
const dirtyHtml = renderToStaticMarkup(React.createElement(Strip, { lat: 27.33, lng: -82.53, title: "Book", initialItems: dirtySeed, excludeCodes: ["AAA1"] }));
ok(count(links(dirtyHtml), "AAA1") === 0 && links(dirtyHtml).length === 2, "a seed containing a rail product renders without it");

// ── 4. positive control: NON-overlapping products all still render ──
const cleanItems = [row("P1"), row("P2"), row("P3"), row("P4")];
const cleanHtml = renderToStaticMarkup(React.createElement(Strip, { lat: 27.33, lng: -82.53, title: "Book", initialItems: prepareTourStripItems({ items: cleanItems }, { excludeCodes: predicted }), excludeCodes: predicted }));
ok(links(cleanHtml).length === 4, `no overlap -> all 4 strip products render (got ${links(cleanHtml).length})`);
ok(prepareTourStripItems({ items: cleanItems }).length === 4 && prepareTourStripItems({ items: cleanItems }, { excludeCodes: undefined }).length === 4, "no exclusion arg -> unchanged behaviour (best-beaches has no rail)");

// ── 5. empty state: every strip product already in the rail -> strip renders nothing ──
const allShared = renderToStaticMarkup(React.createElement(Strip, { lat: 27.33, lng: -82.53, title: "Book", initialItems: [row("AAA1"), row("BBB2"), row("CCC3")], excludeCodes: predicted }));
ok(links(allShared).length === 0 && !/Book/.test(allShared), "all strip products already in the rail -> the strip hides (existing <2 rule), the rail still carries them");
ok(prepareTourStripItems({ items: [row("AAA1"), row("BBB2"), row("CCC3")] }, { excludeCodes: predicted }).length === 0, "refresh path: same -> empty");
ok(prepareTourStripItems({ items: [row("AAA1"), row("XXX7")] }, { excludeCodes: predicted }).length === 1, "refresh path: one survivor is below the strip's minimum of 2 (strip hides, component rule)");

// ── 7. seeds end to end: landingRailSeeds wires the exclusion into the strip seed ──
const experiences = { items: [row("AAA1"), row("BBB2"), row("XXX7"), row("YYY8"), row("ZZZ9")] };
const seeds = await landingRailSeeds({ catSlug: "things-to-do", city: { name: "Sarasota", lat: 27.33, lng: -82.53 }, metro: "sarasota", railIntent: "best-of",
  deps: { inventory: { serve: async () => ({ items: INV.map((r) => ({ ...r })) }) }, tour: { serve: async () => experiences }, parks: { load: async () => [] } } });
ok(Array.isArray(seeds.railCodes) && seeds.railCodes.includes("AAA1"), "landingRailSeeds returns the rail's predicted viator codes");
// The seed is the UN-excluded pool: the prediction is applied by the strip at render, so
// a product the rail does not actually show can come back (test-landing-offer-dedupe-runtime).
ok(Array.isArray(seeds.tourItems) && seeds.tourItems.map((t) => t.code).sort().join() === "AAA1,BBB2,XXX7,YYY8,ZZZ9", `the strip SEED is the whole pool, not pre-excluded (got ${(seeds.tourItems || []).map((t) => t.code)})`);
const seededHtml = renderToStaticMarkup(React.createElement(Strip, { lat: 27.33, lng: -82.53, title: "Book", initialItems: seeds.tourItems, excludeCodes: seeds.railCodes }));
ok(links(seededHtml).map((l) => l.offer).sort().join() === "XXX7,YYY8,ZZZ9", `first paint from the seeds excludes the predicted rail products (got ${links(seededHtml).map((l) => l.offer)})`);

// ── 8. SOURCE-LEVEL wiring (weaker). The post-mount behaviour — following what the rail
// ACTUALLY renders — is mounted and exercised in test-landing-offer-dedupe-runtime.mjs.
const { readFileSync } = await import("node:fs");
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const landSrc = strip(readFileSync(rel("../lib/landing.js"), "utf8"));
ok((landSrc.match(/<TourStrip[^>]*excludeCodes=\{railSeeds\.railCodes\}/g) || []).length === 2, "WEAKER (source) check: both landing <TourStrip> usages pass excludeCodes={railSeeds.railCodes}");

console.log(`test-landing-offer-dedupe: OK — ${pass} assertions; rail+strip rendered with overlapping and disjoint fixtures, each product id counted once per page, empty-state exercised; first paint applies the server prediction to the un-excluded seed`);
