// scripts/lib/nodeResolveHook.mjs — lets a plain-node guard import the app's
// CLIENT modules, which are written for a bundler.
//
// Two things a bundler does that node does not:
//   1. extensionless relative specifiers — `import … from "./google"`
//   2. named imports out of a CJS package (@googlemaps/js-api-loader)
//
// Both are resolved here so a guard can exercise REAL app code instead of a
// re-implementation of it. Only the third-party Maps SDK is stubbed, and only
// because lib/google.js uses it exclusively as a FALLBACK: searchPlaces()
// reaches Google through fetch("/api/places/search") (lib/google.js:531), which
// is the path a fetch trap can observe. Every line of Wayfind's own code runs
// unmodified.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as presolve } from "node:path";

const SDK = "@googlemaps/js-api-loader";
const SDK_STUB = "data:text/javascript,export class Loader{constructor(){}async importLibrary(){throw new Error('MapsSDK stub: the guard must not reach the SDK fallback path');}}";

export async function resolve(spec, ctx, next) {
  if (spec === SDK) return { url: SDK_STUB, shortCircuit: true };
  if (spec.startsWith(".") && !/\.(js|mjs|cjs|json)$/.test(spec)) {
    const base = ctx.parentURL ? dirname(fileURLToPath(ctx.parentURL)) : process.cwd();
    for (const ext of [".js", ".mjs", "/index.js"]) {
      const p = presolve(base, spec + ext);
      if (existsSync(p)) return next(pathToFileURL(p).href, ctx);
    }
  }
  return next(spec, ctx);
}
