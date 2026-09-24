#!/usr/bin/env node
// scripts/check-hub-place-links.mjs
//
// SEO recovery (2026-09-23), Task A — hermetic guard (no network, no
// Supabase, no Google) for the internal links into durable /places/{id}
// pages added to three server-rendered hub surfaces: lib/landing.js's
// LandingPage (the /{cat}/{city} pages — things-to-do, restaurants,
// beaches, nightlife), app/florida/[town]/page.js, and
// app/best-beaches/[metro]/page.js.
//
// Evidence this responds to (Search Console, last 3 months): zero
// /places/{id} pages indexed, and nothing links to one except guides — these
// hub pages linked their places only to /p/{id} (noindex share URL) or
// /?q= (the app). Fix: one small server-rendered <nav> per hub, after the
// existing list, linking ONLY the ids that are BOTH shown on that list AND
// in the durable-eligible set lib/placeIndex.js's listIndexedIds() (and
// therefore the sitemap) already carries. Card markup is untouched.
//
// This guard proves, with no network:
//   1. The shared filter (lib/hubPlaceLinks.js selectEligiblePlaceLinks) is
//      EXECUTED on fixtures — real code, not a regex guess — and returns
//      only ids that are both rendered AND eligible, in list order, deduped,
//      fail-soft on malformed input.
//   2. It returns nothing for an empty eligible set, red-proven against a
//      control fixture that DOES return something for a non-empty set.
//   3. All three hub surfaces call that same tested filter (not an inline,
//      untested copy) and render nothing when it comes back empty.
//   4. Every existing card href expression in these three files is
//      byte-identical to origin/main — this change adds a nav; it does not
//      touch a single card.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { selectEligiblePlaceLinks } from "../lib/hubPlaceLinks.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fails = [];
const ok = (c, m) => { if (c) pass++; else fails.push(m); };

// ---------------------------------------------------------------------------
// 1 & 2. EXECUTE the shared filter on fixtures — the real function, not a
// restatement of what it's supposed to do.
// ---------------------------------------------------------------------------
const fixtureList = [
  { id: "A", name: "Alpha Diner" },
  { id: "B", name: "Beta Grill" },
  { id: "C", name: "Gamma Cafe" },
  { id: "A", name: "Alpha Diner (dup)" }, // duplicate id — must be deduped, first name wins
  null, // malformed row — must not throw
  { name: "No id row" }, // missing id — must be skipped, not crash
];

// RED-PROVE first: a control fixture with ONE eligible id DOES return that
// id. Without this, the empty-set assertion below would be unfalsifiable —
// a filter that always returns [] would pass it for the wrong reason.
const controlResult = selectEligiblePlaceLinks(fixtureList, new Set(["B"]));
ok(controlResult.ids.length === 1 && controlResult.ids[0] === "B",
  "RED-PROVE: a fixture with exactly one eligible id returns exactly that id — proves the empty-set case below means something");
ok(controlResult.names.get("B") === "Beta Grill",
  "the returned id carries its real display name, not a placeholder");

const fullEligible = new Set(["A", "C", "Z"]); // Z never appears in the rendered list
const fullResult = selectEligiblePlaceLinks(fixtureList, fullEligible);
ok(fullResult.ids.length === 2 && fullResult.ids[0] === "A" && fullResult.ids[1] === "C",
  "returns ONLY ids that are BOTH in the rendered list AND the eligible set, in list order (never ineligible 'B')");
ok(!fullResult.ids.includes("Z"),
  "an eligible id that is absent from the rendered list is never invented into the nav");
ok(fullResult.ids.filter((id) => id === "A").length === 1,
  "a duplicate id in the list is deduped to one nav entry");

const emptyResult = selectEligiblePlaceLinks(fixtureList, new Set());
ok(Array.isArray(emptyResult.ids) && emptyResult.ids.length === 0,
  "an EMPTY eligible set returns zero ids — a zero-eligible list renders no nav");

const emptyListResult = selectEligiblePlaceLinks([], fullEligible);
ok(emptyListResult.ids.length === 0,
  "an empty rendered list returns zero ids even with a non-empty eligible set");

