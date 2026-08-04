#!/usr/bin/env node
/**
 * test-dupes-imports — import bindings count as top-level declarations.
 *
 * THE BUG THIS EXISTS FOR. `scripts/check-dupes.mjs` is the deploy gate for
 * duplicate top-level declarations, and it counted only `function`, `const` and
 * `let`. An `import X` + `function X` collision therefore registered as ONE
 * declaration, the guard printed "no duplicate top-level declarations", and the
 * Vercel build then failed with "the name `X` is defined multiple times".
 *
 * It shipped that way twice on the same symbol: #538 introduced it, #541 removed
 * it, and a030e6b re-introduced it while making unrelated revenue changes. The
 * guard was green for all three.
 *
 * Asserted by CALLING the collector against fixture source, never by grepping the
 * guard's own text — the rule being enforced is a parse rule, so the only honest
 * check is to feed it code and look at the answer.
 */
import { topLevelDeclarations, duplicateNames, importBindings } from "./lib/topLevelDecls.mjs";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };
const dupNames = (src) => duplicateNames(src).map((d) => d.name);

/* ── 1. THE REGRESSION: default import + same-named function ─────────────── */
{
  const src = `import ViatorRail from "./components/ViatorRail";\nfunction ViatorRail({ title }) { return null; }\n`;
  ok(dupNames(src).includes("ViatorRail"),
    "default import + function of the same name is a DUPLICATE — this is the exact shape that failed the build at 712aad9");
  ok(topLevelDeclarations(src).get("ViatorRail") === 2,
    "…counted twice, not once — counting it once is precisely how the old guard passed a file that could not parse");
}

/* ── 2. named imports, including aliases ─────────────────────────────────── */
{
  ok(importBindings("{ a, b }").join() === "a,b", "named imports bind their own names");
  ok(importBindings("{ a as b }").join() === "b",
    "an ALIASED named import binds the ALIAS — binding `a` would both miss a real collision on `b` and invent a false one on `a`");
  const src = `import { rail as ViatorRail } from "./x";\nfunction ViatorRail() {}\n`;
  ok(dupNames(src).includes("ViatorRail"), "an aliased import collides with a function of the alias name");
  const clean = `import { ViatorRail as Rail } from "./x";\nfunction ViatorRail() {}\n`;
  ok(dupNames(clean).length === 0,
    "…and the ORIGINAL name does not collide once aliased away — the check discriminates rather than flagging everything");
}

/* ── 3. namespace imports ────────────────────────────────────────────────── */
{
  ok(importBindings("* as Aff").join() === "Aff", "a namespace import binds its alias");
  const src = `import * as Aff from "../lib/affiliates";\nconst Aff = 1;\n`;
  ok(dupNames(src).includes("Aff"), "namespace import + const of the same name is a duplicate");
}

/* ── 4. combined and side-effect forms ───────────────────────────────────── */
{
  ok(importBindings("X, { a as b }").join() === "X,b", "a combined default + named clause binds both");
  ok(importBindings("X, * as NS").join() === "X,NS", "default + namespace binds both");
  const sideEffect = `import "./globals.css";\nfunction globals() {}\n`;
  ok(dupNames(sideEffect).length === 0,
    "a side-effect import binds NOTHING and must not manufacture a collision");
  const multiline = `import {\n  alpha,\n  beta as gamma,\n} from "./x";\nfunction gamma() {}\n`;
  ok(dupNames(multiline).includes("gamma"), "a multi-line import clause is parsed, not skipped");
}

/* ── 5. exported declarations still count ────────────────────────────────── */
{
  const src = `import thing from "./thing";\nexport function thing() {}\n`;
  ok(dupNames(src).includes("thing"), "`export function` is still a top-level binding and still collides");
  const def = `import thing from "./thing";\nexport default function thing() {}\n`;
  ok(dupNames(def).includes("thing"), "…as is `export default function`");
}

/* ── 6. VALID FILES STAY GREEN — the negative controls ───────────────────── */
{
  const valid = [
    ["import only", `import ViatorRail from "./components/ViatorRail";\nconst x = <ViatorRail />;\n`],
    ["function only", `function ViatorRail() {}\n`],
    ["distinct names", `import A from "./a";\nimport B from "./b";\nfunction C() {}\nconst D = 1;\n`],
    ["same name in different scopes", `import A from "./a";\nfunction outer() { const A = 2; return A; }\n`],
    ["import of a name used, not redeclared", `import { viatorDirectUrl } from "../lib/affiliates";\nconst href = viatorDirectUrl(u);\n`],
    ["empty file", ``],
  ];
  for (const [label, src] of valid) {
    ok(dupNames(src).length === 0, `VALID stays green: ${label} (got ${JSON.stringify(dupNames(src))})`);
  }
  // A check that never reports a duplicate would pass every line above, so prove
  // it can still fail on the same corpus shape.
  ok(dupNames(`import A from "./a";\nfunction A() {}\n`).length === 1,
    "…and the same collector DOES flag a real duplicate — the green results above are not vacuous");
}

/* ── 7. the real files, and the real regression ──────────────────────────── */
{
  const { readFileSync } = await import("node:fs");
  const home = readFileSync("app/home.js", "utf8");
  ok(dupNames(home).length === 0, `app/home.js has no duplicate top-level declaration (got ${JSON.stringify(dupNames(home))})`);
  ok(/^import ViatorRail from/m.test(home), "…and it still imports the extracted ViatorRail — the fix kept the module, it did not delete the rail");
  ok(!/^function ViatorRail\b/m.test(home), "…with no local function of that name");
}

if (fail.length) {
  console.error("test-dupes-imports: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`test-dupes-imports: OK — ${pass} assertions (default/named/aliased/namespace imports counted, valid files green, the 712aad9 shape caught)`);
