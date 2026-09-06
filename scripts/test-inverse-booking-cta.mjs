#!/usr/bin/env node
// scripts/test-inverse-booking-cta.mjs — THE INVERSE TEST, layer 2 of the
// revenue-guard stack. Complements scripts/check-book-cta-needs-a-seller.mjs
// (which locks isTicketyPlace's type rules) by walking one hop further down
// the SAME call chain: ticketsUrl(), the function the Detail sheet's actual
// "Tickets & tours" button calls.
//
// THE GAP THIS CLOSES. check-book-cta-needs-a-seller.mjs asserts
// `ticketsUrl(beach) === null` for every free/public fixture, but it never
// asserts the POSITIVE branch — that ticketsUrl() actually RETURNS a real,
// attributed URL for a paid attraction. Read literally, "no CTA" for a beach
// is equally consistent with a ticketsUrl() that returns null for every
// input, beach or aquarium alike (CLAUDE.md's own rule: a negative-only test
// proves nothing without a positive control on the SAME code path). That
// silent gap exists because ticketsUrl()'s truthy branch depends on
// NEXT_PUBLIC_VIATOR_PID / NEXT_PUBLIC_GYG_PID being configured in the
// process that imports lib/affiliates.js — ambient, not deterministic — so a
// prior guard asserting it directly in a normal CI shell would sometimes pass
// and sometimes silently skip the interesting half depending on what secrets
// happened to be exported.
//
// THE FIX: set a FIXTURE pid — a value that is obviously not a real
// credential, chosen by this guard, not read from the shell — BEFORE the
// first import of lib/affiliates.js in this process. That is a WRITE to
// process.env for fixture setup, which scripts/check-guard-hermeticity.mjs
// explicitly allows (it only forbids a READ that decides the verdict); the
// module-level `const VIATOR = credential(process.env.NEXT_PUBLIC_VIATOR_PID)`
// in lib/affiliates.js then captures OUR value, deterministically, every run,
// on every machine. This is the same shape check-monetized-degrade.mjs uses.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

// ES MODULE IMPORT HOISTING GOTCHA — the reason this is a dynamic import, not
// a static one. ALL static `import` declarations in a module are hoisted and
// evaluated before any other top-level statement runs, REGARDLESS of their
// textual position — so `process.env.NEXT_PUBLIC_VIATOR_PID = "..."` written
// above a static `import { ticketsUrl } from "../lib/affiliates.js"` would
// still lose the race: affiliates.js's module-level `const VIATOR =
// credential(process.env.NEXT_PUBLIC_VIATOR_PID)` would already have captured
// an EMPTY value by the time the assignment ran, and every "positive control"
// assertion below would silently test against VIATOR="" instead of the
// fixture — the exact "mutation that silently fails to apply" shape CLAUDE.md
// warns about, just via language semantics instead of a sed flag. Proven by
// running this file with a static import during authoring: every ticketsUrl()
// positive control returned null. A dynamic import() runs at the point it is
// AWAITED, after the assignment below, which is why this line comes first.
process.env.NEXT_PUBLIC_VIATOR_PID = "P00000001"; // fixture only — never a real credential
const { isTicketyPlace, isNeverBookable, ticketsUrl } = await import("../lib/affiliates.js");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AFFILIATES_PATH = join(ROOT, "lib/affiliates.js");

let pass = 0;
const fails = [];
const ok = (c, m) => { pass++; if (!c) fails.push(m); };
const P = (name, types, category) => ({ name, types, category, id: "p_" + name.replace(/\W+/g, "") });

// ── 1. NEGATIVE: real beach-shaped and park-shaped inputs, full CTA path ───
const FREE_LAND = [
  ["Coquina Beach", ["natural_feature", "tourist_attraction"], null],
  ["Siesta Key Beach", ["beach", "tourist_attraction", "natural_feature"], null],
  ["Lido Key", ["tourist_attraction", "point_of_interest"], "beach"],
  ["Shamrock Park & Nature Center", ["park", "tourist_attraction", "point_of_interest", "establishment"], null],
  ["Deer Prairie Creek Preserve South", ["hiking_area", "tourist_attraction", "park", "sports_activity_location"], null],
  ["Osprey Junction Trailhead", ["park", "hiking_area", "tourist_attraction"], null],
];
for (const [name, types, category] of FREE_LAND) {
  const place = P(name, types, category);
  ok(isTicketyPlace(place) === false, `isTicketyPlace(${name}) === false — no bookable CTA on free/public land`);
  ok(ticketsUrl(place) === null, `ticketsUrl(${name}) === null through the SAME call — the Detail sheet CTA cannot render for ${name} even with a real pid configured`);
}

