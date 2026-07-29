// scripts/test-editorial-rollout.mjs — locks the Orlando editorial rollout:
// the Gift Shops subcategory, the rollout ORDER, the §7 fetch gate on the
// generation job, and the rule that a card never shows a raw Google type.
//
// WHY EACH OF THESE EXISTS (all four were live defects on 2026-07-29, not
// hypotheticals):
//
//   1. atlas-build's CATS was ["attractions","nightlife","hotels","food"].
//      `shopping` was absent, so Shopping was never eligible for generation —
//      which is exactly why it sat at 13.5% coverage against attractions' 68.3%.
//      And `food` was LAST despite being the biggest, least-covered category
//      (243 places, 21.8%). The job ran the rollout backwards.
//
//   2. Gift Shops was removed in v4.97 as an "inherently junk-generating text
//      query". Re-adding it as a text query would repeat that exactly. The
//      contract must be on structured TYPES.
//
//   3. Adding `shopping` to CATS put World of Disney, The Art of Disney,
//      DisneyStyle, Creations Shop, Disney's Character Warehouse and the Cirque
//      du Soleil Store into the generator's work queue. officialPage() fetched
//      whatever websiteUri Places returned — i.e. disney.go.com. A config change
//      that never mentioned Disney would have broken AGENTS.md §7.
//
//   4. The editorial fallback chain is TWO different chains, not one, and a
//      coverage check that only knows the IntentPageClient shape reports
//      Things-to-do as covered when it is really showing a rank reason.
import { readFileSync } from "fs";
import { placeAllowed, SUB_ALLOW } from "../lib/placeFilter.js";
import { isDeniedHost, hostOfUrl } from "../lib/nightlifeRail.js";
// lib/google.js is read as SOURCE, not imported: it uses Next's extensionless
// resolution (`../lib/businessStatus`) which plain node cannot resolve. Reading
// the text also means this guard asserts what ships, not what a bundler produces.

