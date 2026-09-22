#!/usr/bin/env node
// A guide with its own app/guides/<slug>/page.js must not also be prerendered
// by the generic app/guides/[slug] template. When both build the same URL, the
// generic output wins in production and the dedicated page never ships
// (Pinto's Farm, 2026-09-22). This guard keeps every dedicated guide folder
// excluded from [slug]'s generateStaticParams.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import assert from "node:assert/strict";
import { GUIDES } from "../lib/guides.js";
import { DEDICATED_GUIDE_ROUTES } from "../lib/guideDedicatedRoutes.js";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const root = new URL("../", import.meta.url);
const guidesDir = new URL("app/guides/", root);

const dedicated = readdirSync(guidesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("[") && !d.name.startsWith("("))
  .filter((d) => existsSync(new URL(d.name + "/page.js", guidesDir)))
  .map((d) => d.name);

for (const slug of dedicated) {
  if (!GUIDES[slug]) continue;
  ok(DEDICATED_GUIDE_ROUTES.has(slug), `app/guides/${slug}/page.js is a dedicated route for a GUIDES slug but is missing from DEDICATED_GUIDE_ROUTES, so [slug] would overwrite it`);
}
for (const slug of DEDICATED_GUIDE_ROUTES) {
  ok(dedicated.includes(slug), `DEDICATED_GUIDE_ROUTES lists ${slug} but app/guides/${slug}/page.js does not exist`);
}

const generic = readFileSync(new URL("[slug]/page.js", guidesDir), "utf8");
const params = generic.match(/export function generateStaticParams\(\)\s*\{[\s\S]*?\n\}/);
ok(!!params, "[slug] declares generateStaticParams");
ok(/DEDICATED_GUIDE_ROUTES\.has\(slug\)/.test(params[0]), "[slug] generateStaticParams skips dedicated guide routes");
ok(/from "\.\.\/\.\.\/\.\.\/lib\/guideDedicatedRoutes"/.test(generic), "[slug] imports the shared dedicated-route list");

console.log("check-guide-dedicated-routes: OK — " + checks + " dedicated guide route assertions (" + [...DEDICATED_GUIDE_ROUTES].join(", ") + ")");
