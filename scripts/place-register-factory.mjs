#!/usr/bin/env node
// scripts/place-register-factory.mjs
//
// Cash-register factory: inventory existing place-card names we may attach a
// Book hop to, then verify a Viator product page is still THAT product and
// names the place/city. Does not invent places. Does not write picks.
//
// A cash register = an existing card + an honest placePick whose offerId is a
// wf_experiences product_code. The hop is /api/commerce/go. Never a raw
// viator.com URL in the registry, never searchResults, never a reminted
// click_id, never a rank change.
//
// Usage:
//   node scripts/place-register-factory.mjs inventory
//   node scripts/place-register-factory.mjs verify <url> <placeName> [city]
//   node scripts/place-register-factory.mjs leftover
//
// verify prints JSON: { ok, productCode, destId, finalUrl, title, h1, named }
// and exits 0 only when the live page stayed on that product AND named the
// place or city. A redirect to searchResults / another country / another
// product is a fail.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PLACE_PARTNER_PICKS, placePartnerPick } from "../lib/placePartnerPicks.js";
import { SUMMER_UNIVERSE } from "../lib/summerUniverse.js";
import { BIRTHDAY_UNIVERSE, birthdayEntries } from "../lib/birthdayUniverse.js";
import { CURATED } from "../lib/curated.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const REPO = join(ROOT, "..");
const LEFTOVER_PATH = join(REPO, "docs/PLACE_REGISTER_LEFTOVER.md");

export const norm = (value) => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/&/g, " and ")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

export function existingAliases() {
  const out = [];
  for (const row of PLACE_PARTNER_PICKS) {
    for (const alias of row.aliases) out.push(alias);
  }
  return out;
}

export function loadAtlasNames() {
  const raw = JSON.parse(readFileSync(join(REPO, "data/atlas/editorial-cards.json"), "utf8"));
  const names = [];
  for (const row of raw) {
    if (row && row.name) names.push({ name: String(row.name), source: "atlas", city: row.address || row.area || "" });
  }
  return names;
}

export function loadSummerNames() {
  return SUMMER_UNIVERSE.map((e) => ({
    name: e.venue && e.venue.name,
    source: "summerUniverse",
    city: e.venue && e.venue.city,
    placeId: e.venue && e.venue.placeId,
    key: e.key,
    rank: e.rank,
  })).filter((r) => r.name);
}

export function loadBirthdayNames() {
  // Owner rule: birthday if placeId. Unresolved seeds seed nothing.
  return birthdayEntries()
    .filter((e) => e.venue && e.venue.placeId)
    .map((e) => ({
      name: e.venue.name,
      source: "birthday",
      city: e.venue.city,
      placeId: e.venue.placeId,
      key: e.key,
    }));
}

export function loadCuratedNames() {
  return CURATED.map((e) => ({
    name: e.name,
    source: "curated",
    city: e.area,
  })).filter((r) => r.name);
}

export function inventoryAttachable() {
  const rows = [
    ...loadAtlasNames(),
    ...loadSummerNames(),
    ...loadBirthdayNames(),
    ...loadCuratedNames(),
  ];
  const byNorm = new Map();
  for (const row of rows) {
    const key = norm(row.name);
    if (!key) continue;
    const prior = byNorm.get(key);
    if (prior) {
      if (!prior.sources.includes(row.source)) prior.sources.push(row.source);
      if (row.placeId && !prior.placeId) prior.placeId = row.placeId;
      if (row.city && !prior.city) prior.city = row.city;
    } else {
      byNorm.set(key, {
        name: row.name,
        city: row.city || "",
        placeId: row.placeId || null,
        sources: [row.source],
      });
    }
  }
  const all = [...byNorm.values()].sort((a, b) => a.name.localeCompare(b.name));
  const hooked = [];
  const unmatched = [];
  for (const row of all) {
    const pick = placePartnerPick({ name: row.name });
    if (pick) hooked.push({ ...row, offerId: pick.offerId, provider: pick.provider });
    else unmatched.push(row);
  }
  return {
    hooked,
    unmatched,
    aliasCount: existingAliases().length,
    pickRows: PLACE_PARTNER_PICKS.length,
  };
}

const PRODUCT_CODE_RE = /\/d(\d+)-([A-Za-z0-9]+)/i;
const UA = "Mozilla/5.0 (compatible; WayfindCashRegister/1.0; +https://gowayfind.com)";