let pass = 0;
const fail = (m) => { console.error("test-editorial-rollout: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

// ── 1. rollout order ──────────────────────────────────────────────────────
{
  const src = read("app/api/cron/atlas-build/route.js");
  const m = src.match(/const CATS = \[([^\]]+)\]/);
  ok(!!m, "atlas-build declares CATS");
  const cats = m[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  ok(cats.includes("shopping"), "shopping IS in the rollout — it was absent, which is why it sat at 13.5%");
  ok(cats[0] === "food", `food runs FIRST (got "${cats[0]}") — largest category, lowest coverage`);
  ok(cats[cats.length - 1] === "shopping", `shopping runs LAST (got "${cats[cats.length - 1]}")`);
  ok(cats.length === 5, `all five categories are scheduled (got ${cats.length}: ${cats.join(",")})`);
  // The route works CATS front-to-back, so the array IS the schedule. Prove the
  // order is the owner's, not merely that the members are present.
  ok(JSON.stringify(cats) === JSON.stringify(["food", "attractions", "nightlife", "hotels", "shopping"]),
    `the schedule is exactly food->attractions->nightlife->hotels->shopping (got ${cats.join("->")})`);
}

// ── 2. Gift Shops is a TYPES contract, not a text query ───────────────────
{
  const gsrc = read("lib/google.js");
  const block = gsrc.match(/\n  shopping: \[([\s\S]*?)\n  \],/);
  ok(!!block, "SUBFILTERS.shopping exists in lib/google.js");
  const subs = [...block[1].matchAll(/\{ id: "([^"]+)", label: "([^"]+)", query: "([^"]+)" \}/g)]
    .map((m) => ({ id: m[1], label: m[2], query: m[3] }));
  ok(subs.length >= 6, `shopping has its original subs plus the new one (got ${subs.length})`);
  const gs = subs.find((s) => s.id === "giftshops");
  ok(!!gs, "Shopping has a giftshops sub-filter");
  ok(gs.label === "Gift Shops", `it is labelled "Gift Shops" (got "${gs && gs.label}")`);
  // Same shape as its siblings: this is a new ENTRY in an existing pattern, so
  // queryFor(), the chip renderer and the URL dispatcher all reach it unchanged.
  for (const s of subs) ok(s.id && s.label && s.query, `shopping sub "${s.id}" has the standard {id,label,query} shape`);
  ok(subs[0].id === "all", "the All chip is still first");
  for (const keep of ["malls", "boutiques", "markets", "outlets"])
    ok(subs.some((s) => s.id === keep), `the existing "${keep}" sub is untouched`);

  const contract = SUB_ALLOW["shopping:giftshops"];
  ok(!!contract, "shopping:giftshops has a relevance contract");
  // The v4.97 failure was a NAME match. SUB_ALLOW is tested against types only,
  // so prove the contract cannot be satisfied by a name alone.
  ok(!placeAllowed("shopping", "giftshops", { name: "The Gift Shop", types: ["clothing_store", "store", "establishment"] }),
    "a place NAMED 'The Gift Shop' with no gift_shop TYPE is rejected — this is the v4.97 bug, and it must stay dead");
  ok(!placeAllowed("shopping", "giftshops", { name: "Souvenir City Gifts & Novelties", types: ["store", "establishment"] }),
    "no amount of gift wording in the name admits a place");
  ok(contract.test("gift_shop"), "the contract matches the gift_shop TYPE");
}

// ── 3. real inventory rows, both sides ────────────────────────────────────
// Verbatim google_types from wf_inventory, Orlando, 2026-07-29.
const GIFT_FIXTURES = [
  ["Good Crowd",                    ["gift_shop", "store", "point_of_interest", "establishment"], true],
  ["World of Disney",               ["gift_shop", "store", "point_of_interest", "establishment"], true],
  ["Treasure Island Gift Shop",     ["gift_shop", "store", "point_of_interest", "establishment"], true],
  ["The House on Lang",             ["gift_shop", "womens_clothing_store", "home_goods_store", "event_venue", "clothing_store", "store", "point_of_interest", "establishment"], true],
  ["Disney's Character Warehouse",  ["toy_store", "gift_shop", "clothing_store", "store", "point_of_interest", "establishment"], true],
  ["Marketplace Co-Op",             ["shopping_mall", "gift_shop", "store", "point_of_interest", "establishment"], true],
  // ...and the ones that must NOT appear.
  ["Sweety Cafe",                   ["cafe", "ramen_restaurant", "gift_shop", "coffee_shop", "bakery", "japanese_restaurant", "restaurant", "store", "point_of_interest", "food", "establishment"], false],
  ["Publix Super Market",           ["grocery_store", "supermarket", "store", "food", "point_of_interest", "establishment"], false],
  ["Orlando Premium Outlets",       ["shopping_mall", "outlet_mall", "store", "point_of_interest", "establishment"], false],
];
for (const [name, types, expect] of GIFT_FIXTURES) {
  ok(placeAllowed("shopping", "giftshops", { name, types }) === expect,
    `${name}: ${expect ? "ADMITTED" : "rejected"} by shopping:giftshops`);
}
ok(GIFT_FIXTURES.some(([, , e]) => e), "the fixture table has admitted rows");
ok(GIFT_FIXTURES.some(([, , e]) => !e), "the fixture table has rejected rows");
// Sweety Cafe carries gift_shop and is still out — the cross-veto is doing that,
// not the type contract. Name the mechanism so a refactor cannot quietly drop it.
ok(!placeAllowed("shopping", "giftshops", { name: "Sweety Cafe", types: ["cafe", "gift_shop", "restaurant", "food", "store"] }),
  "a CAFE that also carries gift_shop stays out — a gift counter is not a gift shop");

// ── 4. §7: the generation job may not fetch or cite a Disney host ─────────
{
  const src = read("app/api/cron/atlas-build/route.js");
  const fetchGate = src.indexOf("isDeniedHost(hostOfUrl(url))");
  ok(fetchGate > 0, "officialPage() gates on isDeniedHost BEFORE fetching");
  const fetchCall = src.indexOf("await fetch(url", fetchGate > 0 ? 0 : undefined);
  ok(fetchCall > fetchGate, "the gate sits ABOVE the fetch — position, not just presence");
  ok(/allowed[\s\S]{0,220}isDeniedHost/.test(src),
    "the verifier's allowed-source list is filtered too — a card must not CITE a page we may not read");

  // The rule itself, exercised on the hosts this rollout actually puts in queue.
  for (const u of [
    "https://disneyworld.disney.go.com/shops/disney-springs/world-of-disney/",
    "https://www.shopdisney.com/",
    "https://disneysprings.com/shopping/",
    "https://anything.disney.com/x",
    "https://disneyparks-reservations.net/",     // not a listed property: caught by the token rule
  ]) ok(isDeniedHost(hostOfUrl(u)), `§7 denies ${hostOfUrl(u)}`);
  // ...and does NOT deny an ordinary venue site, or the gate is just an outage.
  for (const u of [
    "https://www.goodcrowdshop.com/",
    "https://www.premiumoutlets.com/outlet/orlando-international",
    "https://maps.google.com/?cid=123",
  ]) ok(!isDeniedHost(hostOfUrl(u)), `§7 permits ${hostOfUrl(u)} — the gate is targeted, not a blanket`);
}

// ── 5. the operational gate runs BEFORE generation ────────────────────────
// wf_atlas_missing is what feeds the generator. It had no status predicate; the
// inventory merely happened to be clean. A rule enforced by luck is not enforced.
{
  const mig = read("supabase/migrations/20260729_wf_atlas_missing_operational_gate.sql");
  ok(/i\.status\s*=\s*'OPERATIONAL'/.test(mig),
    "the RPC filters on status = 'OPERATIONAL' — the gate is in the selector, not in the caller");
  ok(/left join public\.wf_editorial/.test(mig), "it still only returns rows WITHOUT editorial (idempotent)");
  ok(/wf_atlas_missing/.test(mig), "the migration targets the function the cron actually calls");
}

// ── 6. a card never renders a raw Google type ─────────────────────────────
// The chain is NOT one chain. IntentPageClient is (hook || ai_line || null);
// ThingsToDoList is (hook ? hook : (rankReason || blurb)). A coverage or
// rendering check that knows only the first shape reports the second as covered.
{
  const intent = read("app/components/IntentPageClient.js");
  ok(/editorial=\{r\.editorial_hook \|\| r\.ai_line \|\| null\}/.test(intent),
    "IntentPageClient: hook -> ai_line -> null, and the tail is NULL (an honest absence, never a type string)");
  ok(!/editorial=\{[^}]*r\.type[^}]*\}/.test(intent),
    "IntentPageClient never falls back to r.type as editorial copy");
  ok(!/editorial=\{[^}]*primaryType[^}]*\}/.test(intent),
    "IntentPageClient never falls back to primaryType as editorial copy");

  const ttd = read("app/components/ThingsToDoList.js");
  ok(/r\.editorial_hook \?/.test(ttd), "ThingsToDoList leads with the verified hook");
  ok(/rankReason\(r, rank\) \|\| blurb/.test(ttd),
    "ThingsToDoList's second chain is (rankReason || blurb) — DIFFERENT from IntentPageClient, and coverage must count it as such");
  ok(/: null\}/.test(ttd), "ThingsToDoList ends in null, not in a type string");
  ok(!/\{r\.type\}/.test(ttd), "ThingsToDoList never prints the raw Google type as the editorial line");
}

console.log(`test-editorial-rollout: OK — ${pass} assertions (rollout order, gift shops on TYPES not names, §7 fetch+cite gate, operational gate in the RPC, two render chains)`);
