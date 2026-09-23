// scripts/check-customer-copy-leaks.mjs — customer-facing hotel copy must
// never carry internal curation/prompt scaffolding.
//
// WHAT WENT WRONG (2026-09-23): lib/ownedHotels.json's `whyGo` field — which
// lib/hotels.js forwards straight onto place.blurb, which
// app/components/EventStayCards.js passes as `editorial` into
// <IconicPlaceCard>, which runs it through toHookLine() as the card's take —
// was templated from an internal ingestion prompt: "Use <Hotel Name> when
// the user wants ... It scored 9.8/10 from the Wayfind rating signal." That
// sentence painted verbatim on the public "Stay Tonight" card for Palmetto
// Riverside Bed & Breakfast. toHookLine() is a card-shape sanitizer (strips
// name-prefixes, addresses, hours) — it was never a content-policy filter
// and does not know "the user" or "rating signal" are staff-only phrasing.
//
// THE LAW (owner): the only thing a guest should read on a card is why they
// should go and what they get out of it. No prompt fragments, no internal
// scoring language, no address-book instructions to a future curator.
//
// WHAT THIS GUARD HOLDS. Every customer-facing hotel copy field in
// lib/ownedHotels.json (whyGo, knownFor, vibe — the fields that reach
// place.blurb / place.knownFor / place.vibe and can paint on a card or the
// detail sheet) must be free of:
//   - second/third-person prompt address ("the user", "Use X when")
//   - internal scoring language ("rating signal", a bare "N.N/10" score)
//   - curator-only process notes ("verify ... before", "top slot")
//   - unfinished-content markers (TODO, TBD, lorem ipsum)
// It is a data guard, not a UI guard: it reads the JSON directly, so it
// fails the instant a bad string lands in the file — before toHookLine (or
// any other sanitizer) gets a chance to let it through unchanged.
//
// MUTATION CONTROL: this guard runs its own assertions against a
// deliberately leaky fixture row on every run (see main()) and fails if the
// known-bad sentence is NOT caught, so the guard cannot silently go
// vacuous.
import { readFileSync } from "node:fs";
// The REAL card pipeline: whyGo becomes place.blurb (lib/hotels.js) and paints
// through toHookLine() in IconicPlaceCard. Every line is checked as it would
// actually render, not only as stored.
import { toHookLine } from "../lib/editorialHook.js";

const FIELDS = ["whyGo", "knownFor", "vibe"];

// One pattern list, so the fixture-mutation pass below exercises exactly
// what the real pass does — no drift between "what we test" and "what we
// enforce".
const LEAK_PATTERNS = [
  [/\bthe user\b/i, "second/third-person prompt address (\"the user\")"],
  [/^use\s+.+\bwhen\b/i, "prompt-template opener (\"Use X when ...\")"],
  [/rating signal/i, "internal scoring language (\"rating signal\")"],
  [/\b\d(?:\.\d)?\s*\/\s*10\b/, "a bare numeric score (\"N/10\")"],
  [/\bverify\b[^.]{0,60}\bbefore\b/i, "curator process note (\"verify ... before\")"],
  [/\btop slot\b/i, "internal ranking jargon (\"top slot\")"],
  [/\bTODO\b|\bTBD\b|lorem ipsum/i, "unfinished-content marker"],
];

function loadRows(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// Pure: takes rows, returns [{ name, field, value, reason }, ...]. No fs, no
// process — the same function backs the real pass and the mutation-control
// pass below.
export function findLeaks(rows) {
  const hits = [];
  for (const row of rows || []) {
    for (const field of FIELDS) {
      const value = row && row[field];
      if (!value || typeof value !== "string") continue;
      for (const [rx, reason] of LEAK_PATTERNS) {
        if (rx.test(value)) hits.push({ name: row.name, field, value, reason });
      }
      if (field === "whyGo") {
        const painted = toHookLine(value, row.name);
        if (!painted) hits.push({ name: row.name, field, value, reason: "whyGo is unusable as a card line (toHookLine returned nothing); use null instead of filler" });
        else for (const [rx, reason] of LEAK_PATTERNS) {
          if (rx.test(painted)) hits.push({ name: row.name, field: "card line", value: painted, reason });
        }
      }
    }
  }
  return hits;
}

function main() {
  const path = new URL("../lib/ownedHotels.json", import.meta.url);
  const rows = loadRows(path);
  if (!Array.isArray(rows) || rows.length < 100) {
    console.error(`check-customer-copy-leaks: FAIL — lib/ownedHotels.json unreadable or truncated (got ${Array.isArray(rows) ? rows.length : typeof rows} rows)`);
    process.exit(1);
  }

  const hits = findLeaks(rows);

  // MUTATION CONTROL — a guard that cannot go red is decoration. Prove the
  // rule bites by running it against the exact leaked sentence this guard
  // exists to catch, put back into a fixture row.
  const sabotaged = [
    ...rows,
    {
      name: "Fixture Sabotage Inn",
      whyGo: "Use Fixture Sabotage Inn when the user wants something personal and local. It scored 9.8/10 from the Wayfind rating signal.",
    },
  ];
  const mutationHits = findLeaks(sabotaged).filter((h) => h.name === "Fixture Sabotage Inn");
  if (mutationHits.length < 2) {
    console.error("check-customer-copy-leaks: FAIL — MUTATION CONTROL — the known-bad sentence was not caught (guard is vacuous)");
    console.error(`  caught ${mutationHits.length} pattern(s) on the fixture row, expected >= 2`);
    process.exit(1);
  }

  if (hits.length) {
    console.error(`check-customer-copy-leaks: FAIL — ${hits.length} internal-copy leak(s) in lib/ownedHotels.json:`);
    for (const h of hits.slice(0, 30)) {
      console.error(`  ✗ ${h.name} [${h.field}] ${h.reason}: "${h.value}"`);
    }
    if (hits.length > 30) console.error(`  ...and ${hits.length - 30} more`);
    process.exit(1);
  }

  console.log(`check-customer-copy-leaks: OK — ${rows.length} owned-hotel rows, ${FIELDS.join("/")} clean, mutation control caught ${mutationHits.length} pattern(s) on the sabotage fixture`);
}

main();
