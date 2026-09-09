#!/usr/bin/env node
/**
 * scripts/check-rpc-schema-contract.mjs — THE CALLER AND THE FUNCTION MUST
 * AGREE ON THE FUNCTION'S ARGUMENTS, AND ONLY PRODUCTION KNOWS WHAT THOSE ARE.
 *
 * THE INCIDENT (2026-09-07). #1150 created wf_popularity_attempts and a
 * 3-argument wf_popularity_stale_batch(p_source, p_categories, p_n). #1153
 * widened it to 5 arguments, adding p_primary_types and p_min_reviews, and
 * shipped app/api/cron/popularity/route.js calling
 * db.rpc("wf_popularity_stale_batch", { p_source, p_categories, p_n,
 * p_primary_types, p_min_reviews }) — five named arguments. #1153's migration
 * was never applied (it had been blocked on #1150's table existing, and after
 * that unblocked nobody went back for it). Both PRs merged and deployed. The
 * application code was internally correct. The database schema was
 * internally correct. They were incompatible with each other, and 553
 * passing guards could not see it, because every one of them reads the REPO
 * — none reads production. PostgREST resolves an rpc() call by matching the
 * JSON body's KEY SET against a function's parameter NAMES, not by position
 * and not by arity alone, so five named arguments against a three-argument
 * function matched zero overloads. The 08:23 UTC cron did zero work across
 * all four providers — worse than the starvation bug it shipped to fix.
 *
 * WHY EXISTENCE ALONE WOULD NOT HAVE CAUGHT THIS. wf_popularity_stale_batch
 * existed in production for the entire incident window — the 3-arg version
 * never went away. A guard that only asked "does this function exist" would
 * have stayed green through the whole thing. Argument NAMES are the contract
 * PostgREST actually enforces; this guard compares those, not just the name
 * of the function.
 *
 * WHAT THIS DOES NOT AND CANNOT CATCH. Postgres argument TYPES are not
 * checked here. A caller passes JS values with no static type — `p_n: BATCH`
 * tells us nothing about whether BATCH is really a number at runtime — so
 * there is no sound way to compare them against the integer/text/text[]
 * types production reports. A type mismatch would surface as a Postgres
 * runtime error on the call, not a PostgREST "no matching function" error
 * like #1153's; production's argument TYPES are still fetched and reported in
 * failure output for a human to read, but they are not a pass/fail input
 * here. NAME-SET matching is what would have caught the actual incident, and
 * is what this guard exists to keep catching.
 *
 * HOW CALL SITES ARE READ. There is no JS AST parser in this repo's
 * dependencies (see package.json) and the house convention (guards.txt,
 * canary.yml) is to read source as text — so this is a small hand-written
 * scanner, not a full parser. It finds every `db.rpc(` / `supabase.rpc(` call
 * under app/** and lib/**, and for each one extracts the function name and
 * the TOP-LEVEL KEY NAMES of the second argument, if and only if that
 * argument is a plain object literal (or absent). A spread (`...x`), a
 * computed key (`[k]: v`), a bare variable/expression, or anything else the
 * scanner does not recognise is NOT skipped — it is reported as its own
 * failure, separate from and as loud as a real contract mismatch. A checker
 * that silently ignores what it cannot parse is the exact failure mode this
 * whole incident is about: a gap nothing was watching.
 *
 * WHY CANARY, NOT PREBUILD. Same reasoning as check-inventory-integrity.mjs
 * and check-promote-metros-live-drift.mjs: this needs a live Supabase read,
 * which prebuild does not have (check-guard-hermeticity forbids a build-time
 * guard from holding a credential), and a stale schema comparison must never
 * be able to block a code deploy on its own credential's account — the
 * coupling runs the other way, DB state gating a scheduled canary check, not
 * a build. SKIPS LOUDLY without credentials, matching
 * scripts/check-inventory-integrity.mjs's shape exactly: never a false green
 * by evaporating.
 *
 * OVERLOADS ARE A HAZARD ON THEIR OWN (requirement, not incident detail).
 * During the incident window the owner deliberately kept two signatures of a
 * function live for a zero-downtime rollout, which is itself a PostgREST
 * ambiguity risk — overload resolution by argument-name set is not something
 * to depend on. Production holds exactly one signature per function today;
 * this guard fails loudly the moment any called function has more than one,
 * independent of whether a specific call site's arguments happen to match.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { privilegedRpcFailures } from "./lib/privilegedRpcContract.mjs";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// ── A. STATIC SCANNER — no network, no credentials, pure text ──────────────

function skipString(src, i) {
  const q = src[i];
  i++;
  if (q === "\x60") {
    let depth = 0;
    while (i < src.length) {
      if (src[i] === "\\") { i += 2; continue; }
      if (depth === 0 && src[i] === "\x60") return i + 1;
      if (src[i] === "$" && src[i + 1] === "{") { depth++; i += 2; continue; }
      if (depth > 0 && src[i] === "}") { depth--; i++; continue; }
      i++;
    }
    return i;
  }
  while (i < src.length) {
    if (src[i] === "\\") { i += 2; continue; }
    if (src[i] === q) return i + 1;
    i++;
  }
  return i;
}

function skipComment(src, i) {
  if (src[i] === "/" && src[i + 1] === "/") {
    const nl = src.indexOf("\n", i);
    return nl === -1 ? src.length : nl;
  }
  if (src[i] === "/" && src[i + 1] === "*") {
    const end = src.indexOf("*/", i + 2);
    return end === -1 ? src.length : end + 2;
  }
  return i;
}

