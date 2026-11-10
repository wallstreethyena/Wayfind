#!/usr/bin/env node
// scripts/check-bare-path-redirects.mjs — a bare path people type must land on
// a real page. 2026-11-04 audit: /christmas returned 404 while the hub lives at
// /christmas-in-florida. Asserted by CALLING next.config.js redirects(): every
// plain-path redirect (no params, no host condition) must point at a route that
// exists under app/, and /christmas must reach the Christmas hub.
// STRUCTURAL-ONLY: executes next.config.js redirects() (the deployed Next config, which lives outside lib/ and app/) and probes app/ route files; the honesty scan only recognises lib/ or app/ imports.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0; const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const mod = await import(path.join(root, "next.config.js"));
const cfg = mod.default || mod;
const list = await cfg.redirects();
const plain = list.filter((r) => /^\/[a-z0-9-]+$/.test(r.source) && /^\/[a-z0-9-/]+$/.test(r.destination) && !r.has);
ok(plain.length >= 8, `found ${plain.length} plain-path redirects (positive control: the category set plus /christmas)`);
const routeExists = (p) => existsSync(path.join(root, "app", ...p.split("/").filter(Boolean), "page.js"));
for (const r of plain) ok(routeExists(r.destination), `${r.source} -> ${r.destination}: no app${r.destination}/page.js`);
const xmas = list.find((r) => r.source === "/christmas");
ok(!!xmas && xmas.destination === "/christmas-in-florida", "/christmas redirects to the Christmas hub /christmas-in-florida");
ok(!routeExists("/christmas"), "no app/christmas page shadows the redirect (negative control)");
ok(!routeExists("/no-such-hub-route"), "the route probe reports a missing route as missing (negative control)");

if (fail.length) { console.error(`check-bare-path-redirects: FAIL — ${fail.length}:\n  ` + fail.join("\n  ")); process.exit(1); }
console.log(`check-bare-path-redirects: OK — ${pass} assertions; ${plain.length} plain-path redirects from next.config.js redirects() all land on an existing app route; /christmas reaches /christmas-in-florida`);
