// scripts/lib/placeDataNodeHook.mjs — lets a plain-node guard import
// lib/placeData.js (and its transitive deps), which are written for the
// Next.js bundler, not for node's ESM resolver.
//
// Combines two things a bundler does that node does not, same approach as
// scripts/lib/nodeResolveHook.mjs (kept separate rather than edited, so this
// guard's extra react shim below can never affect the two existing guards
// that already depend on that file):
//   1. extensionless relative specifiers — `import … from "./site"`
//   2. `cache` from "react" — see scripts/lib/reactCacheStub.mjs for why
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as presolve } from "node:path";

const REACT_STUB = pathToFileURL(presolve(dirname(fileURLToPath(import.meta.url)), "reactCacheStub.mjs")).href;

export async function resolve(spec, ctx, next) {
  // Redirect every "react" import to the stub EXCEPT the stub's own
  // `export * from "react"` — matched by parentURL — which must reach the
  // real package or this recurses forever.
  if (spec === "react" && ctx.parentURL !== REACT_STUB) {
    return next(REACT_STUB, ctx);
  }
  if (spec.startsWith(".") && !/\.(js|mjs|cjs|json)$/.test(spec)) {
    const base = ctx.parentURL ? dirname(fileURLToPath(ctx.parentURL)) : process.cwd();
    for (const ext of [".js", ".mjs", "/index.js"]) {
      const p = presolve(base, spec + ext);
      if (existsSync(p)) return next(pathToFileURL(p).href, ctx);
    }
  }
  return next(spec, ctx);
}