function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, " ");
}

function extractTitle(html) {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (og) return decodeEntities(og[1]).replace(/\s+\|\s+Viator.*$/i, "").trim();
  const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return t ? decodeEntities(t[1]).replace(/\s+\|\s+Viator.*$/i, "").trim() : "";
}

function extractH1(html) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return "";
  return decodeEntities(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function parseProductUrl(url) {
  const m = String(url || "").match(PRODUCT_CODE_RE);
  if (!m) return null;
  return { destId: m[1], productCode: m[2] };
}

export function pageNamesPlace(hay, placeName, city) {
  const h = norm(hay);
  const place = norm(placeName);
  if (!h || !place) return false;
  if (h.includes(place)) return "place";
  const tokens = place.split(" ").filter((t) => t.length >= 4);
  const hit = tokens.filter((t) => h.includes(t)).length;
  if (tokens.length >= 2 && hit >= Math.min(2, tokens.length)) return "place-tokens";
  if (city && h.includes(norm(city)) && hit >= 1) return "city+token";
  return false;
}

export async function verifyViatorProduct(url, placeName, city = "") {
  const parsed = parseProductUrl(url);
  const out = {
    ok: false,
    productCode: parsed && parsed.productCode,
    destId: parsed && parsed.destId,
    startUrl: url,
    finalUrl: "",
    status: 0,
    title: "",
    h1: "",
    named: false,
    reason: "",
  };
  if (!parsed) {
    out.reason = "url-is-not-a-product-path";
    return out;
  }
  if (/searchResults/i.test(url)) {
    out.reason = "start-url-is-searchResults";
    return out;
  }
  if (/236862P2/i.test(url)) {
    out.reason = "scallop-HOLD-SKU";
    return out;
  }

  let res;
  try {
    res = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
    });
  } catch (e) {
    out.reason = `fetch-failed:${e && e.message}`;
    return out;
  }
  out.status = res.status;
  out.finalUrl = String(res.url || "");
  if (!res.ok) {
    out.reason = `http-${res.status}`;
    return out;
  }
  if (/searchResults/i.test(out.finalUrl)) {
    out.reason = "redirected-to-searchResults";
    return out;
  }
  const finalParsed = parseProductUrl(out.finalUrl);
  if (!finalParsed) {
    out.reason = "final-url-is-not-a-product-path";
    return out;
  }
  if (finalParsed.productCode !== parsed.productCode) {
    out.reason = `redirected-to-other-product:${finalParsed.productCode}`;
    out.productCode = finalParsed.productCode;
    out.destId = finalParsed.destId;
    return out;
  }
  const html = await res.text();
  if (/<title[^>]*>\s*404/i.test(html) || /there is no such page/i.test(html)) {
    out.reason = "soft-404";
    return out;
  }
  out.title = extractTitle(html);
  out.h1 = extractH1(html);
  const hay = `${out.title} ${out.h1} ${out.finalUrl}`;
  out.named = pageNamesPlace(hay, placeName, city);
  if (!out.named) {
    out.reason = "page-does-not-name-place-or-city";
    return out;
  }
  out.ok = true;
  out.reason = "verified";
  return out;
}

function printInventory(inv) {
  console.log(`place-register-factory inventory`);
  console.log(`  pick rows: ${inv.pickRows}`);
  console.log(`  aliases:   ${inv.aliasCount}`);
  console.log(`  hooked:    ${inv.hooked.length}`);
  console.log(`  unmatched: ${inv.unmatched.length}`);
  console.log("");
  console.log("UNMATCHED (exact name has no placePartnerPick):");
  for (const row of inv.unmatched) {
    const src = row.sources.join("+");
    const city = row.city ? ` @ ${String(row.city).slice(0, 40)}` : "";
    console.log(`  - ${row.name}${city}  [${src}]`);
  }
}

