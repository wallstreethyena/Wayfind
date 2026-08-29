#!/usr/bin/env node
// scripts/check-known-for-tiers.mjs — WHY THE CARDS WERE SILENT, AND WHAT MAY
// FILL THE SILENCE.
//
// v8.89 (owner, 2026-08-29): "I want to identify why do we have silent cards.
// We should audit to figure out why we have silent cards and what would be the
// most effective way to bring those silent cards to the website in a way that
// will add value."
//
// THE AUDIT, measured against live data on the day this shipped:
//
//   wf_inventory                                     12,790 rows
//   wf_editorial, verified AND carrying a hook           548  <- all the card
//                                                              resolver could
//                                                              ever serve
//   wf_inventory.editorial                             2,510
//   places with an inventory line and NO verified hook  2,253
//
//   Narrowed to rows that actually reach a rail (>=100 reviews, >=4.3 rating):
//
//     category      qualifying   speaks today   would speak   still silent
//     food               4,637      304 (6.6%)        +885          3,448
//     attractions        2,606       21 (0.8%)        +507          2,078
//     nightlife          1,273       32 (2.5%)        +147          1,094
//     shopping             435       25               +157            253
//     hotels               187       35               +111             41
//     beach                 63       24                +17             22
//     ───────────────────────────────────────────────────────────────────────
//     TOTAL              9,201      441 (4.8%)      +1,824   -> 5.1x coverage
//
// So the answer is NOT "nobody wrote the copy". Two thirds of the copy we hold
// sat in a table the resolver never asked. Attractions is the sharpest case:
// 21 of 2,606 cards could speak while 507 lines were one query away.
//
// AND THE RULE THAT MAKES IT SAFE. The new lines are DESCRIPTIVE, not
// editorial — "Laid-back spot offering grouper, jumbo shrimp, lobsters & other
// seafood, plus a salad bar & market". That is a true, useful answer to the
// question this route's own name asks. It is not a Wayfind verdict, so:
//
//   · it is the LOWEST rung. Atlas wins, then the verified fleet card, then
//     this. A researched line is never displaced by a descriptive one.
//   · it renders WITHOUT the accent bar. That bar is how Wayfind says "this is
//     our read", and it belongs to copy Wayfind wrote or verified.
//
// This guard locks both halves. The precedence and the plumbing are scoped
// source checks on an API route and a client hook that node cannot execute,
// and they say so; the visual distinction is EXECUTED against the real shipped
// stylesheet, because "the two tiers look different" is a fact about CSS and
// can be measured rather than asserted.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