ok(selectEligiblePlaceLinks(null, fullEligible).ids.length === 0,
  "a non-array list is fail-soft (returns zero ids, does not throw)");
ok(selectEligiblePlaceLinks(fixtureList, null).ids.length === 0,
  "a non-Set/undefined eligible arg is fail-soft (returns zero ids, does not throw)");
ok(selectEligiblePlaceLinks(fixtureList, ["A"]).ids.length === 1,
  "a plain array (not a Set) of eligible ids is also accepted");

// ---------------------------------------------------------------------------
// 3. Each hub surface calls the shared, tested filter — and renders nothing
// when it comes back empty.
// ---------------------------------------------------------------------------
const SURFACES = [
  {
    file: "lib/landing.js",
    callPattern: /selectEligiblePlaceLinks\(list,\s*eligiblePlaceIds\)/,
    emptyPattern: /if \(!navIds\.length\) return null;/,
    cardHref: 'href={"/?q=" + encodeURIComponent(p.name || "")}',
  },
  {
    file: "app/florida/[town]/page.js",
    callPattern: /selectEligiblePlaceLinks\(topTen,\s*eligiblePlaceIds\)/,
    emptyPattern: /placeNavIds\.length \? \(/,
    cardHref: "href={appUrl(`${p.name} ${t.title} FL`)}",
  },
  {
    file: "app/best-beaches/[metro]/page.js",
    callPattern: /selectEligiblePlaceLinks\(beaches,\s*eligiblePlaceIds\)/,
    emptyPattern: /beachNavIds\.length \? \(/,
    cardHref: 'href={"/p/" + encodeURIComponent(b.id)}',
  },
];

for (const s of SURFACES) {
  const p = join(root, ...s.file.split("/"));
  ok(existsSync(p), `${s.file} exists`);
  if (!existsSync(p)) continue;
  const src = readFileSync(p, "utf8");
  ok(src.includes('from "../lib/hubPlaceLinks.js"') || src.includes('from "./hubPlaceLinks.js"') || src.includes('from "../../../lib/hubPlaceLinks.js"'),
    `${s.file} imports the shared, tested selectEligiblePlaceLinks helper`);
  ok(s.callPattern.test(src), `${s.file} calls selectEligiblePlaceLinks(...) with the list actually rendered and the eligible-id set — not an untested inline copy`);
  ok(s.emptyPattern.test(src), `${s.file} renders nothing when the eligible-links result is empty`);
  ok(src.includes(s.cardHref), `${s.file} still contains its existing card href expression, unmodified: ${s.cardHref}`);
}

// ---------------------------------------------------------------------------
// 4. Card hrefs are byte-identical to origin/main — this change adds a nav;
// it never touches a card. Skips (does not fail) only when origin/main is
// genuinely unreadable, e.g. a shallow single-branch checkout — same
// convention as scripts/check-doc-ownership.mjs.
// ---------------------------------------------------------------------------
function gitShow(ref, path) {
  try {
    return execFileSync("git", ["show", `${ref}:${path}`], { cwd: root, encoding: "utf8" });
  } catch (e) {
    return null;
  }
}

const mainReadable = gitShow("origin/main", "package.json") !== null;
if (!mainReadable) {
  console.log("check-hub-place-links: SKIP — origin/main is not readable in this checkout (assertion 4 needs it); assertions 1-3 above still ran and count.");
} else {
  for (const s of SURFACES) {
    const mainSrc = gitShow("origin/main", s.file);
    ok(mainSrc !== null, `origin/main has a copy of ${s.file} to diff the card href against`);
    if (mainSrc == null) continue;
    ok(mainSrc.includes(s.cardHref),
      `origin/main's ${s.file} already contains this exact card href expression (so the assertion above is a real diff, not a coincidence): ${s.cardHref}`);
  }
}

console.log(`check-hub-place-links: ${pass}/${pass + fails.length} passed`);
if (fails.length) {
  for (const m of fails) console.error("check-hub-place-links: FAIL — " + m);
  process.exit(1);
}