// Exact-name skip reasons recorded this run. Empty stays empty. Do not invent
// a hop to clear a row. Restaurants / hotels / retail default to the generic
// leftover line unless listed here.
export const NOTABLE_SKIPS = [
  { name: "Canoe Outpost-Little Manatee River", why: "prior audit: no partner inventory (Viator/Tiqets/TicketNetwork miss)" },
  { name: "Mote Science Education Aquarium (SEA)", why: "prior audit: no partner inventory" },
  { name: "Mote Marine Laboratory", why: "prior audit: no partner inventory" },
  { name: "The Bishop Museum of Science and Nature", why: "prior audit: no partner inventory" },
  { name: "Sarasota Jungle Gardens", why: "prior audit: no partner inventory" },
  { name: "The Ernest Hemingway Home and Museum", why: "tickets at the gate only; no bookable partner product" },
  { name: "Yacht StarShip Cruises & Events", why: "Viator lists StarLite Majesty, wrong operator" },
  { name: "Ichetucknee Springs State Park", why: "no honest admission or tube product on Viator" },
  { name: "Edward Ball Wakulla Springs State Park", why: "no honest glass-bottom / admission product" },
  { name: "Marie Selby Botanical Gardens Downtown Sarasota", why: "no honest admission product" },
  { name: "Marie Selby Botanical Gardens", why: "no honest admission product" },
  { name: "Sunken Gardens", why: "only appears inside a Segway city tour — Ringling-trolley class" },
  { name: "Key West Historic Seaport", why: "snorkel titles do not name the seaport; #843 2642P8 not independently confirmed" },
  { name: "Lido Key Beach", why: "mangrove kayaks do not name this beach card; Lido Beach (not Lido Key Beach) is the exact pinned name" },
  { name: "Clearwater Beach", why: "no exact Atlas/summer/curated card named Clearwater Beach — owner sunset SKU pinned on Pier 60 only" },
  { name: "Mallory Square", why: "free public square; cocktail walk / trolley / schooner pass-by would sell the wrong thing" },
  { name: "Florida Caverns State Park", why: "nearby kayak paddles past the park; not cavern admission" },
  { name: "Devil's Den Spring", why: "only Gettysburg Devil's Den products; no Williston snorkel SKU" },
  { name: "Fairchild Tropical Botanic Garden", why: "no admission product on Viator" },
  { name: "Loggerhead Marinelife Center", why: "no admission product on Viator" },
  { name: "Fruit & Spice Park", why: "no Homestead product; spice-farm hits are Zanzibar" },
  { name: "Ginnie Springs Outdoors", why: "no Ginnie product; nearby SKUs are Gilchrist Blue" },
  { name: "Homosassa Springs Marina", why: "scallop HOLD-SKU 236862P2 is forbidden; other Homosassa SKUs are not this marina" },
  { name: "The Ringling", why: "prior audit: trolley only, not admission" },
  { name: "LeBarge Tropical Cruises", why: "no product names this operator" },
  { name: "Weedon Island Preserve", why: "St Pete mangrove kayak body mentions the preserve but H1/title do not" },
  { name: "Disney's Typhoon Lagoon Water Park", why: "UT Magic Kingdom row aliases do not include water parks — do not steal that hop" },
  { name: "Disney's Blizzard Beach Water Park", why: "UT Magic Kingdom row aliases do not include water parks — do not steal that hop" },
  { name: "Kelly Park - Rock Springs", why: "kayak SKU H1 names Rock Springs but launch is Kings Landing — do-not-enter-the-park class, same as the Blue Spring kayaks we refused" },
  { name: "Venice Beach", why: "canal kayak meets at South Venice Beach Ferry; H1 does not name the Venice Beach card" },
  { name: "Scenic Boat Tour", why: "Winter Park walking/boat SKUs meet nearby but H1 does not name Scenic Boat Tour" },
  { name: "Canopy Walk", why: "Myakka e-bike is already pinned on Myakka River State Park; H1 does not name Canopy Walk" },
  { name: "St. Armands Circle", why: "trolley/segway/e-bike pass-by — Ringling-trolley class, not a Circle product" },
  { name: "Ca' d’Zan", why: "only appears on Ringling-grounds trolley/segway — not mansion admission" },
  { name: "N Skyway Fishing Pier State Park", why: "The Skyway Tour is an e-bike city tour, not pier fishing at this park" },
  { name: "Big Cat Habitat & Gulf Coast Sanctuary", why: "Tampa Big Cat Rescue SKUs are a different sanctuary — do not alias-steal" },
  { name: "Bayfront Park", why: "The Bay Park kayak H1 names The Bay Park only; Bayfront Park is a different Sarasota card" },
  { name: "Florida Railroad Museum", why: "no product H1 names this museum; nearby hits are Tampa/Sarasota city trolleys" },
  { name: "Historic Spanish Point", why: "no product H1 names this site; Osprey hits are St. Augustine Osprey boat or trolley meet points" },
  { name: "Oscar Scherer State Park", why: "Sarasota kayak SKUs launch at Ted Sperling / Turtle Beach / Lido, not this park" },
  { name: "De Soto National Memorial", why: "Viator Fort De Soto / Egmont SKUs are a different park already pinned; no Bradenton memorial product" },
  { name: "Ray's Canoe Hideaway", why: "no Viator product names this outfitter; Bradenton kayaks are Robinson Preserve (already pinned)" },
  { name: "Smugglers Cove Adventure Golf", why: "Viator Smugglers Cove hits are Alaska/BVI/Fiji — wrong country" },
  { name: "Lithia Springs Park", why: "no Lithia, FL product; kayak hits are Shell Key (already pinned) or Oregon Lithia Park" },
  { name: "Hunter Springs Park", why: "Crystal River kayaks name Three Sisters / Crystal River and already pin Three Sisters; H1 does not name Hunter Springs" },
  { name: "Marina Jack", why: "no product H1 names this marina/operator" },
  { name: "Perico Preserve", why: "nearby AMI mangrove kayak 25427P2 meets at the Manatee Ave ramp; H1 names Anna Maria, not Perico" },
  { name: "Neal Preserve", why: "25427P2 body says just down the street from Neal; H1 names Anna Maria — Kings Landing class" },
  { name: "Sarasota Art Museum", why: "only art-crawl trolley, not museum admission" },
  { name: "Beer Can Island", why: "only appears in the body of Coquina Beach SKU 454941P3 already pinned — do not steal that hop" },
  { name: "Emerson Point Preserve", why: "no product H1 names this preserve" },
  { name: "TreeUmph! Adventure Course", why: "22211P1 live H1 is 'Sorry, this product is unavailable' — empty-slot, do not pin similar-experiences rail SKUs" },
];

