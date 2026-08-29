// scripts/test-atlas-place-pages.mjs — Atlas cards open at /places/{id} with
// ZERO Google spend. Executes the allowlist + merge (not a source-only grep).
//
// Locked:
//   1. A publish-ready Atlas id (Lido, Oscar Scherer, Beer Can Island) builds
//      a page from card + atlas-590 identity. Description is sourced knownFor
//      + whyGo. No lat/lng is invented.
//   2. An unknown id stays null (404).
//   3. A silent Atlas-590 id with no editorial card (Point of Rocks) stays
//      null — no invented copy, the other 349 stay blank.
//   4. shouldCallGooglePlaceDetails is false whenever an Atlas card exists
//      (skeleton or not, cache warm or cold). True only for indexed + cold
//      cache + no Atlas.
//   5. loadPlace / peekPlaceDetails source: Atlas-only path never calls
//      Places. peekPlaceDetails has no googleapis URL.
//   6. editorial-cards.json stays server-only (no client / home.js import).
//   7. No CSS / home.js appearance imports in the files this change owns.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  atlasAllowlistApplyGate,
  atlasPageDescription,
  atlasPlaceFor,
  hasPublishReadyAtlasCard,
  inventoryToSkeleton,
  listPublishReadyAtlasIds,
  mergePlacePage,
  planAtlasAllowlistSeed,
  preferInventorySkeleton,
  shouldCallGooglePlaceDetails,
  unionIndexedAndAtlasIds,
  usableSupabaseEnv,
} from "../lib/atlasPlaceAllowlist.js";
import { atlasCardFor, indexAtlasCards, missingAtlasEditorial, parseAtlas590 } from "../lib/atlasCards.js";
import { knownForLine } from "../lib/knownFor.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error("  - " + m); } };

const LIDO = "ChIJaW-sUB9rw4gRrQvxVM94nOY";
const OSCAR = "ChIJpSsncQ5Fw4gRPwZCzCeVvgU";
const BEER = "ChIJRVIh8swTw4gRd4IN3N4R8vw";
const POINT_OF_ROCKS = "ChIJD3tKOCNCw4gR_-Jbam9Vc24";
const UNKNOWN = "ChIJnotarealplaceid00000000000";

const cards = JSON.parse(read("data/atlas/editorial-cards.json"));
const atlas590 = parseAtlas590(read("data/atlas/atlas-590.tsv"));
const index = indexAtlasCards(cards);
// 255 from #1021 + 8 sourced ChIJ cards from the 2026-08-29 owner batch (#1019)
// + 1 official North Redington Beach Frog Pond ChIJ from 2026-08-29e.
// The three Tampa farms stay HOLD — they must not mint ids or grow this count.
const PUBLISH_READY = 264;

// ── 1. allowlist size + the three live-404 examples open ──────────────────
const allow = listPublishReadyAtlasIds();
ok(allow.length === PUBLISH_READY, `allowlist is ${allow.length} ids, not ${PUBLISH_READY}`);
ok(allow.includes(LIDO) && allow.includes(OSCAR) && allow.includes(BEER),
  "Lido / Oscar Scherer / Beer Can Island missing from the publish-ready allowlist");
ok(!allow.includes(POINT_OF_ROCKS), "Point of Rocks (silent) leaked into the allowlist");

for (const [id, nameRe, takeRe] of [
  [LIDO, /Lido Beach/, /Lido Key|St\. Armands|Gulf beach/i],
  [OSCAR, /Oscar Scherer/, /scrub-jay|Legacy Trail|Lake Osprey/i],
  [BEER, /Beer Can Island|Greer Island/, /Longboat|Greer|spit/i],
]) {
  const p = atlasPlaceFor(id);
  ok(!!p, `${id} produced no Atlas place page`);
  ok(p && nameRe.test(p.name), `${id} name drifted (got "${p && p.name}")`);
  ok(p && takeRe.test(p.description || ""), `${id} description is not sourced knownFor+whyGo (got "${p && p.description}")`);
  ok(p && p.lat == null && p.lng == null, `${id} invented lat/lng — Atlas-590 has none and we must not fetch Google`);
  const card = atlasCardFor(index, id);
  ok(card && knownForLine({
    place_id: card.placeId, name: card.name, hook: card.knownFor, why_here: card.whyGo, verified: true,
  }), `${id} two-beat is unsourced — page must stay empty, not invent`);
}

ok(atlasPlaceFor(LIDO).address && /Franklin|Lido/i.test(atlasPlaceFor(LIDO).address),
  "Lido address did not come from card / atlas-590");
ok(atlasPlaceFor(BEER).address && /Broadway|Longboat/i.test(atlasPlaceFor(BEER).address),
  "Beer Can Island fell through to the TSV placeholder instead of the card address");

