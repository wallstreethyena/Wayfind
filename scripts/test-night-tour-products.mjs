#!/usr/bin/env node

import { isNightTourProduct, nightTourCacheCovers, nightTourProducts } from "../lib/nightTourProducts.js";
import { readFileSync } from "node:fs";
import { filterByChip } from "../lib/experiencesServe.js";

let pass = 0;
const failures = [];
const ok = (condition, message) => { if (condition) pass += 1; else failures.push(message); };

const TRUE_NIGHT = [
  "Haunted Tampa Booze and Boos Ghost Walking Tour",
  "A Toast to the Ghost Haunted Pub Crawl in Downtown Orlando",
  "Moonlight Kayak Eco Tour",
  "Segway Istanbul Old City Tour - Evening",
  "After Dark Guided Walking Tour",
];
for (const title of TRUE_NIGHT) ok(isNightTourProduct(title), `accepts explicit night activity: ${title}`);

const WRONG_INTENT = [
  "Tampa Riverwalk Street Food by the Bay 3 Hour Walking Food Tour",
  "The Tour and Wine Tasting Experience at Aspirations Winery",
  "St. Pete Street Feast Funky Bites Street Eats and Trivia Nights",
  "Grocery Store and Farmers Market Food Tour",
  "City Sightseeing Trolley Tour of Sarasota",
];
for (const title of WRONG_INTENT) ok(!isNightTourProduct(title), `rejects daytime/food look-alike: ${title}`);

const rows = [
  { code: "night-high", provider: "viator", title: TRUE_NIGHT[0], rating: 4.8, reviews: 800 },
  { code: "night-low", provider: "viator", title: TRUE_NIGHT[1], rating: 4.7, reviews: 100 },
  { code: "food", provider: "viator", title: WRONG_INTENT[0], rating: 5, reviews: 9000 },
  { code: "wrong-provider", provider: "other", title: TRUE_NIGHT[2], rating: 5, reviews: 9000 },
  { code: "night-high", provider: "viator", title: TRUE_NIGHT[3], rating: 5, reviews: 9000 },
];
const selected = nightTourProducts(rows);
ok(selected.length === 2, `selection keeps exactly two eligible unique Viator products (got ${selected.length})`);
ok(selected[0]?.code === "night-high", "selection uses the shared experience ranking law");
ok(!selected.some((row) => row.code === "food"), "a highly rated daytime food tour cannot rank its way into Night Tours");
ok(nightTourProducts([], 20).length === 0, "healthy empty cached inventory stays empty");
ok(nightTourProducts(rows, 1).length === 1, "the display bound is enforced after eligibility and ranking");
ok(nightTourCacheCovers({ lat: 27.95, lng: -82.46 }, 27), "a location inside a harvested market can use its cached products");
ok(!nightTourCacheCovers({ lat: 26.14, lng: -81.79 }, 27), "the shared 150-mile nearest-market fallback cannot leak into a 27-mile Night Out rail");

// Exact link-ok Sarasota rows observed in wf_experiences on 2026-09-10. The
// server sees product_code rows; the client receives their normalized `code`
// cards. Both stages call the same experienceConcepts predicate.
const SARASOTA_ROWS = [
  ["5595165P6", "90 Minute LED Illuminated Clear Kayak Night Adventure Tour"],
  ["292464P4", "Anna Maria Island - Clear Kayak LED Night Glass Bottom Tour"],
  ["387951P1", "Clear Kayak Private Guided Day and Night Tours in Florida"],
  ["120329P6", "Haunted Sarasota Trolley: Ghost Stories, Mysteries, Spooky Fun"],
  ["87414P7", "Mangroves, Midnight Pass & Hidden Beach Kayak Tour | Siesta Key"],
  ["5637533P5", "Night Glow Clear Kayak Adventure in Anna Maria Island"],
  ["292464P2", "Sarasota - Clear Kayak LED Night Glass Bottom Tour"],
  ["5642086P1", "Sharkey’s Glass Bottom Kayak Night Tour with Fish Feeding!"],
  ["292464P7", "Siesta Key, FL - Clear Kayak LED Night Glass Bottom Tour"],
].map(([product_code, title]) => ({ product_code, title, provider: "viator", link_ok: true, rating: 4.8, reviews: 100, categories: [] }));
const serverSelected = filterByChip(SARASOTA_ROWS, "concept:night-tours");
ok(serverSelected.length === 8, `the strict server concept admits 8 of 9 real Sarasota rows (got ${serverSelected.length})`);
ok(!serverSelected.some((row) => row.product_code === "87414P7"), "Midnight Pass is a daytime place name, not night evidence");
for (const code of ["5595165P6", "292464P4", "387951P1", "120329P6", "5637533P5", "292464P2", "5642086P1", "292464P7"]) {
  ok(serverSelected.some((row) => row.product_code === code), `server selection keeps verified Sarasota night product ${code}`);
}
const clientSelected = nightTourProducts(serverSelected.map((row) => ({ ...row, code: row.product_code })));
ok(clientSelected.length === 8, `the shared client predicate preserves all 8 server-admitted cards (got ${clientSelected.length})`);

const nightOutComponent = readFileSync(new URL("../app/components/NightOutRails.js", import.meta.url), "utf8");
const experienceServe = readFileSync(new URL("../lib/experiencesServe.js", import.meta.url), "utf8");
const tonightClient = readFileSync(new URL("../app/tonight/client.js", import.meta.url), "utf8");
const tonightPage = readFileSync(new URL("../app/components/NightOutIntentPage.js", import.meta.url), "utf8");
ok(nightOutComponent.includes('"/api/experiences?"') && nightOutComponent.includes('cat: "concept:night-tours"'),
  "Night Tours asks the cached route to apply its dedicated strict server filter before paging");
ok(experienceServe.indexOf("const view = filterByChip(rows, active)") < experienceServe.indexOf("rankExperiences(view.map(rowToCard))")
  && experienceServe.indexOf("rankExperiences(view.map(rowToCard))") < experienceServe.indexOf("ranked.slice("),
  "server concept admission runs before ranking and paging, so broad nightlife rows cannot starve true night products");
ok(!nightOutComponent.includes("/api/viator/tours") && !nightOutComponent.includes("/api/viator/curated"),
  "the dedicated Night Out rail has no paid-provider miss fallback");
ok(tonightClient.includes("NightOutIntentPage") && !tonightClient.includes("IntentPageClient"),
  "/tonight mounts the dedicated ten-rail Night Out answer");
ok(tonightPage.includes("usePosterEvents") && tonightPage.includes('mode: "night-out"') && tonightPage.includes("PosterEventCard"),
  "/tonight feeds current concerts and other qualified events into the dedicated rails");
ok(tonightPage.includes("failed: posterEvents.failed") && nightOutComponent.includes("eventSurface?.failed"),
  "the standalone event failure reaches one collection-level Night Out notice");

if (failures.length) {
  console.error(`test-night-tour-products: FAIL — ${failures.length} assertion(s)`);
  for (const message of failures) console.error("  - " + message);
  process.exit(1);
}
console.log(`test-night-tour-products: OK — ${pass} behavioral assertions`);