export function leftoverMarkdown(inv, skipped = NOTABLE_SKIPS) {
  const skipBy = new Map(skipped.map((s) => [norm(s.name), s.why]));
  const notable = skipped.filter((s) => inv.unmatched.some((r) => norm(r.name) === norm(s.name)));
  const lines = [
    "# Place-register leftover",
    "",
    "Names that exist on a Wayfind card (Atlas / summer / birthday-with-placeId / curated)",
    "and still have **no** `placePartnerPick`. Empty stays empty until a live partner",
    "page names that place. Do not invent a product to fill this list.",
    "",
    `Generated by \`scripts/place-register-factory.mjs\`. Hooked: ${inv.hooked.length}. Unmatched: ${inv.unmatched.length}.`,
    "",
    "## Notable skips this batch",
    "",
    "These were looked at and left empty on purpose.",
    "",
    "| Place name | Why empty |",
    "|---|---|",
  ];
  for (const row of notable) {
    lines.push(`| ${row.name} | ${row.why} |`);
  }
  lines.push("");
  lines.push("## Full unmatched inventory");
  lines.push("");
  lines.push("| Place name | Sources | City | Why empty |");
  lines.push("|---|---|---|---|");
  for (const row of inv.unmatched) {
    const why = skipBy.get(norm(row.name)) || "no honest verified product in this batch";
    const city = String(row.city || "").replace(/\|/g, "/").slice(0, 60);
    lines.push(`| ${row.name} | ${row.sources.join(", ")} | ${city} | ${why} |`);
  }
  lines.push("");
  return lines.join("\n");
}

const cmd = process.argv[2];
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] && process.argv[1].endsWith("place-register-factory.mjs")) {
  if (cmd === "inventory") {
    printInventory(inventoryAttachable());
  } else if (cmd === "leftover") {
    const inv = inventoryAttachable();
    writeFileSync(LEFTOVER_PATH, leftoverMarkdown(inv));
    console.log(`wrote ${LEFTOVER_PATH} (${inv.unmatched.length} unmatched)`);
  } else if (cmd === "verify") {
    const url = process.argv[3];
    const place = process.argv[4];
    const city = process.argv[5] || "";
    if (!url || !place) {
      console.error("usage: node scripts/place-register-factory.mjs verify <url> <placeName> [city]");
      process.exit(2);
    }
    const result = await verifyViatorProduct(url, place, city);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  } else if (cmd) {
    console.error("usage: inventory | leftover | verify <url> <placeName> [city]");
    process.exit(2);
  }
}
