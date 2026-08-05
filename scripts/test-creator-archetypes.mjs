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
// Everything is provisional today, so NOTHING is public. Asserted directly.
const publicRoles = handles.map(archetypeFor).filter(Boolean);
ok(publicRoles.length === 0,
   `nothing renders publicly yet (got ${publicRoles.length}) — every assignment is provisional until confirmed, and confirmation is a per-creator decision`);

// ── 2. UNASSIGNED AND UNKNOWN RENDER NOTHING ──────────────────────────────
ok(archetypeFor("theerynlalonde") === null, "a creator with archetype:null renders no role");
// THAT ASSERTION IS TRUE FOR THE WRONG REASON while everything is provisional —
// the gate short-circuits before the unassigned branch runs, so it cannot see a
// default-label regression. A mutation adding `|| ARCHETYPES.lifestyle_creator`
// passed it. resolveRole is exercised directly to reach that branch.
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
ok(creatorsForIntent("eatnow").length === 0, "creatorsForIntent returns nobody while every assignment is provisional — routing is live but empty, which is the correct state today");
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

console.log(`test-creator-archetypes: OK — ${pass} assertions (${ARCHETYPE_KEYS.length} archetypes, ${routing.length} routing to real intents; ${handles.length} draft assignments over ${live.length} live creators, ALL provisional so ${publicRoles.length} render publicly; no UI surface reaches past the gate)`);