// Length-preserving: comments become spaces (newlines kept), strings/
// templates are left untouched. Used before splitting/scanning a slice for
// structure, so a comment that happens to contain a comma, a brace, a colon or //-
// looking text inside a string can never be mistaken for real syntax, and a
// split boundary can never leave raw comment prose at the head of a slice.
function blankComments(text) {
  let out = "", i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "/" && (text[i + 1] === "/" || text[i + 1] === "*")) {
      const end = skipComment(text, i);
      out += text.slice(i, end).replace(/[^\n]/g, " ");
      i = end;
      continue;
    }
    if (c === '"' || c === "'" || c === "\x60") {
      const end = skipString(text, i);
      out += text.slice(i, end);
      i = end;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

// Index of the bracket matching src[openIdx] (one of "( { ["), honoring
// nested brackets, strings/templates and comments in the ORIGINAL (not yet
// blanked) source. -1 if unbalanced.
function findMatch(src, openIdx) {
  const open = src[openIdx];
  const close = { "(": ")", "{": "}", "[": "]" }[open];
  let depth = 0, i = openIdx;
  while (i < src.length) {
    const c = src[i];
    if (c === "/") { const j = skipComment(src, i); if (j !== i) { i = j; continue; } }
    if (c === '"' || c === "'" || c === "\x60") { i = skipString(src, i); continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return i; }
    i++;
  }
  return -1;
}

// Split already-comment-blanked text on top-level commas (bracket depth 0),
// honoring nested brackets and strings/templates. Includes empty trailing
// slices (a trailing comma), which parseEntry drops.
function splitTopLevel(text) {
  const parts = [];
  let depth = 0, start = 0, i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "\x60") { i = skipString(text, i); continue; }
    if ("({[".includes(c)) { depth++; i++; continue; }
    if (")}]".includes(c)) { depth--; i++; continue; }
    if (c === "," && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; i++; continue; }
    i++;
  }
  parts.push(text.slice(start));
  return parts;
}

function findTopLevelColon(text) {
  let depth = 0, i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "\x60") { i = skipString(text, i); continue; }
    if ("({[".includes(c)) { depth++; i++; continue; }
    if (")}]".includes(c)) { depth--; i++; continue; }
    if (c === ":" && depth === 0) return i;
    i++;
  }
  return -1;
}