// ── 1. THE ROUTE ASKS THE TABLE THAT HOLDS THE COPY ─────────────────────────
{
  const route = strip(readFileSync(join(ROOT, "app/api/known-for/route.js"), "utf8"));
  ok(/wf_inventory\?select=place_id,editorial/.test(route),
    "weaker check (source): /api/known-for reads wf_inventory.editorial — the table 2,253 unreachable lines were sitting in (this route is a server handler node cannot invoke here)");
  ok(/editorial=not\.is\.null/.test(route),
    "…and asks only for rows that HAVE one, rather than fetching the table and filtering in memory");

  // PRECEDENCE, which is the whole safety property. `{ ...inv, ...researched }`
  // spreads the descriptive tier FIRST so a researched line overwrites it.
  // Reversed, every Atlas card in the product would be silently replaced by a
  // Google summary — the exact opposite of what this change is for.
  ok(/lines:\s*\{\s*\.\.\.inv,\s*\.\.\.researched\s*\}/.test(route),
    "the researched line WINS: inv is spread first so Atlas and the verified fleet card overwrite it, never the reverse");
  ok(/const stillSilent = need\.filter\(\(id\) => !researched\[id\]\)/.test(route),
    "…and the inventory lookup is only asked about ids nothing researched answered — a card we have real copy for never costs a second query");

  // A fragment is not a line.
  ok(/line\.length >= 24/.test(route),
    "a too-short inventory value is refused — a card is better silent than half-spoken");

  // The tier has to leave the route or nothing downstream can tell them apart.
  ok(/tiers\[id\] = "wayfind"/.test(route) && /tiers\[id\] = "known"/.test(route),
    "the route labels each line with the rung it came from");
  ok(/return Response\.json\(\{[\s\S]{0,200}tiers,/.test(route),
    "…and returns those labels to the caller");
}

// ── 2. THE HOOK CARRIES IT WITHOUT CHANGING SHAPE ───────────────────────────
{
  const hook = strip(readFileSync(join(ROOT, "app/components/useEditorialHooks.js"), "utf8"));
  ok(/Object\.defineProperty\(hooks, "tiers", \{ value: tiers, enumerable: false/.test(hook),
    "weaker check (source): the tiers ride on a NON-ENUMERABLE property, so `hooks[id]` and Object.keys(hooks) are byte-identical for the six surfaces that do not care");
  ok(/nextTier\[id\] = "known"/.test(hook),
    "the validated pool summary is tiered as descriptive too — it is a generated line, not a Wayfind read, and treating it as one would be the same error in a second place");
}

// ── 3. THE CARD DRAWS THE DIFFERENCE ────────────────────────────────────────
{
  const card = strip(readFileSync(join(ROOT, "app/components/IconicPlaceCard.js"), "utf8"));
  ok(/editorialTier = "wayfind"/.test(card),
    "IconicPlaceCard accepts the tier and DEFAULTS to wayfind — every existing caller keeps today's rendering exactly");
  ok(/editorialTier === "known" \? " is-known-for" : ""/.test(card),
    "…and only the descriptive tier gets the quieter class");

  const rail = strip(readFileSync(join(ROOT, "app/components/DaypartRail.js"), "utf8"));
  ok(/editorialTier=\{/.test(rail) && /hooks\.tiers && hooks\.tiers\[p\.id\]/.test(rail),
    "the rail drop passes the resolver's tier through");
  ok(/\(isPaid \|\| selected === "chef" \|\| selected === "augtober"\)\s*\?\s*"wayfind"/.test(rail),
    "…while the paid card, Ron's list and the fall pool keep the accent bar — those lines ARE ours (the registry's railTake, a Top Chef's own words, wf_events.card_hook)");
}

// ── 4. THE TREATMENTS REALLY DIFFER — EXECUTED ──────────────────────────────
// The three checks above prove the class is applied. This proves it MEANS
// something: a class that resolved to the same paint would be a distinction
// only the source code could see.
{
  const { WF_PLACE_CARD_CSS } = await loadComponent(join(ROOT, "app/components/css.js"), ROOT);
  const rule = WF_PLACE_CARD_CSS.match(/\.wf-place-card-take\.is-known-for\{([^}]*)\}/);
  ok(!!rule, "positive control: the is-known-for rule is in the SHIPPED stylesheet (not merely in the file's comments)");
  const body = rule ? rule[1] : "";
  ok(/border-left-color:/.test(body),
    "the descriptive tier restates the accent bar's colour — the bar is Wayfind's signature and this line did not earn it");
  ok(!/rgba\(249,115,22/.test(body),
    "…and not to the orange accent, which would make the distinction invisible");
  ok(/color:/.test(body),
    "…and steps the text back a shade too, so the difference survives on a card where the bar is clipped");
  // The base rule must still carry the accent bar, or "quieter" is quieter
  // than nothing.
  const base = WF_PLACE_CARD_CSS.match(/\.wf-place-card-take\{([^}]*)\}/);
  ok(!!base && /border-left:2px solid rgba\(249,115,22/.test(base[1]),
    "positive control: the WAYFIND tier still wears the orange accent bar (if this ever goes, the two tiers are identical and this file is asserting nothing)");
}

console.log(`\ncheck-known-for-tiers: ${fail ? "FAIL" : "OK"} — ${pass} assertions; the wf_inventory rung is proven to sit BENEATH researched copy, to be asked only where nothing researched answered, and to render without Wayfind's accent bar — the last of those EXECUTED against the real shipped stylesheet rather than read from source.`);
process.exit(fail ? 1 : 0);
