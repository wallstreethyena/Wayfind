#!/usr/bin/env node
// ONE-SHOT codemod for perf/lazy-home-supabase-current-2026-09-08.
// Replays the reviewed #1185 transformation onto current main. It aborts on
// structural drift; the temporary workflow removes this file before commit.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
const write = (p, s) => writeFileSync(path.join(ROOT, p), s);
const once = (src, from, to, label) => {
  const n = src.split(from).length - 1;
  if (n !== 1) throw new Error(`${label}: expected exactly one match, found ${n}`);
  return src.replace(from, to);
};

function callbackHasSupabase(node) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    if (ts.isIdentifier(n) && n.text === "supabase") { found = true; return; }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function addSupabaseReadyToEffects(src) {
  const sf = ts.createSourceFile("app/home.js", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const edits = [];
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "useEffect" && node.arguments.length >= 2) {
      const cb = node.arguments[0];
      const deps = node.arguments[1];
      if ((ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) && ts.isArrayLiteralExpression(deps) && callbackHasSupabase(cb.body)) {
        const already = deps.elements.some((e) => ts.isIdentifier(e) && e.text === "supabaseReady");
        if (!already) edits.push({ pos: deps.end - 1, text: (deps.elements.length ? ", " : "") + "supabaseReady" });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  if (edits.length < 5) throw new Error(`home effects: expected multiple Supabase effects, found only ${edits.length}; current tree drifted`);
  edits.sort((a, b) => b.pos - a.pos);
  for (const e of edits) src = src.slice(0, e.pos) + e.text + src.slice(e.pos);
  return { src, count: edits.length };
}

// 1) Async trend demand read crosses the dynamic boundary. Synchronous creator
// corroboration remains synchronous, so ranking order never changes mid-load.
{
  let src = read("lib/trendSignal.js");
  src = once(src,
    'import { supabase } from "./supabase.js";',
    'import { getSupabase } from "./lazySupabase.js";',
    "trendSignal import");
  src = once(src,
    '    if (!supabase || !Array.isArray(ids) || !ids.length) return out;\n    const h = hourKey();',
    '    if (!Array.isArray(ids) || !ids.length) return out;\n    const supabase = await getSupabase();\n    if (!supabase) return out;\n    const h = hourKey();',
    "trendSignal fetchPopularityByIds guard");
  write("lib/trendSignal.js", src);
}

// 2) Homepage retains all existing null guards and authenticated write fences.
// Only the client acquisition moves behind hydration. Supabase-reading effects
// are discovered from the AST and rerun when the one memoized client arrives.
{
  let src = read("app/home.js");
  src = once(src,
    'import { supabase } from "../lib/supabase";',
    'import { getSupabase } from "../lib/lazySupabase";\nlet supabase = null;',
    "home Supabase import");

  const depEdit = addSupabaseReadyToEffects(src);
  src = depEdit.src;

  const sig = 'function PageInner({ initialEvents = null, localEditGuides = null, railMenu = null, initialPlaceId = null, initialPlaceAction = null }) {\n';
  const loader = `${sig}  const [supabaseReady, setSupabaseReady] = useState(false);\n  // PERF 2026-09-08: Supabase is not part of the homepage eager graph. Load it\n  // after hydration, then rerun only effects whose dependency lists were\n  // mechanically amended below because their callbacks actually read it.\n  useEffect(() => {\n    let active = true;\n    getSupabase().then((client) => {\n      if (!active) return;\n      supabase = client;\n      if (client) setSupabaseReady(true);\n    });\n    return () => { active = false; };\n  }, []);\n`;
  src = once(src, sig, loader, "PageInner loader insertion");

  if (/from\s+["']\.\.\/lib\/supabase(?:\.js)?["']/.test(src)) throw new Error("home still statically imports lib/supabase");
  if (!src.includes("if (supabase && user)")) throw new Error("home cloud-write auth fence disappeared");
  write("app/home.js", src);
  console.log(`apply-current-lazy-supabase: added supabaseReady to ${depEdit.count} Supabase-reading useEffect dependency arrays`);
}

// 3) Existing trend-integrity guard follows the same real client through the
// new dynamic boundary instead of requiring a static trendSignal -> supabase edge.
{
  let src = read("scripts/check-trend-integrity.mjs");
  const start = "// Prove the probe can find a positive (AGENTS.md §4d):";
  const end = "// The inverse direction: the trend modules must not read or write a score field.";
  const a = src.indexOf(start), b = src.indexOf(end);
  if (a < 0 || b <= a) throw new Error("trend-integrity positive-probe block drifted");
  const block = `// Prove the import-path probe can find a REAL positive (AGENTS.md §4d) after\n// Supabase moved behind the homepage's dynamic boundary. The trend module must\n// still reach the same real client for venue-demand reads, just not eagerly.\nconst trendCode = codeOf(read("lib/trendSignal.js"));\nconst trendIdents = identOf(read("lib/trendSignal.js"));\nconst lazyCode = codeOf(read("lib/lazySupabase.js"));\nconst lazyProbeRe = new RegExp(\`(?:import|require)[^\\\\n;]*['"\\\`][^'"\\\`]*lazySupabase(?:\\\\.js)?['"\\\`]\`);\nconst probeRe = new RegExp(\`(?:import|require)[^\\\\n;]*['"\\\`][^'"\\\`]*supabase(?:\\\\.js)?['"\\\`]\`);\nok(\n  lazyProbeRe.test(trendCode) && /\\bgetSupabase\\s*\\(\\s*\\)/.test(trendIdents) && probeRe.test(lazyCode),\n  "the import probe follows trendSignal -> getSupabase() -> lazySupabase's real dynamic supabase import — so the score-boundary absences are evidence, not a broken probe"\n);\n\n`;
  src = src.slice(0, a) + block + src.slice(b);
  write("scripts/check-trend-integrity.mjs", src);
}

// 4) City-gate machinery must re-run once lazy Supabase becomes available.
{
  let src = read("scripts/test-city-gate.mjs");
  src = once(src,
    'ok(/\\[screen, center, user, gateBump\\]/.test(home), "the gate effect still re-checks on gateBump — the re-check machinery stays for a future placement");',
    'ok(/\\[screen, center, user, gateBump, supabaseReady\\]/.test(home), "the gate effect still re-checks on gateBump and when lazy Supabase becomes ready");',
    "city-gate lazy readiness assertion");
  write("scripts/test-city-gate.mjs", src);
}

// 5) Wire the property guard beside the existing bundle walls.
{
  let src = read("scripts/guards.txt");
  if (!src.includes("node scripts/check-home-eager-supabase.mjs")) {
    const anchor = "node scripts/check-creator-registry-bundle-wall.mjs\n";
    if (!src.includes(anchor)) throw new Error("guards.txt bundle-wall anchor missing");
    src = src.replace(anchor, anchor + "# 2026-09-08 — Supabase must never re-enter the homepage eager static graph.\nnode scripts/check-home-eager-supabase.mjs\n");
    write("scripts/guards.txt", src);
  }
}

console.log("apply-current-lazy-supabase: reviewed current-main transformation complete");