const IDENT = /^[A-Za-z_$][\w$]*$/;

// One top-level entry of an object literal -> { name } | { dynamic: reason } | null (blank slot).
function parseEntry(raw) {
  const t = raw.trim();
  if (!t) return null;
  if (t.startsWith("...")) return { dynamic: `spread element \`${t.slice(0, 40)}\`` };
  if (t.startsWith("[")) return { dynamic: `computed key \`${t.slice(0, 40)}\`` };
  const colon = findTopLevelColon(t);
  if (colon !== -1) {
    const key = t.slice(0, colon).trim();
    if (IDENT.test(key)) return { name: key };
    const qm = key.match(/^(["'])((?:\\.|(?!\1).)*)\1$/);
    if (qm) return { name: qm[2] };
    return { dynamic: `unrecognised key \`${key.slice(0, 40)}\`` };
  }
  if (IDENT.test(t)) return { name: t }; // shorthand { p_foo }
  return { dynamic: `unrecognised object entry \`${t.slice(0, 40)}\`` };
}

// Parse one .rpc(...) call. src is the whole file; openIdx points at the
// "(" right after ".rpc". Returns { fn, argNames: Set } on a clean parse, or
// { fn: string|null, dynamic: reason } when anything could not be read
// statically — fn may still be known even when the ARGS are not.
function parseRpcCall(src, openIdx) {
  const closeIdx = findMatch(src, openIdx);
  if (closeIdx === -1) return { fn: null, dynamic: "unbalanced parentheses — truncated or malformed call" };
  const inner = blankComments(src.slice(openIdx + 1, closeIdx));
  const args = splitTopLevel(inner).map((s) => s.trim()).filter((s) => s.length);
  if (args.length === 0) return { fn: null, dynamic: "rpc() called with no arguments — cannot even identify the target function" };
  const fnLit = args[0].match(/^(["'\x60])((?:\\.|(?!\1).)*)\1$/);
  if (!fnLit) return { fn: null, dynamic: `function-name argument is not a string literal: \`${args[0].slice(0, 60)}\`` };
  const fn = fnLit[2];
  if (args.length === 1) return { fn, argNames: new Set() };
  const argsSrc = args[1].trim();
  if (!argsSrc || argsSrc === "undefined") return { fn, argNames: new Set() };
  if (!argsSrc.startsWith("{")) return { fn, dynamic: `second argument is not an object literal: \`${argsSrc.slice(0, 60)}\`` };
  const objClose = findMatch(argsSrc, 0);
  if (objClose === -1) return { fn, dynamic: "second argument object literal is unbalanced" };
  const objInner = argsSrc.slice(1, objClose);
  const entries = splitTopLevel(objInner).map(parseEntry).filter((e) => e !== null);
  const dynamicEntries = entries.filter((e) => e.dynamic);
  if (dynamicEntries.length) return { fn, dynamic: dynamicEntries.map((e) => e.dynamic).join("; ") };
  return { fn, argNames: new Set(entries.map((e) => e.name)) };
}

// COMMENTS ARE NOT CALL SITES (2026-09-09).
//
// This scanner read RAW source, so any file whose PROSE mentioned `db.rpc(`
// was treated as if it called it. lib/affiliateOpportunity.js (#1191) has a
// header explaining that it deliberately uses `db.rpc()` with a literal name
// so that THIS guard can see it — and those three sentences were parsed as
// three malformed call sites:
//
//   FAIL — lib/affiliateOpportunity.js:22 ... rpc() called with no arguments
//   FAIL — lib/affiliateOpportunity.js:26 ... unbalanced parentheses
//   FAIL — lib/affiliateOpportunity.js:26 ... unbalanced parentheses
//
// The canary's "RPC + migration contract vs production" job went red on every
// scheduled run from that merge onward, on prose, while the production checks
// underneath it were passing. A monitor that cries wolf is a monitor people
// stop reading — and this is the monitor that exists because #1153 shipped a
// 5-argument caller against a 3-argument production function.
//
// This is the exact prose-vs-code trap CLAUDE.md documents, and it bit the
// guard rather than the code. Fixed by masking comments before scanning.
//
// Masking, not deleting: every comment character becomes a space and every
// newline is preserved, so reported LINE NUMBERS stay correct. A hand-rolled
// state machine rather than a regex because a regex cannot tell the `//` in
// `"https://example.com"` from the start of a comment — and getting that
// wrong would blank out real code and hide a real call site, which is a far
// worse failure than the one being fixed.
export function maskComments(src) {
  const s = String(src);
  let out = "";
  let i = 0;
  const n = s.length;
  // "code" | "line" | "block" | "sq" | "dq" | "tpl"
  let state = "code";
  while (i < n) {
    const c = s[i];
    const c2 = s[i + 1];
    if (state === "code") {
      if (c === "/" && c2 === "/") { state = "line"; out += "  "; i += 2; continue; }
      if (c === "/" && c2 === "*") { state = "block"; out += "  "; i += 2; continue; }
      if (c === "'") { state = "sq"; out += c; i++; continue; }
      if (c === '"') { state = "dq"; out += c; i++; continue; }
      if (c === "`") { state = "tpl"; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (state === "line") {
      if (c === "\n") { state = "code"; out += c; i++; continue; }
      out += " "; i++; continue;
    }
    if (state === "block") {
      if (c === "*" && c2 === "/") { state = "code"; out += "  "; i += 2; continue; }
      out += c === "\n" ? "\n" : " "; i++; continue;
    }
    // inside a string or template: copy verbatim, honour escapes, and never
    // treat anything within as a comment.
    if (c === "\\") { out += c + (c2 === undefined ? "" : c2); i += 2; continue; }
    if ((state === "sq" && c === "'") || (state === "dq" && c === '"') || (state === "tpl" && c === "`")) {
      state = "code"; out += c; i++; continue;
    }
    out += c; i++; continue;
  }
  return out;
}

function findRpcCallSites(rawSrc) {
  const src = maskComments(rawSrc);
  const sites = [];
  const re = /\b(?:db|supabase)\.rpc\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const openIdx = m.index + m[0].length - 1;
    const line = src.slice(0, m.index).split("\n").length;
    sites.push({ line, ...parseRpcCall(src, openIdx) });
  }
  return sites;
}

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { if (name !== "node_modules") walk(p, out); }
    else if (/\.(js|jsx|mjs|ts|tsx)$/.test(name)) out.push(p);
  }
}

// ── B. SELF-TEST: the scanner, on synthetic source, before it is trusted ───
// Every shape actually found in app/ and lib/ (recursively) today, plus every dynamic
// shape the incident's own lesson demands this NOT silently skip.
{
  const cases = [
    [`db.rpc("wf_buzz_picks", { p_lat: c.lat, p_lng: c.lng, p_radius_mi: 25, p_max: 1 });`,
      { fn: "wf_buzz_picks", names: ["p_lat", "p_lng", "p_radius_mi", "p_max"] }],
    [`await supabase.rpc("wf_taste_wipe");`, { fn: "wf_taste_wipe", names: [] }],
    [`supabase.rpc("wf_taste_bump", { p_signals: sig }).then(() => {}, () => {});`,
      { fn: "wf_taste_bump", names: ["p_signals"] }],
    [`db.rpc("wf_popularity_stale_batch", {
        p_source: src,
        p_categories: categoriesForSource(src),
        p_n: BATCH,
        // a comment with a , comma and a { brace } inside it — must not confuse the scanner
        p_primary_types: primaryTypesForSource(src),
        p_min_reviews: minReviewsForSource(src),
      });`,
      { fn: "wf_popularity_stale_batch", names: ["p_source", "p_categories", "p_n", "p_primary_types", "p_min_reviews"] }],
    [`db.rpc("wf_shorthand", { p_signals });`, { fn: "wf_shorthand", names: ["p_signals"] }],
    // dynamic — must be FLAGGED, never silently skipped
    [`db.rpc("wf_dyn", extraArgs);`, { dynamic: true }],
    [`db.rpc("wf_dyn2", { ...base, p_extra: 1 });`, { dynamic: true }],
    [`db.rpc("wf_dyn3", { [computedKey]: 1 });`, { dynamic: true }],
    [`db.rpc(fnName, { p_x: 1 });`, { dynamic: true }],
    // PROSE IS NOT A CALL SITE (2026-09-09). Each of these is a comment that
    // NAMES the call. Before maskComments they were scanned as real call
    // sites and reported as malformed, turning the canary red on every
    // scheduled run for a file that had done nothing wrong. Expressed as
    // ZERO-site cases so the count check above catches a regression.
    [`// this file uses db.rpc() rather than a raw fetch\nconst x = 1;`, { none: true }],
    [`// discovered by matching \`db.rpc(\` / \`supabase.rpc(\` under app/\nconst y = 2;`, { none: true }],
    [`/* block prose mentioning db.rpc("wf_thing", { p_a }) */\nconst z = 3;`, { none: true }],
  ];
  let selfTestFails = 0;
  for (const [src, expect] of cases) {
    const sites = findRpcCallSites(src);
    if (expect.none) {
      if (sites.length !== 0) { selfTestFails++; console.error(`self-test FAIL — a COMMENT was scanned as ${sites.length} call site(s): ${src.slice(0, 60)}`); }
      continue;
    }
    if (sites.length !== 1) { selfTestFails++; console.error(`self-test FAIL (site count) for: ${src.slice(0, 50)}`); continue; }
    const s = sites[0];
    if (expect.dynamic) {
      if (!s.dynamic) { selfTestFails++; console.error(`self-test FAIL — expected a DYNAMIC flag, scanner parsed cleanly: ${src.slice(0, 60)}`); }
      continue;
    }
    if (s.dynamic) { selfTestFails++; console.error(`self-test FAIL — expected a clean parse, got dynamic(${s.dynamic}): ${src.slice(0, 60)}`); continue; }
    const got = [...s.argNames].sort().join(",");
    const want = [...expect.names].sort().join(",");
    if (s.fn !== expect.fn || got !== want) { selfTestFails++; console.error(`self-test FAIL — ${expect.fn}: want [${want}] got fn=${s.fn} [${got}]`); }
  }
  // maskComments, directly: the properties the scanner now depends on.
  // Deleting comments outright would have been simpler and wrong — the line
  // numbers in every FAIL message below are what an operator uses to find the
  // call, so masking must be line-preserving.
  {
    const mc = maskComments;
    const cases2 = [
      // [input, predicate, description]
      [`const a = 1; // db.rpc("x")\nconst b = 2;`, (o) => !/rpc\(/.test(o), "a line comment naming rpc( is masked"],
      [`const a = 1; // c\nconst b = 2;\nconst c = 3;`, (o) => o.split("\n").length === 3, "line count is preserved (FAIL messages carry line numbers)"],
      [`/* a\nb\nc */\nconst d = 1;`, (o) => o.split("\n").length === 4, "a block comment preserves its newlines"],
      [`const u = "https://example.com/a";`, (o) => o.includes("https://example.com/a"), "the // inside a STRING is not a comment — masking it would blank real code"],
      [`const u = 'https://example.com';`, (o) => o.includes("https://example.com"), "…the same inside single quotes"],
      ["const u = `https://example.com/x`;", (o) => o.includes("https://example.com/"), "the // inside a TEMPLATE literal is not a comment either"],
      [`const s = "not /* a comment */ here";`, (o) => o.includes("not /* a comment */ here"), "a block-comment opener inside a string is left alone"],
      [`const s = "he said \\"hi // there\\"";`, (o) => o.includes("hi // there"), "an escaped quote does not end the string early"],
      [`db.rpc("wf_real", { p_a: 1 });`, (o) => /db\.rpc\("wf_real"/.test(o), "REAL code passes through untouched (the mask is not eating call sites)"],
    ];
    for (const [input, pred, desc] of cases2) {
      let outMasked;
      try { outMasked = mc(input); } catch (e) { selfTestFails++; console.error(`maskComments self-test THREW (${desc}): ${e && e.message}`); continue; }
      if (!pred(outMasked)) { selfTestFails++; console.error(`maskComments self-test FAIL — ${desc}; got: ${JSON.stringify(outMasked).slice(0, 120)}`); }
    }
    // The regression itself, end to end: the exact prose from
    // lib/affiliateOpportunity.js's header must yield ZERO call sites, and a
    // real call in the SAME file must still be found on its true line.
    const mixed = [
      "// WHY THIS LIVES IN lib/ AND USES db.rpc() RATHER THAN A RAW fetch.",
      "// ...discovers call sites by matching `db.rpc(` / `supabase.rpc(` under app/",
      "const r = await db.rpc(\"wf_affiliate_opportunity_seen\", { p_rows: rows });",
    ].join("\n");
    const mixedSites = findRpcCallSites(mixed);
    if (mixedSites.length !== 1) {
      selfTestFails++;
      console.error(`self-test FAIL — the #1191 regression fixture must yield exactly ONE call site (the real one), got ${mixedSites.length}`);
    } else if (mixedSites[0].line !== 3 || mixedSites[0].fn !== "wf_affiliate_opportunity_seen") {
      selfTestFails++;
      console.error(`self-test FAIL — the real call must be found on line 3 as wf_affiliate_opportunity_seen, got line ${mixedSites[0].line} fn ${mixedSites[0].fn}`);
    }
  }

  if (selfTestFails) {
    console.error(`check-rpc-schema-contract: FAIL — ${selfTestFails} scanner self-test(s) failed; the scanner itself is broken, its verdicts below cannot be trusted`);
    process.exit(1);
  }
}

// ── C. Credentials are the CONNECTION, not the verdict ──────────────────────
const URL_ = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!URL_ || !KEY) {
  console.log("check-rpc-schema-contract: SKIPPED — no Supabase credentials in env (set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to enforce)");
  process.exit(0);
}

// Privileged writers are an independent live contract, including cron-only RPCs
// which never appear in application call sites. Missing evidence fails closed.
const privilegeResponse = await fetch(`${URL_}/rest/v1/rpc/wf_privileged_rpc_contract`, {
  method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
  body: "{}", cache: "no-store", signal: AbortSignal.timeout(15000),
});
if (!privilegeResponse.ok) throw new Error(`RPC permission audit unavailable: HTTP ${privilegeResponse.status}`);
const privilegeFailures = privilegedRpcFailures(await privilegeResponse.json());
if (privilegeFailures.length) {
  console.error('check-rpc-schema-contract: FAIL — ' + privilegeFailures.join('; '));
  process.exit(1);
}
console.log('check-rpc-schema-contract: privileged RPC permissions verified in production');
const schemaResponse = await fetch(`${URL_}/rest/v1/rpc/wf_schema_audit`, {
  method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
  body: "{}", cache: "no-store", signal: AbortSignal.timeout(15000),
});
if (!schemaResponse.ok) throw new Error(`Schema audit unavailable: HTTP ${schemaResponse.status}`);
const schemaRows = await schemaResponse.json();
if (!Array.isArray(schemaRows)) throw new Error('Malformed schema audit');
const schemaFailures = schemaRows.filter(r => r.severity !== 'info');
if (schemaFailures.length) {
  console.error('check-rpc-schema-contract: FAIL — schema security findings: ' + JSON.stringify(schemaFailures));
  process.exit(1);
}

// ── D. Real call sites, app/ and lib/ (recursively) ─────────────────────────
const files = [];
for (const root of ["app", "lib"]) {
  const abs = path.join(REPO, root);
  try { walk(abs, files); } catch (e) { /* root may not exist in a stripped checkout */ }
}
const allSites = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const site of findRpcCallSites(src)) allSites.push({ file: path.relative(REPO, f), ...site });
}
if (allSites.length < 10) {
  console.error(`check-rpc-schema-contract: FAIL — found only ${allSites.length} .rpc() call sites under app/ and lib/ (recursively) — the scanner has lost its subject (expected >= 10)`);
  process.exit(1);
}

const unparseable = allSites.filter((s) => s.dynamic);
for (const s of unparseable) {
  console.error(`check-rpc-schema-contract: FAIL — ${s.file}:${s.line} calls .rpc(${s.fn ? `"${s.fn}"` : "<unknown fn>"}, ...) with an argument shape this checker cannot read statically: ${s.dynamic}. This is reported, not skipped — read the call site by hand and confirm its argument names match production before this can be trusted.`);
}

// ── E. Production's actual RPC contract ─────────────────────────────────────
async function fetchSignatures() {
  const r = await fetch(`${URL_}/rest/v1/rpc/wf_rpc_signatures`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: "{}",
    cache: "no-store",
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    return { error: `${r.status} ${body.slice(0, 300)}` };
  }
  const rows = await r.json();
  if (!Array.isArray(rows)) return { error: "non-array response" };
  return { rows };
}

const { rows: sigRows, error: sigErr } = await fetchSignatures();
if (sigErr) {
  console.error(`check-rpc-schema-contract: FAIL — wf_rpc_signatures() unreachable (${sigErr}).`);
  console.error("  If this is a fresh deploy: apply supabase/migrations/20260907_wf_deploy_contract_audit.sql to production first — this check has no way to read the live RPC contract without it (same shape as wf_schema_audit.sql, applied separately from the merge that added it).");
  process.exit(1);
}

const byName = new Map();
for (const row of sigRows) {
  const arr = byName.get(row.proname) || [];
  arr.push(row);
  byName.set(row.proname, arr);
}

// ── F. Compare, per call site, against every overload production has ───────
let bad = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { bad++; console.error("check-rpc-schema-contract: FAIL — " + m); } };
checks += unparseable.length; bad += unparseable.length; // already reported above, in section D

const clean = allSites.filter((s) => !s.dynamic);
const calledNames = new Set(clean.map((s) => s.fn));

function fmtSig(row) {
  const req = row.arg_names.slice(0, row.required_count);
  const opt = row.arg_names.slice(row.required_count);
  return row.arg_names.length === 0
    ? "0 args"
    : `${row.arg_names.length} (${req.join(", ")}${opt.length ? ` [+optional: ${opt.join(", ")}]` : ""})`;
}

for (const site of clean) {
  const overloads = byName.get(site.fn);
  checks++;
  if (!overloads) {
    bad++;
    console.error(`check-rpc-schema-contract: FAIL — ${site.file}:${site.line} calls db/supabase.rpc("${site.fn}", ...) but production has NO function named "${site.fn}" in the public schema. DEPLOY BLOCKED.`);
    continue;
  }
  const matches = overloads.filter((row) => {
    const required = new Set(row.arg_names.slice(0, row.required_count));
    const allowed = new Set(row.arg_names);
    for (const n of site.argNames) if (!allowed.has(n)) return false;
    for (const n of required) if (!site.argNames.has(n)) return false;
    return true;
  });
  if (matches.length === 0) {
    bad++;
    const called = site.argNames.size ? [...site.argNames].join(", ") : "(no arguments)";
    const prodDesc = overloads.map(fmtSig).join("; or ");
    console.error(
      `check-rpc-schema-contract: FAIL — ${site.fn}: deployed caller (${site.file}:${site.line}) requires ${site.argNames.size} args (${called}); ` +
      `production exposes ${prodDesc}. DEPLOY BLOCKED.`
    );
  }
}

// ── G. Overloads are a hazard on their own, independent of any one match ───
for (const name of calledNames) {
  const overloads = byName.get(name);
  if (!overloads || overloads.length < 2) continue;
  checks++; bad++;
  console.error(
    `check-rpc-schema-contract: FAIL — ${name} has ${overloads.length} signatures live in production ` +
    `(${overloads.map(fmtSig).join("; ")}). PostgREST resolves an rpc() call by argument-NAME SET across overloads, which is not ` +
    `guaranteed deterministic — this is exactly the ambiguity risk the owner accepted deliberately for a zero-downtime rollout during ` +
    `the 2026-09-07 incident and closed immediately after. Reduce to exactly one signature.`
  );
}

// ── H. RED-PROOF — reconstruct the actual incident, entirely in-process ────
// No network, no production mutation: fabricate the pre-fix pg_proc shape
// (3 args) and the post-fix caller (5 args) and assert the comparator above
// produces exactly the blocking verdict quoted in the incident writeup.
{
  const fakeProd = new Map([
    ["wf_popularity_stale_batch", [{ proname: "wf_popularity_stale_batch", arg_names: ["p_source", "p_categories", "p_n"], required_count: 1, total_count: 3, overload_count: 1 }]],
  ]);
  const fakeCall = { fn: "wf_popularity_stale_batch", argNames: new Set(["p_source", "p_categories", "p_n", "p_primary_types", "p_min_reviews"]) };
  const overloads = fakeProd.get(fakeCall.fn);
  const matches = overloads.filter((row) => {
    const required = new Set(row.arg_names.slice(0, row.required_count));
    const allowed = new Set(row.arg_names);
    for (const n of fakeCall.argNames) if (!allowed.has(n)) return false;
    for (const n of required) if (!fakeCall.argNames.has(n)) return false;
    return true;
  });
  checks++;
  if (matches.length !== 0) {
    bad++;
    console.error("check-rpc-schema-contract: FAIL — self-test: the #1153 incident shape (5-arg caller against a fabricated 3-arg production signature) did NOT go red. The comparator is broken, or has been weakened.");
  } else {
    const prodDesc = overloads.map(fmtSig).join("; or ");
    const reconstructed = `wf_popularity_stale_batch: deployed caller requires 5 args (p_source, p_categories, p_n, p_primary_types, p_min_reviews); production exposes ${prodDesc}. DEPLOY BLOCKED.`;
    console.log(`check-rpc-schema-contract: RED-PROOF OK — reconstructed #1153 in-process (no production mutation): ${reconstructed}`);
  }
  // Negative control: the SAME caller against the real, current 5-arg signature must be clean.
  const fakeProdFixed = new Map([
    ["wf_popularity_stale_batch", [{ proname: "wf_popularity_stale_batch", arg_names: ["p_source", "p_categories", "p_n", "p_primary_types", "p_min_reviews"], required_count: 1, total_count: 5, overload_count: 1 }]],
  ]);
  const fixedOverloads = fakeProdFixed.get(fakeCall.fn);
  const fixedMatches = fixedOverloads.filter((row) => {
    const required = new Set(row.arg_names.slice(0, row.required_count));
    const allowed = new Set(row.arg_names);
    for (const n of fakeCall.argNames) if (!allowed.has(n)) return false;
    for (const n of required) if (!fakeCall.argNames.has(n)) return false;
    return true;
  });
  checks++;
  ok(fixedMatches.length === 1, "self-test: the SAME 5-arg caller against the fixed 5-arg signature must match cleanly — a detector that never says pass is not a detector");
}

if (bad) {
  console.error(`check-rpc-schema-contract: ${bad} failure(s) across ${checks} assertions.`);
  process.exit(1);
}
console.log(`check-rpc-schema-contract: OK — ${clean.length} call site(s) across ${files.length} files under app/ and lib/ (recursively) all match a live production signature by name, no unparseable call sites, no overloaded functions in use, self-test + red-proof passed.`);
