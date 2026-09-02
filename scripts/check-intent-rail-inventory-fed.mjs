// scripts/check-intent-rail-inventory-fed.mjs
//
// AN INTENT RAIL'S COMPOSER INPUT MUST NOT BE SOURCED SOLELY FROM
// `shown.places` — that IS the 2026-09-02 Night Out starvation bug (owner
// screenshot, Parrish 27.5876,-82.4237): DaypartRail.js's `nightOutPlaces`
// was `Object.values(shown.places || {})...` and nothing else, so
// composeNightOutRails() only ever saw rows OTHER home rails happened to
// load for THEIR OWN axis — never real inventory. See
// app/api/intent-candidates/route.js's header for the full incident.
//
// CLAUDE.md's own rule for this shape of guard ("assert the syntactic
// position, not the substring" / "assert on the call, not the string"):
// checking that `useIntentCandidates` and `mergeCandidates` are IMPORTED
// somewhere in the file is not enough — that would stay green even if a
// future edit reverted `nightOutPlaces` back to the raw shown.places union
// while the now-dead import sat unused above it. This guard isolates the
// ACTUAL DEFINITION of `nightOutPlaces` (the value fed into
// `<NightOutRails places={nightOutPlaces}>`) and asserts the hook's result
// is what feeds it, in that one specific place — not merely present in the
// file.
import { readFileSync } from "node:fs";

const FILE = "app/components/DaypartRail.js";
const src = readFileSync(FILE, "utf8");

let fails = 0;
const ok = (cond, msg) => { if (!cond) { console.error("  FAIL: " + msg); fails++; } };

// 1 — the hook and the merge helper are imported from the real module (not a
// same-named local shadow — CLAUDE.md's #486 lesson: assert the import, not
// just that the identifier appears somewhere).
const IMPORTS_HOOK = /import\s+useIntentCandidates\s*,\s*\{\s*mergeCandidates\s*\}\s*from\s*["']\.\/useIntentCandidates["']/.test(src)
  || (/import\s+useIntentCandidates\b/.test(src) && /\bmergeCandidates\b.*from\s*["']\.\/useIntentCandidates["']/.test(src));
ok(IMPORTS_HOOK, `${FILE} must import useIntentCandidates (default) and mergeCandidates from ./useIntentCandidates — a locally-reinvented merge is the same parallel-path bug CLAUDE.md's #486 postmortem exists to prevent.`);

// 2 — isolate the ACTUAL DEFINITION of `nightOutPlaces`, the value passed to
// <NightOutRails places={...}>. Brace-depth bounded from `useMemo(` to its
// matching close, exactly the way check-cron-post-nostore.mjs bounds a
// fetch() call — a regex with a fixed character window is exactly what broke
// on this file's own longer variable names before.
function defineBlock(source, constName) {
  const marker = `const ${constName} = useMemo(`;
  const start = source.indexOf(marker);
  if (start === -1) return null;
  let depth = 0, i = start + marker.length - 1, end = -1;
  for (; i < source.length; i++) {
    const c = source[i];
    if (c === "(") depth++;
    else if (c === ")") { depth--; if (depth === 0) { end = i; break; } }
  }
  return end === -1 ? null : source.slice(start, end + 1);
}

const block = defineBlock(src, "nightOutPlaces");
ok(!!block, `${FILE} must define \`const nightOutPlaces = useMemo(...)\` — if this identifier moved or was renamed, update this guard's marker to follow it (CLAUDE.md: "when a guard goes red because code moved, follow the code").`);

if (block) {
  // THE ACTUAL ASSERTION: mergeCandidates is CALLED inside this specific
  // definition, not merely present in the file. A guard that only checked
  // /mergeCandidates/.test(src) would stay green if this block still read
  // `Object.values(shown.places || {})...` alone while an unrelated, unused
  // mergeCandidates() call sat somewhere else in the component.
  ok(/\bmergeCandidates\s*\(/.test(block),
    `nightOutPlaces' own definition must call mergeCandidates(...) — found only shown.places sourcing. This is the exact starvation bug: the composer's input traced to ONE client-side union with no owned-inventory feed merged in.`);
  // …and the hook's result — not a second call to the hook inline (which
  // would refetch every render) — must be one of the merged arguments. The
  // hook is called once, above, into a named variable; assert THAT variable
  // is what reaches the merge, not just that some identifier containing
  // "Inventory" is nearby.
  const hookResultUsed = /mergeCandidates\([^)]*\bnightOutInventory\b[^)]*\)/.test(block);
  ok(hookResultUsed,
    `nightOutPlaces must merge in the useIntentCandidates() result (expected a variable named nightOutInventory reaching mergeCandidates(...) inside this block) — found mergeCandidates called without it, which recreates the same all-client-pool input under a new function name.`);
}

// 3 — the hook itself must actually be CALLED (imported-but-unused is the
// "reachability is transitive" trap CLAUDE.md names directly), and its
// result assigned to the name the block above expects.
ok(/\bconst\s+nightOutInventory\s*=\s*useIntentCandidates\s*\(/.test(src),
  `${FILE} must call useIntentCandidates(...) into a nightOutInventory variable — importing the hook without calling it changes nothing at runtime.`);

// 4 — NightOutRails must still receive the merged value, not the raw union
// directly. Bounds the JSX prop the same brace-free way check-cron-post-
// nostore.mjs bounds an options object: a fixed lookahead from the known prop
// name is safe here because `places={nightOutPlaces}` is a short, single-
// expression JSX attribute, never a nested object literal.
ok(/<NightOutRails[\s\S]{0,400}?places=\{nightOutPlaces\}/.test(src),
  `${FILE} must pass places={nightOutPlaces} to <NightOutRails> — found NightOutRails wired to something else, so the merged pool this guard just checked is not actually what reaches the composer.`);

// Prove the block-isolator itself works — CLAUDE.md: "a guard that fires on
// CORRECT code is worse than no guard", and its inverse, a guard that cannot
// fire on WRONG code either. A fixture with a DIFFERENT useMemo between two
// same-named-ish consts must not have its braces confused.
{
  const fixtureGood = `
    const decoyPlaces = useMemo(() => { return foo(bar(1, 2)); }, [x]);
    const nightOutPlaces = useMemo(() => {
      return mergeCandidates(clientPool, nightOutInventory);
    }, [shown, nightOutInventory]);
    const trailingPlaces = useMemo(() => other(), [y]);
  `;
  const fixtureBad = `
    const nightOutPlaces = useMemo(() => {
      return Object.values(shown.places || {}).flatMap((r) => r);
    }, [shown]);
  `;
  const goodBlock = defineBlock(fixtureGood, "nightOutPlaces");
  const badBlock = defineBlock(fixtureBad, "nightOutPlaces");
  ok(!!goodBlock && /mergeCandidates\(/.test(goodBlock) && !/decoyPlaces|trailingPlaces/.test(goodBlock),
    "self-test: the block isolator must find nightOutPlaces' own useMemo body and exclude a neighboring useMemo on either side");
  ok(!!badBlock && !/mergeCandidates\(/.test(badBlock),
    "self-test: a shown.places-only definition (the pre-fix shape) must NOT satisfy the mergeCandidates check — if this passes, the guard cannot actually catch the bug it exists for");
}

if (fails) {
  console.error(`check-intent-rail-inventory-fed: ${fails} failure(s)`);
  process.exit(1);
}
console.log("check-intent-rail-inventory-fed: OK — nightOutPlaces is defined by merging useIntentCandidates' result into the client pool, and that merged value (not the raw shown.places union) reaches <NightOutRails>");
