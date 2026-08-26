#!/usr/bin/env node
// scripts/check-build-lifecycle.mjs
//
// THE INCIDENT (2026-08-26, #949). GitHub `guards` ran `npx next build` and
// went green. Vercel runs `npm run build`, which is the only invocation that
// fires `postbuild` → check-bundle. The homepage was 67 gzipped bytes over
// the 500KB ratchet. Production died; CI did not.
//
// npm only runs pre/post scripts when the build is invoked as `npm run build`.
// `npx next build` skips them. Lock all three seams: Vercel buildCommand,
// package.json postbuild, and the GitHub workflow actually calling
// check-bundle after the production build (a comment mentioning the file
// is not a call).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(REPO, rel), "utf8");
const stripHash = (s) => String(s || "").replace(/^\s*#.*$/gm, "");

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const vercel = JSON.parse(read("vercel.json"));
ok(vercel.buildCommand === "npm run build",
  `vercel.json buildCommand must be "npm run build" so postbuild runs (got ${JSON.stringify(vercel.buildCommand)})`);

const pkg = JSON.parse(read("package.json"));
ok(pkg.scripts && pkg.scripts.build === "next build",
  `package.json scripts.build must be "next build" (got ${JSON.stringify(pkg.scripts && pkg.scripts.build)})`);
ok(pkg.scripts && pkg.scripts.postbuild === "node scripts/check-bundle.mjs",
  `package.json postbuild must be the homepage ratchet (got ${JSON.stringify(pkg.scripts && pkg.scripts.postbuild)})`);

const yml = read(".github/workflows/guards.yml");
ok(/npx next build/.test(yml) || /npm run build/.test(yml),
  "guards.yml still has a production build step — probe can see the file (positive control)");
const ymlCode = stripHash(yml);
ok(/run:\s*node scripts\/check-bundle\.mjs/.test(ymlCode),
  "guards.yml must RUN `node scripts/check-bundle.mjs` after the production build — a comment is not a call; npx next build alone is how #949 shipped green and Vercel died");

const home = read("app/home.js");
const events = read("app/components/screens/Events.js");
const culture = read("lib/culture.js");
ok(!/cultureHubs/.test(home) && !/cultureHubs/.test(events),
  "homepage client (home.js / Events.js) must not import cultureHubs — SEO slugs are server-only so they stay off the 500KB ratchet");
ok(!/cultureCorpus/.test(home) && !/cultureCorpus/.test(events),
  "homepage client must not import cultureCorpus — the metro cards are server HTML");
ok(!/(?:export const)\s+CULTURE\s*=/.test(culture),
  "lib/culture.js must not declare CULTURE — that object is cultureCorpus.js so the homepage client does not ship every metro card");
ok(/(?:export const)\s+CULTURE_TITLES\s*=/.test(culture),
  "lib/culture.js declares CULTURE_TITLES — the only culture field AreaInsight reads on the client");

if (fail.length) {
  console.error("check-build-lifecycle: FAIL — " + fail.join("; "));
  process.exit(1);
}
console.log(`check-build-lifecycle: OK — ${pass} assertions (Vercel npm run build + postbuild check-bundle + GitHub runs the ratchet)`);
