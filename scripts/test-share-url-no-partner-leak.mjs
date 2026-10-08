#!/usr/bin/env node
// Lock: a shared/saved commercial card never carries origin + partner path or partner params.
// 2026-10-08: Viator tour Share handed navigator.share
// https://www.gowayfind.com/tours/St-Petersburg/Clear-Kayak-Tours-of-Shell-Key/d5403-173028P1?mcid=..&pid=..
// (404 on our site, partner params leaked). CALL-level: invokes the real resolvedUrl from
// lib/contentCardActions.js (the function share() and the saved item_url both use).
// Red-prove: restore `new URL(raw, window.location.origin)` in resolvedUrl.
import { loadComponent } from "./lib/jsxLoad.mjs";
import path from "node:path";

globalThis.window = { location: { origin: "https://www.gowayfind.com", href: "https://www.gowayfind.com/" } };
const { resolvedUrl } = await loadComponent(path.join(process.cwd(), "lib/contentCardActions.js"), process.cwd());
let n = 0; const bad = [];
const ok = (c, m) => { n++; if (!c) bad.push(m); };

// Positive control: the probes must FIND a leak when one exists (the pre-fix output).
const leaks = (u) => [...u.matchAll(/(?:mcid|pid|api_version)=|\/tours\//g)].map((m) => m[0]);
const preFix = new URL(viatorRelRaw(), "https://www.gowayfind.com").toString();
function viatorRelRaw() { return "/tours/St-Petersburg/Clear-Kayak-Tours-of-Shell-Key/d5403-173028P1?mcid=42383&pid=P00320881&medium=api&api_version=2.0"; }
ok(leaks(preFix).length >= 4, "positive control: probes must flag the old origin-join output");
const viatorRel = "/tours/St-Petersburg/Clear-Kayak-Tours-of-Shell-Key/d5403-173028P1?mcid=42383&pid=P00320881&medium=api&api_version=2.0";
const cases = [
  ["viator relative", { id: "173028P1", code: "173028P1", type: "experience", title: "Clear Kayak Tours of Shell Key", provider: "viator", url: viatorRel }],
  ["viator relative, id only", { id: "173028P1", type: "experience", title: "Clear Kayak Tours of Shell Key", provider: "viator", url: viatorRel }],
  ["viator relative, no id-like code", { id: "a b", type: "experience", title: "Clear Kayak Tours of Shell Key", provider: "viator", url: viatorRel }],
  ["viator absolute", { id: "173028P1", type: "experience", title: "Kayak", provider: "viator", url: "https://www.viator.com/tours/St-Petersburg/x/d5403-173028P1?pid=P00320881&mcid=42383&medium=link" }],
];
for (const [name, item] of cases) {
  const out = resolvedUrl(item);
  let u = null; try { u = new URL(out); } catch {}
  ok(!!u && u.hostname === "www.gowayfind.com", `${name}: host must be gowayfind.com, got ${out}`);
  ok(!!u && /^\/api\/[a-z]+\/go$/.test(u.pathname), `${name}: must be an /api/*/go path, got ${out}`);
  ok(leaks(out).length === 0, `${name}: partner params/path leaked: ${out}`);
}
const withCode = new URL(resolvedUrl(cases[0][1]));
ok(withCode.pathname === "/api/commerce/go" && withCode.searchParams.get("offer") === "173028P1" && withCode.searchParams.get("provider") === "viator", "product code must route via /api/commerce/go?provider=viator&offer=<code>");

for (const url of ["/place/ChIJabc123", "/events/jazz-night?x=1", "https://www.gowayfind.com/guide/best-beaches"]) {
  const out = resolvedUrl({ id: "p1", type: "guide", title: "Place", url });
  const want = url.startsWith("http") ? url : "https://www.gowayfind.com" + url;
  ok(out === want, `place/own url must be unchanged: ${url} -> ${out}`);
}
ok(resolvedUrl({ id: "x", url: "" }) === "https://www.gowayfind.com/", "empty url falls back to current page");

if (bad.length) { console.error("FAIL test-share-url-no-partner-leak:\n  " + bad.join("\n  ")); process.exit(1); }
console.log(`OK test-share-url-no-partner-leak: ${n} assertions (positive control + 4 partner shapes x 3 checks + code route + 3 own urls + empty)`);
