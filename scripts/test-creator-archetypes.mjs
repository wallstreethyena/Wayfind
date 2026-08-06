// scripts/test-creator-archetypes.mjs — creator roles are a routing primitive,
// and no provisional role reaches a real person's card.
//
// Brand brief Part B. Two properties matter more than the rest:
//
//   1. NO PROVISIONAL ROLE RENDERS PUBLICLY. These are claims about real named
//      people derived from reading their captions. A wrong one is damaging in
//      public and worse in an outreach DM, so archetypeFor() — the public
//      accessor — must return null for anything not confirmed.
//   2. AN UNASSIGNED CREATOR RENDERS NOTHING, never a default label. The house
//      pattern is that a missing value renders nothing at all.
import { ARCHETYPES, ARCHETYPE_KEYS, ASSIGNMENTS, archetypeFor, resolveRole, draftArchetypeFor, creatorsForIntent, routedIntents } from "../lib/creatorArchetypes.js";
import { allCreators } from "../lib/creatorVideos.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0;
const fail = (m) => { console.error("test-creator-archetypes: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };
const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// ── 1. THE SAFETY PROPERTY ────────────────────────────────────────────────
const handles = Object.keys(ASSIGNMENTS);
ok(handles.length > 0, `assignments exist (got ${handles.length}) — an empty set would make every assertion below vacuous`);
for (const h of handles) {
  const row = ASSIGNMENTS[h];
  if (row.provisional) {
    ok(archetypeFor(h) === null,
       `"${h}" is provisional, so the PUBLIC accessor returns null — a provisional role must never render on a named person's card`);
  }
  ok(typeof row.evidence === "string" && row.evidence.length > 40,
     `"${h}" records the evidence its assignment was made on, so a reviewer can check the call without re-reading the corpus`);
  if (row.archetype !== null) ok(!!ARCHETYPES[row.archetype], `"${h}" names a real archetype ("${row.archetype}")`);
}
// THE RULE, NOT THE STATE. This used to assert "nothing renders publicly",
// which was true while every row was provisional and became WRONG the moment
// the owner confirmed four of them (2026-08-05). A guard that encodes today's
// data as the invariant blocks the very change it was written to make safe.
//
// What must always hold is the RULE: provisional never resolves, confirmed and
// assigned always does. Both directions, so neither can rot.
const publicRoles = handles.map(archetypeFor).filter(Boolean);
for (const h of handles) {
  const row = ASSIGNMENTS[h];
  const got = archetypeFor(h);
  if (row.provisional || row.removed || !row.archetype) {
    ok(got === null, `"${h}" does not resolve publicly (provisional=${!!row.provisional}, removed=${!!row.removed}, archetype=${JSON.stringify(row.archetype)})`);
  } else {
    ok(!!got, `"${h}" is confirmed and assigned, so it DOES resolve — otherwise confirmation would be a no-op`);
    ok(got.key === row.archetype, `"${h}" resolves to the role it was assigned (${row.archetype})`);
    ok(Array.isArray(got.intents), `"${h}" carries its routing intents`);
  }
}
// The confirmed set must be non-empty now, or every "does resolve" branch above
// is vacuous and this guard is only testing the null path.
const confirmed = handles.filter((h) => !ASSIGNMENTS[h].provisional && !ASSIGNMENTS[h].removed && ASSIGNMENTS[h].archetype);
ok(confirmed.length > 0, `at least one assignment is confirmed (got ${confirmed.length}) — with none, the resolve-path assertions never run`);
ok(publicRoles.length === confirmed.length, `exactly the confirmed assignments render publicly (${publicRoles.length} vs ${confirmed.length})`);

// ── 2. UNASSIGNED AND UNKNOWN RENDER NOTHING ──────────────────────────────
ok(archetypeFor("theerynlalonde") === null, "a creator with archetype:null renders no role");
// THAT ASSERTION IS TRUE FOR THE WRONG REASON while everything is provisional —
// the gate short-circuits before the unassigned branch runs, so it cannot see a
// default-label regression. A mutation adding `|| ARCHETYPES.lifestyle_creator`
// passed it. resolveRole is exercised directly to reach that branch.
// THE GATE ITSELF, exercised with a synthetic row. After the 2026-08-05
// confirmations no REAL row is both provisional AND assigned, so the real data
// stopped testing the gate entirely — removing `row.provisional` from
// resolveRole passed every assertion, because the only provisional rows left
// have archetype:null and return null for that reason instead. Same
// green-for-the-wrong-reason hole as the default-label one, one confirmation
// later. This fixture keeps the gate under test no matter what the data does.
ok(resolveRole({ archetype: "food_expert", provisional: true }) === null,
   "a PROVISIONAL but ASSIGNED row still resolves to null — this is the gate that stops an unconfirmed role reaching a real person's card, and no live row exercises it any more");
ok(!!resolveRole({ archetype: "food_expert", provisional: false }),
   "control: the same row WITHOUT the provisional flag does resolve, so the null above is the gate and not the archetype being unreadable");
ok(resolveRole({ archetype: null, provisional: false }) === null,
   "a CONFIRMED creator with no archetype still resolves to null — never a default label like \"Lifestyle Creator\"");
ok(resolveRole({ archetype: "food_expert", provisional: false, removed: true }) === null,
   "a removed creator resolves to null even when confirmed — removal is honoured");
ok(resolveRole({ archetype: "not-a-real-role", provisional: false }) === null,
   "an unknown archetype key resolves to null rather than falling back to something");
ok(resolveRole(null) === null && resolveRole(undefined) === null, "a missing row resolves to null (no crash)");
// POSITIVE CONTROL: resolveRole DOES resolve a good row, so the nulls above mean something.
ok(!!resolveRole({ archetype: "food_expert", provisional: false }),
   "positive control: a confirmed, assigned row DOES resolve — otherwise every null above would be vacuous");
ok(archetypeFor("nobody-at-all") === null, "an unknown handle renders no role, not a default");
ok(archetypeFor("") === null && archetypeFor(null) === null, "empty/null handles render nothing (no crash)");

// ── 3. THE ROLE MUST ROUTE ────────────────────────────────────────────────
// "A role that doesn't decide where content surfaces is a badge, and badges rot."
// Checked across the whole product, not one file: "brunch" is a real intent
// (17 occurrences) but does not appear in lib/coupons.js, so a single-file
// check would have rejected a genuine routing target. The claim is "this intent
// exists elsewhere in the product", so the check has to look there.
const libFiles = readdirSync(path.join(REPO, "lib")).filter((f) => /\.js$/.test(f)).map((f) => path.join(REPO, "lib", f));
const INTENT_SRC = [...libFiles, path.join(REPO, "app/home.js")].map((f) => { try { return readFileSync(f, "utf8"); } catch { return ""; } }).join("\n");
ok(INTENT_SRC.length > 10000, `read a real body of source to check intents against (got ${INTENT_SRC.length} chars)`);
for (const i of routedIntents()) {
  ok(new RegExp(`"${i}"`).test(INTENT_SRC),
     `the archetype routing target "${i}" is a REAL intent used elsewhere in the product, not one this file invented`);
}
ok(!new RegExp('"totally-made-up-intent"').test(INTENT_SRC), "negative control: an invented intent is NOT found, so the check above can actually fail");
const routing = ARCHETYPE_KEYS.filter((k) => ARCHETYPES[k].intents.length > 0);
ok(routing.length >= 4, `at least four archetypes route to concrete intents (got ${routing.length}) — otherwise this is a label set, not a primitive`);
for (const k of ARCHETYPE_KEYS) {
  ok(typeof ARCHETYPES[k].identity === "string" && /^you /.test(ARCHETYPES[k].identity),
     `"${k}" states its identity line in the second person, addressed to the creator ("${ARCHETYPES[k].identity}")`);
  ok(typeof ARCHETYPES[k].line === "string" && !/^category|^type:/i.test(ARCHETYPES[k].line),
     `"${k}" has a card line in their language, not ours`);
}
// Routing must actually route now that something is confirmed — a role that
// does not decide where content surfaces is a badge, and badges rot.
{
  const routed = new Set();
  for (const i of routedIntents()) for (const h of creatorsForIntent(i)) routed.add(h);
  ok(routed.size > 0, `confirmed creators are reachable through their intents (got ${routed.size}) — otherwise the role is decorative`);
  for (const h of routed) ok(!ASSIGNMENTS[h].provisional, `"${h}" is routed only because it is CONFIRMED — routing must never surface a provisional role`);
}
ok(creatorsForIntent("").length === 0, "an empty intent routes to nobody");

// ── 4. ASSIGNMENTS COVER LIVE CREATORS ONLY ───────────────────────────────
// The file names 38 handles; only 6 are renderable. Roling the other 32 would
// invent identities for people whose work is not being shown.
const live = allCreators().creators.map((c) => c.handle.toLowerCase());
ok(live.length > 0, `there are live creators to check against (got ${live.length})`);
for (const h of handles) {
  ok(live.includes(h.toLowerCase()),
     `"${h}" is a LIVE creator (renderable video) — roles must not be assigned to seed rows whose content does not exist`);
}

// ── 5. NO PROVISIONAL ROLE LEAKS THROUGH A UI SURFACE ─────────────────────
// The accessor is safe; this proves no component reaches around it into the
// raw table. Comments stripped first.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ui = [];
const walk = (d) => { for (const e of readdirSync(d)) { const p = path.join(d, e); if (/node_modules|\.next/.test(p)) continue; const st = statSync(p); if (st.isDirectory()) walk(p); else if (/\.jsx?$/.test(p)) ui.push(p); } };
walk(path.join(REPO, "app"));
ok(ui.length > 50, `swept the app surface (got ${ui.length} files)`);
for (const f of ui) {
  const code = strip(readFileSync(f, "utf8"));
  ok(!/\bASSIGNMENTS\b/.test(code),
     `${path.relative(REPO, f)} imports the raw ASSIGNMENTS table — UI must go through archetypeFor(), which is what enforces the provisional gate`);
  ok(!/draftArchetypeFor\(/.test(code),
     `${path.relative(REPO, f)} calls draftArchetypeFor() — that is review tooling and returns PROVISIONAL roles; UI must use archetypeFor()`);
}

// ── 6. CONTROLS ───────────────────────────────────────────────────────────
// Prove the gate is what is doing the work: with the flag cleared, the same
// row WOULD resolve. Otherwise "returns null" could just mean "always null".
const row = ASSIGNMENTS["katelynintampa"];
ok(row && row.archetype === "food_expert", "positive control: katelynintampa has a real draft assignment to resolve");
ok(!!draftArchetypeFor("katelynintampa"), "positive control: the DRAFT accessor does surface it, so the public null is the provisional gate and not an empty table");
ok(draftArchetypeFor("nobody-at-all") === null, "negative control: the draft accessor still refuses an unknown handle");

console.log(`test-creator-archetypes: OK — ${pass} assertions (${ARCHETYPE_KEYS.length} archetypes, ${routing.length} routing to real intents; ${handles.length} draft assignments over ${live.length} live creators, ${confirmed.length} confirmed and ${publicRoles.length} rendering publicly; no UI surface reaches past the gate)`);
