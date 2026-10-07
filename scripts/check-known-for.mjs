#!/usr/bin/env node
// Lock for the "known for" line on sheet cards.
//
// The rule this defends: a card line is RESEARCH WE HOLD or it is absent. It is
// never composed from a price bucket, a Google type, or a model. The failure
// mode is silent and expensive — a page of true-of-everywhere sentences reads
// as filler and teaches the reader to skip every line, including the good ones.
import { readFileSync } from "node:fs";
import { knownForLine, knownForMap, editorialUsable } from "../lib/knownFor.js";
import { toHookLine } from "../lib/editorialHook.js";

let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error("  - " + m); } };
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ---- behaviour, executed ----
const real = { place_id: "x1", hook: "Florida's only 360-degree ocean tunnel — you stand inside the tank while sharks and rays pass overhead.", local_tip: "Buy the ICON Park combo.", issues: null };
ok(/ocean tunnel/.test(knownForLine(real) || ""), "a real hook does not survive composition");
ok((knownForLine(real) || "").includes("ICON Park combo"), "the local tip is dropped when it fits");
ok((knownForLine(real) || "").length <= 210, "composed line exceeds the 2-3 line budget");
// The budget must BIND, not merely be satisfied by short fixtures. This hook +
// tip pair only fits if the cap is enforced, so raising MAX turns this red.
const wide = {
  place_id: "x5",
  hook: "The 360-degree ocean tunnel is the reason to come, and you stand inside the tank while rays pass overhead on every side of you.",
  local_tip: "Buy the ICON Park combo ticket if you also want the observation wheel and the wax museum, because three separate tickets cost noticeably more.",
  issues: null,
};
const wideLine = knownForLine(wide) || "";
ok(wideLine.length <= 210, `the cap does not bind: composed ${wideLine.length} chars`);
ok(!wideLine.includes("ICON Park combo"), "the tip was appended past the budget — a card that long stops the list scanning");

ok(knownForLine({ place_id: "x2", hook: null, why_here: null, local_tip: "Go early." }) === null,
  "a row with no hook and no why_here still produced a line — a tip alone is not what a place is known for");
ok(knownForLine(null) === null, "null row did not return null");
ok(knownForLine({}) === null, "empty row did not return null");

// FAILED VERIFICATION is the one thing that must never reach a card.
const failed = { place_id: "x3", hook: "Serving the city since 1912.", issues: ["FAILED VERIFICATION"] };
ok(editorialUsable(failed) === false, "a FAILED VERIFICATION row is treated as usable");
ok(knownForLine(failed) === null, "a FAILED VERIFICATION row produced a card line — unverifiable claims about a real business must not ship");
ok(!Object.keys(knownForMap([failed, real])).includes("x3"), "knownForMap included a failed row");
ok(Object.keys(knownForMap([failed, real])).includes("x1"), "knownForMap dropped a good row — both sides must be non-empty for this test to mean anything");

// A verification-status placeholder is pending research, not a fact. It must be
// treated exactly like FAILED VERIFICATION: never rendered (owner 2026-08-07,
// "Louie Beans" showed "Independent verification ... None confirmed yet").
const pending = { place_id: "x6", hook: "Independent verification of this listing's specifics was not completed in this research pass. None confirmed yet.", issues: null };
ok(editorialUsable(pending) === false, "a verification-status placeholder row is treated as usable");
ok(knownForLine(pending) === null, "a verification-status placeholder produced a card line — pending research must not ship as a hook");
ok(!Object.keys(knownForMap([pending, real])).includes("x6"), "knownForMap included a pending-verification row");
// A real hook that merely contains the word "confirmed" must still ship — the
// reject is placeholder-specific, not a blanket ban on a common word.
const realConfirmed = { place_id: "x7", hook: "Reservations are confirmed by text, and the chef's counter seats eight.", issues: null };
ok(knownForLine(realConfirmed) !== null, "a real hook containing 'confirmed' was wrongly rejected as a placeholder");

// A line that cannot be trimmed at a sentence boundary is dropped, not ellipsed.
const runOn = { place_id: "x4", hook: "a".repeat(400), issues: null };
ok(knownForLine(runOn) === null || !/…|\.\.\./.test(knownForLine(runOn)), "a too-long hook was shipped truncated with an ellipsis instead of dropped");

// ---- wiring, asserted on the call not the string ----
const home = code(readFileSync(new URL("../app/home.js", import.meta.url), "utf8"));
const api = code(readFileSync(new URL("../app/api/known-for/route.js", import.meta.url), "utf8"));
const lib = code(readFileSync(new URL("../lib/knownFor.js", import.meta.url), "utf8"));

