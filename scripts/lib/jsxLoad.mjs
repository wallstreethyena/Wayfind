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
  const BROWSER_STUBS = { "@googlemaps/js-api-loader": ["Loader"] };
  const stubFor = (spec) => {
    const names = BROWSER_STUBS[spec];
    if (!names) return null;
    const file = path.join(out, "stub-" + spec.replace(/[^a-z0-9]/gi, "_") + ".mjs");
    if (!existsSync(file)) {
      writeFileSync(file, names.map((n) => `export class ${n} { constructor() {} load() { return Promise.resolve({}); } }`).join("\n") + "\nexport default {};\n");
    }
    return file;
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
      .replace(/from\s+["'](\.[^"']+)["']/g, (m, spec) => {
      const base = path.resolve(path.dirname(abs), spec);
      const target = existsSync(base) ? base : (existsSync(base + ".js") ? base + ".js" : base + "/index.js");
      if (!existsSync(target)) return m;
      // Compile EVERY local dependency, not just the ones containing JSX. A
      // pass-through dep keeps its own Next-style extensionless imports
      // ("./businessStatus"), which plain node cannot resolve — the first version
      // only compiled JSX deps and died on exactly that.
      return `from "${emit(target)}"`;
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
