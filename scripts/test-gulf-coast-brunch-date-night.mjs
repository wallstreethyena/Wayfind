#!/usr/bin/env node
/**
 * test-gulf-coast-brunch-date-night — the Gulf Coast brunch + date-night
 * guide is a TWO-JOB decision, not a directory, and it may only name places
 * that already have Atlas food cards.
 *
 * WHY. A thin listicle of the 86 food cards would teach the reader that
 * Wayfind is a directory. The product rule is one confident rec per job
 * (brunch vs date-night dinner), then a short rail of alternatives that
 * already have cards. No new editorial-cards.json rows. No invented
 * St. Armands names. No Tampa / Winter Park food chapter. The Crystal
 * River manatee guide stays locked. The existing St. Armands Circle
 * guide stays.
 *
 * Assert on the CALL, not the string: helpers return the violation list,
 * then we drive them with the live guide AND with sabotaged copies so a
 * mutation that never applied cannot look like a pass.
 */
import { readFileSync } from "node:fs";
import { GUIDES } from "../lib/guides.js";
import { guideIntent, guidePrimaryCta, guideContinue } from "../lib/guideCta.js";

const SLUG = "gulf-coast-brunch-and-date-night";
const ARMANDS = "st-armands-circle-restaurants";
const MANATEE = "swim-with-manatees-crystal-river";
const MANATEE_TEASER =
  "You reach the springs only by water, and the manatees crowd in when the Gulf turns cold, not in the warm summer.";

const cards = JSON.parse(
  readFileSync(new URL("../data/atlas/editorial-cards.json", import.meta.url), "utf8"),
);
const foodById = new Map();
for (const c of cards) {
  if (c && c.category === "food" && c.placeId) foodById.set(c.placeId, c);
}

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const INVENTED_CIRCLE = [
  "Café L'Europe", "Cafe L'Europe", "Crab & Fin", "Blue Dolphin", "Kilwins",
];
const OFF_COAST_FOOD = [
  "Bern's Steak House", "Armature Works", "Columbia Restaurant Ybor",
];

function guideBody(g) {
  return [
    g.title || "", g.description || "", g.intro || "", g.teaser || "",
    ...(g.picks || []).flatMap((p) => [p.name || "", p.blurb || "", p.tip || ""]),
    ...(g.faq || []).flatMap((f) => [f.q || "", f.a || ""]),
  ].join("\n");
}

/** Picks whose name/placeId do not resolve to the same Atlas food card. */
function uncardedPicks(picks) {
  const bad = [];
  for (const p of picks || []) {
    if (!p || !p.placeId) { bad.push(`${p && p.name}: missing placeId`); continue; }
    const card = foodById.get(p.placeId);
    if (!card) { bad.push(`${p.name}: placeId not a food card`); continue; }
    if (card.name !== p.name) bad.push(`${p.name}: card is "${card.name}"`);
  }
  return bad;
}

function inventedCircleNames(text) {
  return INVENTED_CIRCLE.filter((n) => text.includes(n));
}

function offCoastFoodMentions(text) {
  return OFF_COAST_FOOD.filter((n) => text.includes(n));
}

