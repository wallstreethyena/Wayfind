// THE FOCUS GUARD. The permanent answer to "FOCUS is not defined".
//
// 2026-08-26, twice in one day, live: #952 rewrote ThingsToDoList's kit import
// from eight names to one while the module still used two of the dropped ones,
// and the whole app was replaced by the ErrorBoundary the moment anyone tapped
// Activities. The same sweep found openCuisine reading `displayList`, declared
// ~5,200 lines below its use, throwing since July on every cuisine-chip tap.
//
// NOTHING IN THE REPO COULD HAVE CAUGHT EITHER ONE:
//   • `next build` does not resolve identifiers across module scopes — a bare
//     reference to a name that does not exist is VALID JavaScript until it runs.
//   • check:jsx runs tsc without --checkJs, so TS2304 "Cannot find name" is off.
//   • check-lib-call-imports, written for exactly this class, only inspects bare
//     CALLS to lib/ FUNCTIONS. FOCUS.outline is a property read on a kit.js
//     object: it misses on both axes.
//
// So this is the missing no-undef, run over the real module graph with a real
// parser and real scope analysis — never a regex. It is cheap (~1s for the
// whole client tree) because scope resolution is what @babel/traverse already
// does to build its bindings.
//
// It reports FILE:LINE for anything referenced with no binding anywhere in an
// enclosing scope and not on the allowlist below.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const parser = await import("@babel/parser");
// @babel/traverse ships CJS; under ESM its default can arrive wrapped once more
// depending on the resolver, so unwrap defensively rather than assuming a shape.
const _t = await import("@babel/traverse");
const traverse = typeof _t.default === "function" ? _t.default
  : typeof _t.default?.default === "function" ? _t.default.default
  : _t.traverse;

// Real runtime globals. Anything NOT here and not bound is a crash waiting for
// the first reader who touches that branch. Keep this list boring and explicit:
// widening it to silence a finding is how the next FOCUS ships.
const GLOBALS = new Set([
  // language
  "globalThis","undefined","NaN","Infinity","arguments","Object","Array","String","Number","Boolean",
  "Symbol","BigInt","Math","JSON","Date","RegExp","Error","TypeError","RangeError","SyntaxError",
  "Promise","Map","Set","WeakMap","WeakSet","Proxy","Reflect","Intl","escape","unescape",
  "parseInt","parseFloat","isNaN","isFinite","encodeURIComponent","decodeURIComponent","encodeURI","decodeURI",
  "ArrayBuffer","Uint8Array","Uint8ClampedArray","Int8Array","Uint16Array","Int16Array","Uint32Array",
  "Int32Array","Float32Array","Float64Array","DataView","TextEncoder","TextDecoder","structuredClone",
  // browser
  "window","document","navigator","location","history","screen","console","alert","confirm","prompt",
  "localStorage","sessionStorage","indexedDB","fetch","Headers","Request","Response","FormData","Blob","File",
  "FileReader","URL","URLSearchParams","AbortController","AbortSignal","Image","Audio","Path2D","CanvasRenderingContext2D",
  "setTimeout","clearTimeout","setInterval","clearInterval","requestAnimationFrame","cancelAnimationFrame",
  "requestIdleCallback","cancelIdleCallback","queueMicrotask","matchMedia","getComputedStyle","scrollTo",
  "IntersectionObserver","ResizeObserver","MutationObserver","PerformanceObserver","performance",
  "CustomEvent","Event","EventTarget","MessageChannel","BroadcastChannel","WebSocket","Worker",
  "atob","btoa","crypto","postMessage","open","close","print","devicePixelRatio","innerWidth","innerHeight",
  "HTMLElement","Node","Element","DOMParser","XMLSerializer","SVGElement","Notification","caches",
  // node / bundler
  "process","Buffer","module","exports","require","__dirname","__filename","global",
  // framework
  "React","JSX",
]);

const files = [];
const walk = (dir) => {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
    const p = path.join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(js|jsx|mjs)$/.test(e)) files.push(p);
  }
};
for (const d of ["app", "lib"]) walk(path.join(ROOT, d));

const findings = [];
let scanned = 0, refs = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  let ast;
  try {
    ast = parser.parse(src, {
      sourceType: "unambiguous",
      allowReturnOutsideFunction: true,
      plugins: ["jsx", "classProperties", "optionalChaining", "nullishCoalescingOperator", "topLevelAwait", "dynamicImport"],
    });
  } catch (e) {
    findings.push({ file, line: e.loc ? e.loc.line : 0, name: "<parse error> " + e.message });
    continue;
  }
  scanned++;
  traverse(ast, {
    ReferencedIdentifier(p) {
      refs++;
      const n = p.node.name;
      if (GLOBALS.has(n)) return;
      if (p.scope.hasBinding(n, true)) return;
      findings.push({ file, line: p.node.loc ? p.node.loc.start.line : 0, name: n });
    },
  });
}

const rel = (f) => path.relative(ROOT, f);
if (findings.length) {
  console.error("check-unbound-refs: FAIL — " + findings.length + " reference(s) with no binding:");
  for (const f of findings.slice(0, 40)) console.error("  " + rel(f.file) + ":" + f.line + "  " + f.name);
  if (findings.length > 40) console.error("  … and " + (findings.length - 40) + " more");
  console.error("\n  Each of these is a ReferenceError the moment that line runs.");
  console.error("  Import it, declare it, or — only if it is a REAL runtime global — add it to GLOBALS.");
  process.exit(1);
}
console.log("check-unbound-refs: OK — " + refs.toLocaleString() + " identifier references across " + scanned + " files in app/ + lib/, every one bound (the no-undef next build cannot do)");