// ── 2. unknown id + silent Atlas-590 stay null ────────────────────────────
ok(atlasPlaceFor(UNKNOWN) == null, "unknown id invented an Atlas page");
ok(hasPublishReadyAtlasCard(UNKNOWN) === false, "unknown id is allowlisted");
ok(atlasPlaceFor(POINT_OF_ROCKS) == null, "Point of Rocks (no card) invented copy");
ok(hasPublishReadyAtlasCard(POINT_OF_ROCKS) === false, "silent Point of Rocks is allowlisted");
ok(mergePlacePage(POINT_OF_ROCKS, { skel: null, details: null, atlas: null }) == null,
  "mergePlacePage invented a row with no skeleton and no Atlas card");
ok(mergePlacePage(UNKNOWN, {}) == null, "mergePlacePage on empty extras is not null");

const missing = missingAtlasEditorial(atlas590, cards);
ok(missing.length >= 300, `silent residual set shrank unexpectedly (${missing.length}) — do not open those ids`);
ok(missing.some((r) => r.place_id === POINT_OF_ROCKS), "Point of Rocks is no longer in the silent residual set");
for (const r of missing.slice(0, 12)) {
  ok(atlasPlaceFor(r.place_id) == null, `silent Atlas-590 ${r.name} (${r.place_id}) invented a page`);
}