ok(/fetch\("\/api\/known-for"/.test(home), "home.js never calls /api/known-for, so no card can show a known-for line");
// Editorial must be applied AFTER the seeded cache and be able to overwrite the
// generated blurb. Merging in the other order would let the generic line win.
ok(/\.\.\.kd\.lines/.test(home), "known-for lines are not merged into the card line map");
// fetchKnownFor (the one place that merges kd.lines) is only CALLED from loadBlurbs after the
// seeded cache + inventory-editorial seed, and its merge is async, so it lands last.
ok(home.indexOf("...seeded") < home.indexOf("fetchKnownFor(list.map"), "known-for must be requested AFTER the cached generic line is seeded, or the generic line wins");
ok(/async function fetchKnownFor[\s\S]{0,900}\.\.\.prev, \.\.\.kd\.lines/.test(home), "fetchKnownFor merges kd.lines over the previous map (verified hooks overwrite the seed)");

ok(/knownForMap\(/.test(api), "the route does not use the shared composer, so the tested behaviour is not the shipped behaviour");
ok(!/openai|anthropic|aiKey|generate|completion/i.test(api), "the known-for route reaches a model — this text must be research we already hold, never generated");
ok(/FAILED VERIFICATION/.test(lib), "the failed-verification exclusion is gone from the composer");
ok(/degraded/.test(api), "the route cannot report a degraded lookup, so a silent blank is indistinguishable from 'no editorial'");
ok(/verified=is\.true/.test(api), "the route still gates the fleet read on verified=is.true — unpublished rows must not leak onto a card");
ok(/atlasLinesFor/.test(api), "the route consults Atlas cards — publish-ready copy already held must reach the take");
ok(!/openai|anthropic|aiKey|generate|completion/i.test(code(readFileSync(new URL("../lib/atlasCards.js", import.meta.url), "utf8"))),
  "the Atlas mapper reaches a model — Atlas is held research, never generated in this path");

// An unpublished fleet row (verified false, even with a punchy hook) is silent.
const unpublished = { place_id: "x8", hook: "A twelve-seat listening bar hidden behind an unmarked door.", verified: false, issues: null };
ok(editorialUsable(unpublished) === false, "a verified:false row is treated as usable");
ok(knownForLine(unpublished) === null, "a verified:false row produced a card line — unpublished research must not ship");

// No dashes in public copy: a spaced em/en dash becomes a comma at the card's compressor.
{
  const dl = toHookLine("Florida's only 360-degree ocean tunnel — you stand inside the tank while sharks pass overhead.", "Other Name");
  ok(dl && !/[—–]/.test(dl) && /tunnel, you stand/.test(dl), `toHookLine must turn a spaced dash into a comma (got "${dl}")`);
}

// ---- precedence, EXECUTED against the real route with a mocked Supabase ----
// verified hook > editorial_card whyGo > editorial_card bestFor > inventory editorial.
{
  const path = await import("node:path");
  const { loadComponent } = await import("./lib/jsxLoad.mjs");
  const route = await loadComponent(path.resolve("app/api/known-for/route.js"), process.cwd());
  const realFetch = globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://kf-mock.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "mock";
  const INV = "Laid-back spot offering grouper, jumbo shrimp, lobsters and other seafood plus a market";
  const respond = (rows) => ({ ok: true, status: 200, json: async () => rows });
  globalThis.fetch = async (u) => {
    const url = String(u);
    if (url.includes("wf_editorial_servable")) return respond([{ place_id: "kfA", name: "Alpha Grill", hook: "Hand-cut steaks and a patio over the water.", verified: true, issues: null }]);
    if (url.includes("editorial_card")) return respond([
      { place_id: "kfA", name: "Alpha Grill", whyGo: "Card line that must lose to the verified hook.", bestFor: null },
      { place_id: "kfB", name: "Bravo Cafe", whyGo: "Fresh-pressed Cuban sandwiches with a pond-view patio.", bestFor: "Bestfor line that loses to whyGo." },
      { place_id: "kfC", name: "Charlie Pub", whyGo: null, bestFor: "A quiet corner pub with live blues on Fridays." },
    ]);
    if (url.includes("wf_inventory")) return respond([
      { place_id: "kfB", editorial: INV }, { place_id: "kfC", editorial: INV }, { place_id: "kfD", editorial: INV },
    ]);
    return respond([]);
  };
  try {
    const res = await route.POST(new Request("http://x/api/known-for", { method: "POST", body: JSON.stringify({ ids: ["kfA", "kfB", "kfC", "kfD"] }) }));
    const { lines } = await res.json();
    ok(/steaks/.test(lines.kfA || ""), "a verified hook must beat the editorial_card whyGo");
    ok(/Cuban sandwiches/.test(lines.kfB || ""), "editorial_card whyGo must beat the inventory editorial");
    ok(!/Bestfor/.test(lines.kfB || ""), "bestFor must lose to whyGo when both exist");
    ok(/blues/.test(lines.kfC || ""), "editorial_card bestFor must beat the inventory editorial when whyGo is absent");
    ok(lines.kfD === INV, "a row with only inventory editorial still gets that line (the lowest rung survives)");
  } finally {
    globalThis.fetch = realFetch;
  }
}

// The mood prompt: four words, hard cap (owner).
const intro = readFileSync(new URL("../app/components/sheets/Intro.js", import.meta.url), "utf8");
const m = intro.match(/className="wf-intro-prompt">([^<]*)</);
ok(!!m, "the mood prompt heading is gone");
if (m) {
  const words = m[1].replace(/&[a-z]+;/g, "").trim().split(/\s+/).filter(Boolean);
  ok(words.length <= 4, `the mood prompt is ${words.length} words, cap is 4 ("${m[1].trim()}")`);
  ok(words.length >= 2, "the mood prompt is empty or a single word");
}

if (bad) { console.error(`\ncheck-known-for: FAIL — ${bad}/${n} assertions`); process.exit(1); }
console.log(`check-known-for: OK — ${n} assertions (card lines are held research or absent; failed-verification rows excluded; no model on this path; mood prompt within 4 words)`);
