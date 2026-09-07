// scripts/lib/sentryStubHook.mjs — a Node module-resolution hook that redirects
// the specifier "@sentry/nextjs" to sentryTestStub.mjs. Same technique as the
// existing scripts/lib/nodeResolveHook.mjs (module.register + a `resolve`
// hook), scoped to one package instead of client-module compatibility.
//
// Registered ONLY by scripts/test-job-watch-fallback.mjs, inside a hermetic
// CHILD PROCESS, before that child imports app/api/cron/job-watch/route.js —
// so route.js's real, unmodified `import * as Sentry from "@sentry/nextjs"`
// resolves to the stub for exactly that one process, and nowhere else.
//
// ALSO resolves extensionless relative specifiers (`from "../../lib/jobPulse"`)
// the same way nodeResolveHook.mjs does. route.js is a SERVER module written
// for Next.js's bundler, which resolves those without help; plain Node does
// not. Duplicated rather than composed with nodeResolveHook.mjs on purpose —
// stacking two independently-registered hook chains makes execution order a
// thing this file would have to get right and keep right, for a few lines
// this cheap to just own outright.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as presolve } from "node:path";

export async function resolve(specifier, context, next) {
  if (specifier === "@sentry/nextjs") {
    const here = dirname(fileURLToPath(import.meta.url));
    return { url: pathToFileURL(presolve(here, "sentryTestStub.mjs")).href, shortCircuit: true };
  }
  if (specifier.startsWith(".") && !/\.(js|mjs|cjs|json)$/.test(specifier)) {
    const base = context.parentURL ? dirname(fileURLToPath(context.parentURL)) : process.cwd();
    for (const ext of [".js", ".mjs", "/index.js"]) {
      const p = presolve(base, specifier + ext);
      if (existsSync(p)) return next(pathToFileURL(p).href, context);
    }
  }
  return next(specifier, context);
}