// ── 2. POSITIVE CONTROL: a paid attraction, same call chain, same pid ──────
// This is the assertion the inverse test is worthless without: proving the
// negative results above reflect the beach/park exclusion specifically, not
// a ticketsUrl() that is dark for every input regardless of type.
const PAID = [
  ["Mote Marine Laboratory & Aquarium", ["aquarium", "tourist_attraction"]],
  ["Universal Studios Florida", ["amusement_park", "amusement_center", "park", "point_of_interest"]], // sold type wins despite carrying "park"
];
for (const [name, types] of PAID) {
  const place = P(name, types);
  ok(isTicketyPlace(place) === true, `isTicketyPlace(${name}) === true — positive control on the same predicate`);
  const url = ticketsUrl(place);
  ok(typeof url === "string" && url.length > 0, `ticketsUrl(${name}) returns a real string — the SAME code path DOES produce a CTA for paid inventory`);
  if (typeof url === "string") {
    ok(/^https:\/\/www\.viator\.com\//.test(url), `…and it is a viator.com URL (${name})`);
    ok(url.includes("pid=P00000001"), `…carrying OUR fixture pid, proving withViatorTracking() ran on this exact call (${name})`);
    ok(url.includes("mcid=42383") && url.includes("medium=link"), `…with attribution params intact (${name})`);
  }
}

// ── 3. the v6.53 hard rule is exercised directly too ────────────────────────
// isNeverBookable() is the BEACH/natural_feature rule specifically — parks and
// preserves in FREE_LAND above are excluded by the separate FREE_LAND_TYPES
// check inside isTicketyPlace(), not by isNeverBookable(). Asserting
// isNeverBookable on a park would be asserting a fact the function was never
// meant to guarantee, which is exactly the "assert the wrong invariant" trap
// CLAUDE.md warns about.
const BEACHES_ONLY = FREE_LAND.filter(([, types, category]) => /\bbeach\b/.test(types.join(" ")) || /natural_feature/.test(types.join(" ")) || category === "beach");
ok(BEACHES_ONLY.length === 3, "PROBE: exactly 3 of the FREE_LAND fixtures are beach/natural_feature-shaped — a count of 0 here would make every isNeverBookable assertion below vacuous");
for (const [name, types, category] of BEACHES_ONLY) {
  ok(isNeverBookable(P(name, types, category)) === true, `isNeverBookable(${name}) === true`);
}
for (const [name, types] of PAID) {
  ok(isNeverBookable(P(name, types)) === false, `control: isNeverBookable(${name}) === false — the rule does not over-fire on paid inventory`);
}

// ── 4. RED-PROVE: weaken the beach exclusion by an APPLIED mutation ────────
// CLAUDE.md: "red-prove by breaking the thing the assertion protects" AND
// "the mutation itself must be proven to have applied" — printed, and
// verified with a python-based edit (not sed, which reports success on a
// zero-match rewrite). This runs the CURRENT (unmutated) file's exports above;
// this section spawns a SEPARATE child process against a temporarily mutated
// copy of lib/affiliates.js so the mutation is real, applied, and reverted —
// never edited-then-left-broken, and never done by editing THIS guard.
{
  const original = readFileSync(AFFILIATES_PATH, "utf8");
  const target = 'return /\\bbeach\\b/.test(types) || /natural_feature/.test(types) || !!(place && place.category === "beach");';
  if (!original.includes(target)) {
    fails.push("red-prove setup: the exact isNeverBookable return line was not found verbatim in lib/affiliates.js — the guard's mutation target has drifted, fix the string above before trusting this guard");
  } else {
    const mutated = original.replace(target, "return false; // MUTATED BY test-inverse-booking-cta.mjs RED-PROVE — must never ship");
    if (mutated === original) {
      fails.push("red-prove: replace() did not change the file — the mutation silently failed to apply");
    } else {
      writeFileSync(AFFILIATES_PATH, mutated);
      const stillTarget = readFileSync(AFFILIATES_PATH, "utf8").includes("MUTATED BY test-inverse-booking-cta.mjs RED-PROVE");
      console.log(`red-prove: applied mutation to lib/affiliates.js — isNeverBookable() now unconditionally returns false (verified written: ${stillTarget})`);
      let childOk = null;
      try {
        // A fresh child process, forced to re-import the mutated file (this
        // process already cached the good module and cannot be un-cached).
        //
        // Lido Key, not Coquina Beach, is the fixture here: Coquina Beach
        // types as ["natural_feature", "tourist_attraction"], and
        // "natural_feature" is ALSO a member of FREE_LAND_TYPES — a second,
        // independent gate inside isTicketyPlace would still catch it even
        // with isNeverBookable neutered, so that fixture cannot tell this
        // mutation apart from a correct file (a false negative discovered
        // by actually running it, not assumed). Lido Key carries only
        // category:"beach" with types ["tourist_attraction",
        // "point_of_interest"] — neither type is in FREE_LAND_TYPES or
        // SOLD_TYPES, and "tourist_attraction" matches the bare TICKETY
        // regex, so with isNeverBookable's category check removed this is
        // the one fixture that is caught by NOTHING else and must flip.
        execFileSync(process.execPath, ["-e", `
          import("${new URL("../lib/affiliates.js", import.meta.url).href}").then(({ isTicketyPlace }) => {
            const leaked = isTicketyPlace({ name: "Lido Key", types: ["tourist_attraction", "point_of_interest"], category: "beach" });
            if (leaked !== true) { console.error("expected the mutation to leak a Book CTA onto the beach; got " + leaked); process.exit(1); }
            process.exit(0);
          }).catch((e) => { console.error(String(e)); process.exit(1); });
        `], { stdio: "pipe" });
        childOk = true;
      } catch (e) {
        childOk = false;
      }
      // Restore FIRST, unconditionally, before asserting on the result — a
      // failed assertion below must never leave the mutation live in the tree.
      writeFileSync(AFFILIATES_PATH, original);
      const restored = readFileSync(AFFILIATES_PATH, "utf8") === original;
      ok(restored, "red-prove: lib/affiliates.js was restored byte-for-byte after the mutation");
      ok(childOk === true, "red-prove: with the beach exclusion mutated away, isTicketyPlace(Coquina Beach) DOES flip to true in a fresh process — the assertions above are not decoration, they catch a real weakening of the beach rule");
    }
  }
}

if (fails.length) {
  console.error("test-inverse-booking-cta: FAIL");
  fails.forEach((f) => console.error("  ✗ " + f));
  process.exit(1);
}
console.log(`test-inverse-booking-cta: OK — ${pass} assertions; beach/park inputs produce no CTA through ticketsUrl(), a paid-attraction positive control produces a real attributed viator.com URL on the same call, and an applied mutation of the beach exclusion is caught in a fresh process`);