function chainIsTheRec(picks) {
  return (picks || []).slice(0, 2).some((p) => /first watch|keke's/i.test(p && p.name || ""));
}

// ── live guide ────────────────────────────────────────────────────────────
const g = GUIDES[SLUG];
ok(!!g, `${SLUG} is registered in GUIDES`);
ok(GUIDES[ARMANDS], `${ARMANDS} still exists — this guide does not replace it`);
ok((GUIDES[ARMANDS].picks || []).length === 6, `${ARMANDS} still delivers six picks`);
ok((GUIDES[ARMANDS].picks || [])[0].name === "Columbia Restaurant",
  `${ARMANDS} still leads with Columbia`);
ok(GUIDES[MANATEE] && GUIDES[MANATEE].teaser === MANATEE_TEASER,
  `${MANATEE} teaser is unchanged`);
ok(GUIDES[MANATEE].title.includes("Swim With Manatees"),
  `${MANATEE} title is unchanged`);

ok(g && g.region === "Sarasota", "region is Sarasota so the hub actually lists it");
ok(g && g.cluster === "gulf-coast-food", "cluster wires it to the Circle guide");
ok(GUIDES[ARMANDS].cluster === "gulf-coast-food",
  "the Circle guide shares the cluster so continue stays on-theme");
ok(g && !/^\d{1,2}\s/.test(g.title || ""), "title is not a numbered directory promise");
ok(guideIntent(g) === "restaurant",
  `intent is restaurant (got ${guideIntent(g)}) — Directions, not a invented tour CTA`);

const picks = (g && g.picks) || [];
ok(picks.length === 6, `six picks: two jobs + a short rail (got ${picks.length})`);
ok(picks.length <= 8, "the rail stayed short — this is not the 86-card dump");
ok(picks[0] && picks[0].name === "Original Word of Mouth",
  "the brunch rec is Original Word of Mouth");
ok(picks[1] && picks[1].name === "Ophelia's on the Bay",
  "the date-night rec is Ophelia's on the Bay");
ok(!picks.some((p) => /first watch/i.test(p.name)),
  "First Watch may exist as a card; it is not a pick");
ok(!chainIsTheRec(picks), "neither job rec is a breakfast chain");

const missing = uncardedPicks(picks);
ok(missing.length === 0, `every pick is an existing Atlas food card (${missing.join("; ") || "ok"})`);
ok(picks.every((p) => p.indoor === true), "every pick is indoor — these are dining rooms");
ok(picks.every((p) => p.appQuery), "every pick maps into the app");
ok(picks.every((p) => !p.bookQuery && !p.viatorUrl && !p.hotel),
  "no invented tour/hotel commerce on a restaurant job guide");

const body = g ? guideBody(g) : "";
ok(inventedCircleNames(body).length === 0,
  `no invented Circle names (${inventedCircleNames(body).join(", ") || "none"})`);
ok(offCoastFoodMentions(body).length === 0,
  `no Tampa / Winter Park food chapter (${offCoastFoodMentions(body).join(", ") || "none"})`);
ok(/Ranking is never for sale/.test(body), "ranking-not-for-sale is stated in the body");
ok(/St\. Armands Circle restaurants/.test(body) || /Circle keeps its own guide/.test(body),
  "the existing Circle guide is acknowledged, not replaced");

const cta = guidePrimaryCta(g, "2026-08-19");
ok(cta.kind === "directions", `primary CTA is Directions (got ${cta.kind})`);
ok(cta.monetized === false && cta.sponsored === false,
  "Directions stays non-monetized — no fake affiliate when there is no deal");
ok(cta.place === "Original Word of Mouth",
  "Directions names the brunch standout, not a heading");

const next = guideContinue(g, SLUG, GUIDES);
ok(next && next.slug !== SLUG, "continue card points at a different guide");
ok(next && GUIDES[next.slug] && GUIDES[next.slug].region === "Sarasota",
  `continue stays in Sarasota (got ${next && next.slug})`);
for (const p of picks) {
  const card = foodById.get(p.placeId);
  ok(card && !/tampa|winter park/i.test(card.address || ""),
    `${p.name} is not a Tampa / Winter Park food card`);
}

// ── red-prove the helpers. A check that cannot fail is worse than none. ──
ok(uncardedPicks([{ name: "Original Word of Mouth", placeId: "ChIJSZyKtGVaw4gRkKUbiPqvOVI" }]).length === 0,
  "PROBE: a real Venice breakfast card is accepted");
ok(uncardedPicks([{ name: "Café L'Europe", placeId: "ChIJnotarealplaceidxxxxx000" }]).length > 0,
  "PROBE BROKEN: an invented Circle name with a fake id must fail uncardedPicks");
ok(uncardedPicks([{ name: "Original Word of Mouth", placeId: "ChIJaTQEjpFqw4gRnHJU2Klfw0o" }]).length > 0,
  "PROBE BROKEN: the Word of Mouth name on Columbia's id must fail — role, not substring");
ok(inventedCircleNames("Columbia Restaurant on the Circle").length === 0,
  "PROBE: honest Circle copy without invented names is clean");
ok(inventedCircleNames("Try Café L'Europe after the beach").includes("Café L'Europe"),
  "PROBE BROKEN: Café L'Europe in the new guide text must be caught");
ok(offCoastFoodMentions(body + " Bern's Steak House").includes("Bern's Steak House"),
  "PROBE BROKEN: a Tampa food name slipped into the body must be caught");
ok(chainIsTheRec([{ name: "First Watch" }, { name: "Ophelia's on the Bay" }]) === true,
  "PROBE BROKEN: First Watch as the brunch rec must be caught");
ok(chainIsTheRec(picks) === false, "PROBE: the live recs still fail the chain-as-rec check");

// Positive control on the card file itself — an empty food map would make
// every pick look missing, or every pick look fine, depending on the bug.
ok(foodById.size >= 80, `food card map is populated (got ${foodById.size})`);
ok(foodById.get("ChIJSZyKtGVaw4gRkKUbiPqvOVI")?.name === "Original Word of Mouth",
  "positive control: Venice Word of Mouth card is present");
ok(foodById.get("ChIJs8HMPKxDw4gR8rXHdqdvpmE")?.name === "Ophelia's on the Bay",
  "positive control: Ophelia's card is present");
ok(!cards.some((c) => c.category === "food" && /tampa|winter park/i.test(c.address || "")),
  "yardstick check: there are still no Tampa / Winter Park food cards to invent a chapter from");

if (fail.length) {
  console.error("test-gulf-coast-brunch-date-night: FAIL");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`test-gulf-coast-brunch-date-night: OK — ${pass} assertions (two jobs, Atlas cards only, Circle + manatee guides untouched, helpers red-proved)`);