// Every allowlisted card has sourced knownFor + whyGo on the card itself.
// Description is those fields (or the rail line). Empty only if both are empty.
let sourced = 0;
for (const id of allow) {
  const card = atlasCardFor(index, id);
  const desc = atlasPageDescription(card);
  if (desc) sourced++;
  ok(!!(card && (card.knownFor || card.whyGo)), `${id} is allowlisted with no sourced two-beat on the card`);
  ok(desc == null || desc.length >= 20, `${id} shipped a fragment take`);
  ok(desc == null || !/worth a look|a solid choice|our #1 pick/i.test(desc), `${id} invented generic filler`);
}
ok(sourced === PUBLISH_READY, `${sourced} of ${PUBLISH_READY} cards produced a sourced take — the rest must stay empty, not invent`);

// ── 3. Google spend gate (executed, not grepped) ──────────────────────────
ok(shouldCallGooglePlaceDetails({ skel: null, cached: null, atlas: atlasPlaceFor(LIDO) }) === false,
  "Atlas-only Lido would still call Google");
ok(shouldCallGooglePlaceDetails({ skel: { name: "Lido" }, cached: null, atlas: atlasPlaceFor(LIDO) }) === false,
  "indexed + cold cache + Atlas still spends Places — prefer skeleton + Atlas copy");
ok(shouldCallGooglePlaceDetails({ skel: { name: "Lido" }, cached: { name: "Lido" }, atlas: atlasPlaceFor(LIDO) }) === false,
  "warm cache + Atlas still spends Places");
ok(shouldCallGooglePlaceDetails({ skel: { name: "Indexed" }, cached: null, atlas: null }) === true,
  "indexed + cold cache + no Atlas no longer calls getPlaceDetails — that is the existing durable path");
ok(shouldCallGooglePlaceDetails({ skel: null, cached: null, atlas: null }) === false,
  "no skeleton + no Atlas would call Google (must 404 first)");

const mergedAtlas = mergePlacePage(LIDO, { skel: null, details: null, atlas: atlasPlaceFor(LIDO) });
ok(mergedAtlas && mergedAtlas.name && mergedAtlas.description && mergedAtlas.hasDetails,
  "Atlas-only merge did not produce an indexable page from sourced copy");
ok(mergedAtlas.lat == null && mergedAtlas.lng == null, "Atlas-only merge invented coordinates");

const mergedSkel = mergePlacePage(LIDO, {
  skel: { name: "Lido Beach", lat: 27.31, lng: -82.58, category: "Activities", signals: { rating: 4.6, reviews: 1200 } },
  details: null,
  atlas: atlasPlaceFor(LIDO),
});
ok(mergedSkel.lat === 27.31 && mergedSkel.lng === -82.58, "skeleton lat/lng was dropped when cache was cold");
ok(mergedSkel.description && /Lido/i.test(mergedSkel.description), "cold-cache indexed path lost Atlas copy");
ok(mergedSkel.rating === 4.6, "skeleton rating was dropped");

const invRow = { place_id: LIDO, name: "Lido Beach", lat: 27.311, lng: -82.582, category: "beach", signals: { rating: 4.4, reviews: 890 }, status: "OPERATIONAL" };
const fromInv = inventoryToSkeleton(invRow);
ok(fromInv && fromInv.lat === 27.311 && fromInv.lng === -82.582 && fromInv.signals.rating === 4.4,
  "inventoryToSkeleton dropped lat/lng/signals we already hold");
ok(inventoryToSkeleton({ place_id: LIDO }) == null, "inventory row without a name invented a skeleton");
ok(inventoryToSkeleton(null) == null, "null inventory invented a skeleton");

const preferred = preferInventorySkeleton(fromInv, { name: "Old", lat: 1, lng: 2, signals: { rating: 1 } });
ok(preferred.lat === 27.311 && preferred.name === "Lido Beach" && preferred.signals.rating === 4.4,
  "preferInventorySkeleton did not let inventory win on name/lat/signals");
ok(preferInventorySkeleton(null, { name: "Indexed", lat: 9, lng: 8 }).lat === 9,
  "preferInventorySkeleton dropped the indexed skeleton when inventory was absent");
ok(preferInventorySkeleton(null, null) == null, "preferInventorySkeleton invented a row from nothing");

const mergedInv = mergePlacePage(LIDO, { skel: fromInv, details: null, atlas: atlasPlaceFor(LIDO) });
ok(mergedInv.lat === 27.311 && mergedInv.lng === -82.582 && mergedInv.rating === 4.4,
  "merge did not use inventory lat/lng/signals — that is the held row, not a Google call");
ok(mergedInv.address && /Franklin|Lido/i.test(mergedInv.address),
  "inventory merge lost the Atlas/TSV address (inventory has no address column)");

const seed = planAtlasAllowlistSeed({
  atlasIds: [LIDO, OSCAR, POINT_OF_ROCKS, UNKNOWN],
  silentIds: [POINT_OF_ROCKS],
  inventoryById: new Map([
    [LIDO, invRow],
    [POINT_OF_ROCKS, { place_id: POINT_OF_ROCKS, name: "Point of Rocks", lat: 27.2, lng: -82.5, category: "beach" }],
  ]),
});
ok(seed.payloads.length === 1 && seed.payloads[0].place_id === LIDO && seed.payloads[0].lat === 27.311,
  "seed plan must write only inventory-backed Atlas cards");
ok(seed.refusedSilent.includes(POINT_OF_ROCKS) && !seed.payloads.some((p) => p.place_id === POINT_OF_ROCKS),
  "silent Point of Rocks entered the wf_place_ids payload — stay blank");
ok(seed.missingInventory.includes(OSCAR) && seed.missingInventory.includes(UNKNOWN),
  "ids without inventory must be reported, not invented");

ok(atlasAllowlistApplyGate({ apply: false, url: "https://x.supabase.co", serviceKey: "svc" }).write === false,
  "dry-run must not write");
ok(atlasAllowlistApplyGate({ apply: true, url: "", serviceKey: "svc" }).write === false,
  "--apply without URL wrote");
ok(atlasAllowlistApplyGate({ apply: true, url: "https://x.supabase.co", serviceKey: "" }).write === false,
  "--apply without service role wrote");
ok(atlasAllowlistApplyGate({ apply: true, url: "https://x.supabase.co", serviceKey: "svc" }).write === true,
  "keyed --apply is the only write path");
ok(usableSupabaseEnv("https://e2eplaceholder.supabase.co", "e2e-placeholder-anon-key-not-real") === false,
  "e2e placeholder env is treated as live");
ok(atlasAllowlistApplyGate({
  apply: true,
  url: "https://e2eplaceholder.supabase.co",
  serviceKey: "e2e-placeholder-anon-key-not-real",
}).write === false, "--apply with placeholder env wrote");

const united = unionIndexedAndAtlasIds(["aaa", LIDO], allow);
ok(united[0] === "aaa" && united.includes(LIDO) && united.length === PUBLISH_READY + 1,
  `union did not keep indexed ids + ${PUBLISH_READY} Atlas cards (deduped)`);

// ── 4. source: loadPlace / peek never hit Places for Atlas ids ────────────
const pd = code("lib/placeData.js");
ok(/const atlas = atlasPlaceFor\(id\)/.test(pd), "loadPlace no longer reads the Atlas allowlist");
ok(/atlasPlaceFor/.test(pd) && /if \(!skel && !atlas\) return null/.test(pd),
  "loadPlace lost the dual allowlist short-circuit (skeleton OR Atlas)");
ok(/const inv = atlas \? await getInventoryIdentity\(id\) : null/.test(pd),
  "loadPlace no longer reads wf_inventory for Atlas ids (or reads it for non-Atlas ids)");
ok(/preferInventorySkeleton\(inv, indexed\)/.test(pd),
  "loadPlace no longer prefers inventory identity over a Places call");
ok(/peekPlaceDetails\(id\)/.test(pd), "loadPlace no longer peeks the pd1| cache before considering Google");
ok(/if \(shouldCallGooglePlaceDetails\(\{ skel: indexed, cached, atlas \}\)\)/.test(pd),
  "getPlaceDetails is no longer gated on shouldCallGooglePlaceDetails({ skel: indexed, cached, atlas })");
ok(/details = await getPlaceDetails\(id\)/.test(pd),
  "non-Atlas indexed cold-cache path lost getPlaceDetails — that path is still allowed");

const det = code("lib/placeDetails.js");
const peekStart = det.indexOf("export async function peekPlaceDetails");
ok(peekStart >= 0, "peekPlaceDetails export is gone");
const peekEnd = det.indexOf("export async function getPlaceDetails", peekStart + 1);
const peekFn = peekStart >= 0 ? det.slice(peekStart, peekEnd > peekStart ? peekEnd : peekStart + 800) : "";
ok(peekFn && /export async function peekPlaceDetails/.test(peekFn), "could not isolate peekPlaceDetails — guard cannot prove it");
ok(!/places\.googleapis/.test(peekFn), "peekPlaceDetails contains a Places API URL — Atlas cold-cache would spend Google");
ok(!/spendAllow/.test(peekFn) && !/GOOGLE_MAPS_SERVER_KEY/.test(peekFn),
  "peekPlaceDetails consults spend/key — it must only read cache");

const idx = code("lib/placeIndex.js");
ok(/return unionIndexedAndAtlasIds\(indexed,\s*listPublishReadyAtlasIds\(\)\)/.test(idx),
  "listIndexedIds no longer CALLs the Atlas union (sitemap would drop the publish-ready Atlas cards)");

// ── 5. editorial / known-for wiring still Atlas-first; JSON stays server-only
const knownFor = code("app/api/known-for/route.js");
ok(/atlasLinesFor/.test(knownFor) && /editorial-cards\.json/.test(read("app/api/known-for/route.js")),
  "known-for lost Atlas cards");
const editorial = code("app/api/editorial/route.js");
ok(/cardToEditorial/.test(editorial) && /editorial-cards\.json/.test(read("app/api/editorial/route.js")),
  "editorial route lost Atlas cards");

ok(!/editorial-cards\.json/.test(code("app/home.js")),
  "app/home.js imported editorial-cards.json — Atlas JSON must stay server-only");
ok(!/atlasPlaceAllowlist/.test(code("app/home.js")),
  "app/home.js imported atlasPlaceAllowlist — that is the homepage-bundle leak");

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    if (f === "node_modules" || f.startsWith(".")) continue;
    const p = join(dir, f);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.jsx?$/.test(f)) out.push(p);
  }
  return out;
}
const clientHits = [];
for (const abs of [...walk(join(root, "app")), ...walk(join(root, "lib"))]) {
  const src = readFileSync(abs, "utf8");
  if (!/^["']use client["']/.test(src.trim())) continue;
  if (/editorial-cards\.json|atlasPlaceAllowlist/.test(src)) clientHits.push(abs.slice(root.length + 1));
}
ok(clientHits.length === 0, `client files imported Atlas JSON / allowlist: ${clientHits.join(", ")}`);

const ingest = code("scripts/ingest-atlas-place-allowlist.mjs");
ok(/planAtlasAllowlistSeed\(/.test(ingest) && /atlasAllowlistApplyGate\(/.test(ingest) && /usableSupabaseEnv\(/.test(ingest),
  "ingest no longer CALLS the fail-closed planner / apply gate / placeholder check");
ok(/wf_inventory/.test(ingest) && /wf_place_ids/.test(ingest),
  "ingest lost the inventory → wf_place_ids path");
ok(!/places\.googleapis|getPlaceDetails|GOOGLE_MAPS_SERVER_KEY/.test(ingest),
  "ingest contacts Places / Place Details");
ok(/FAIL-CLOSED/.test(read("scripts/ingest-atlas-place-allowlist.mjs")),
  "ingest no longer names the fail-closed refusals");

const ident = code("lib/inventoryIdentity.js");
ok(/wf_inventory/.test(ident) && /inventoryToSkeleton/.test(ident),
  "getInventoryIdentity no longer maps a wf_inventory row");
ok(!/places\.googleapis|getPlaceDetails/.test(ident),
  "inventory identity path hits Places");

// Files this change owns must not grow CSS or house-chrome restyles.
for (const rel of [
  "lib/placeData.js", "lib/placeIndex.js", "lib/atlasPlaceAllowlist.js",
  "lib/placeDetails.js", "lib/inventoryIdentity.js", "app/places/[id]/page.js",
  "scripts/ingest-atlas-place-allowlist.mjs",
]) {
  const src = read(rel);
  ok(!/\.css['"]/.test(src) && !/home\.js/.test(src), `${rel} imported CSS or app/home.js`);
}

if (bad) {
  console.error(`\ntest-atlas-place-pages: FAIL — ${bad}/${n} assertions`);
  process.exit(1);
}
console.log(`test-atlas-place-pages: OK — ${n} assertions (${PUBLISH_READY} allowlisted, silent stay blank, zero Google, JSON server-only)`);
