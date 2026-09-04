// scripts/lib/jsxLoad.mjs — load a real JSX component in a plain-node guard.
//
// Guards that only read source as TEXT are why a ReferenceError shipped to
// production on 2026-07-30 (see test-detail-render-smoke). To actually CALL a
// component, a guard has to compile it. TypeScript's transpileModule is already a
// dependency (check:jsx uses it) and strips JSX without a new package.
//
// It transpiles the entry and any local JSX dependency into a temp dir, rewrites
// relative specifiers so plain node can resolve them, and returns the module.
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

// The temp dir must live INSIDE the repo: node resolves bare specifiers like
// "react" by walking up from the importing file, and an OS-tmpdir build cannot
// see node_modules. First attempt used os.tmpdir() and failed with
// ERR_MODULE_NOT_FOUND for react.
export async function loadComponent(entryAbs, repoRoot) {
  const out = mkdtempSync(path.join(repoRoot, ".wf-jsx-"));
  process.on("exit", () => { try { rmSync(out, { recursive: true, force: true }); } catch (e) {} });
  const done = new Map();

  // Browser-only packages that cannot load under plain node. They are stubbed
  // rather than avoided, because the point is to reach the COMPONENT — the Maps
  // SDK is not what we are testing, and the transitive chain
  // (BookingCTA -> kit -> ... -> lib/google) drags it in. Named exports are
  // stubbed as no-op classes so an `import { Loader }` still binds.
  //
  // A value may be an ARRAY of named exports (stubbed as no-op classes so an
  // `import { Loader }` still binds) or a STRING of literal module source, for
  // a package whose default export has to be callable.
  const BROWSER_STUBS = {
    "@googlemaps/js-api-loader": ["Loader"],
    // next/dynamic — v8.94. Bare node cannot resolve the specifier at all (it
    // has no extension and Next's exports map is not in play here), so any
    // component using a lazy child was unloadable and its guard died on an
    // ERR_MODULE_NOT_FOUND rather than on anything about the component.
    //
    // The stub renders NOTHING, and that is not a convenience: a
    // next/dynamic(..., { ssr: false }) child renders nothing on the server
    // either. So a guard that asserts on this markup is asserting on the same
    // HTML the crawler gets — which is the thing these tests exist to check.
    // A lazy child's own behaviour belongs to that child's own guard.
    "next/dynamic": 'export default function dynamic() { return function DynamicStub() { return null; }; }\n',
    // next/server — 2026-09-04 (guard-honesty audit). Route handlers (not just
    // components) now get loaded here too, so a route's `import { NextResponse }
    // from "next/server"` needs to resolve. next's package.json has no bare
    // "server" export (only "server.js", and node's own resolver won't guess
    // the extension), so plain node throws ERR_MODULE_NOT_FOUND before the
    // route's own logic ever runs. This is NOT a no-op stub like next/dynamic
    // above — NextResponse.json(...) is what every route branch under test
    // returns, so the stub is a REAL implementation built on Node's native
    // Response/Request (available since Node 18), not a mock of the shape.
    "next/server": [
      "export class NextResponse extends Response {",
      "  static json(body, init) {",
      "    const status = (init && init.status) || 200;",
      "    const headers = Object.assign({ \"content-type\": \"application/json\" }, init && init.headers);",
      "    return new NextResponse(JSON.stringify(body), Object.assign({}, init, { status, headers }));",
      "  }",
      "}",
      "export class NextRequest extends Request {}",
      "",
    ].join("\n"),
  };
  const stubFor = (spec) => {
    const v = BROWSER_STUBS[spec];
    if (!v) return null;
    const file = path.join(out, "stub-" + spec.replace(/[^a-z0-9]/gi, "_") + ".mjs");
    if (!existsSync(file)) {
      writeFileSync(file, typeof v === "string"
        ? v
        : v.map((n) => `export class ${n} { constructor() {} load() { return Promise.resolve({}); } }`).join("\n") + "\nexport default {};\n");
    }
    return file;
  };

  // One resolver for both specifier shapes, so a relative import cannot resolve
  // one way in a static import and another way in a dynamic one.
  const localTarget = (abs, spec) => {
    const base = path.resolve(path.dirname(abs), spec);
    const target = existsSync(base) ? base : (existsSync(base + ".js") ? base + ".js" : base + "/index.js");
    return existsSync(target) ? target : null;
  };

  const emit = (abs) => {
    if (done.has(abs)) return done.get(abs);
    const src = readFileSync(abs, "utf8");
    // Rewrite relative specifiers: local JSX deps get compiled too, everything
    // else points back at the ORIGINAL file with an explicit .js so node resolves
    // it (the repo uses Next's extensionless imports).
    const rewritten = src
      .replace(/from\s+["']([^."'][^"']*)["']/g, (m, spec) => {
        const st = stubFor(spec);
        return st ? `from "${st}"` : m;
      })
      // Compile EVERY local dependency, not just the ones containing JSX. A
      // pass-through dep keeps its own Next-style extensionless imports
      // ("./businessStatus"), which plain node cannot resolve — the first version
      // only compiled JSX deps and died on exactly that.
      .replace(/from\s+["'](\.[^"']+)["']/g, (m, spec) => {
        const target = localTarget(abs, spec);
        return target ? `from "${emit(target)}"` : m;
      })
      // …and the same for DYNAMIC imports. v8.94: several server modules defer
      // a heavy dependency with `await import("./serverCache.js")` precisely so
      // the module stays importable in a bare-node guard — and that pattern was
      // the one specifier shape this rewriter did not touch, so the emitted copy
      // asked for "./serverCache.js" relative to the TEMP dir and died at the
      // moment the function was called (not at load, which is why it surfaced as
      // a render failure rather than an import one).
      .replace(/\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/g, (m, spec) => {
        const target = localTarget(abs, spec);
        return target ? `import("${emit(target)}")` : m;
      });
    const js = ts.transpileModule(rewritten, {
      compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    const file = path.join(out, path.basename(abs).replace(/\.jsx?$/, "") + "-" + done.size + ".mjs");
    // The React import the classic JSX transform needs.
    writeFileSync(file, 'import React from "react";\n' + js);
    done.set(abs, file);
    return file;
  };

  return import(emit(entryAbs));
}
