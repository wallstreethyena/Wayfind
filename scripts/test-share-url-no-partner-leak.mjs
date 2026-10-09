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
  ["viator relative, row id", { id: "9f1c-uuid", type: "experience", title: "Clear Kayak Tours of Shell Key", provider: "viator", url: viatorRel }],
  ["viator relative, odd id", { id: "a b", type: "experience", title: "Clear Kayak Tours of Shell Key", provider: "viator", url: viatorRel }],
  ["viator absolute", { id: "173028P1", type: "experience", title: "Kayak", provider: "viator", url: "https://www.viator.com/tours/St-Petersburg/x/d5403-173028P1?pid=P00320881&mcid=42383&medium=link" }],
];
for (const [name, item] of cases) {
  const out = resolvedUrl(item);
  let u = null; try { u = new URL(out); } catch {}
  ok(!!u && u.hostname === "www.gowayfind.com", `${name}: host must be gowayfind.com, got ${out}`);
  ok(!!u && /^\/api\/[a-z]+\/go$/.test(u.pathname), `${name}: must be an /api/*/go path, got ${out}`);
  ok(leaks(out).length === 0, `${name}: partner params/path leaked: ${out}`);
}
// id is NOT a product code: no field code, no code in the path -> search go, never offer=<id>.
const idOnly = new URL(resolvedUrl({ id: "row-42", type: "experience", title: "Kayak Tour", provider: "viator", url: "/tours/X/kayak-tour" }));
ok(idOnly.pathname === "/api/viator/go" && idOnly.searchParams.get("intent") === "search", "id-only item must use the experience search go route");
ok(idOnly.searchParams.get("offer") === null && idOnly.search.split("row-42").length === 1, "id must never become commerce offer=<non-code>");
const idOnlyAbs = new URL(resolvedUrl({ id: "row-42", type: "experience", title: "Kayak", provider: "viator", url: "https://www.viator.com/tours/X/kayak?pid=P1&mcid=1" }));
ok(idOnlyAbs.pathname === "/api/viator/go" && idOnlyAbs.searchParams.get("product") && idOnlyAbs.searchParams.get("offer") === null, "absolute url with no code: product go route, no id offer");
ok(leaks(decodeURIComponent(idOnlyAbs.search)).length === 1, "absolute url with no code: partner params stripped from the product param");
const pathCode = new URL(resolvedUrl({ id: "row-42", type: "experience", title: "K", provider: "viator", url: "/tours/X/k/d1-ABC123?pid=P1" }));
ok(pathCode.searchParams.get("offer") === "ABC123", "code parsed from the d<dest>-<CODE> path is the offer");
const fieldCode = new URL(resolvedUrl({ id: "row-42", product_code: "55555P2", type: "experience", title: "K", provider: "viator", url: "/tours/X/k" }));
ok(fieldCode.searchParams.get("offer") === "55555P2", "product_code field is used as the offer");
const own = "https://www.gowayfind.com/guide/x?campaign=spring&cid=7";
ok(resolvedUrl({ id: "g", type: "guide", title: "G", url: own }) === own, "own-site link keeps ?campaign=/cid= unchanged");
ok(resolvedUrl({ id: "g", type: "guide", title: "G", url: "/guide/x?campaign=spring&cid=7" }) === own, "relative own-site link keeps query unchanged");

const withCode = new URL(resolvedUrl(cases[0][1]));
ok(withCode.pathname === "/api/commerce/go" && withCode.searchParams.get("offer") === "173028P1" && withCode.searchParams.get("provider") === "viator", "product code must route via /api/commerce/go?provider=viator&offer=<code>");

for (const url of ["/place/ChIJabc123", "/events/jazz-night?x=1", "https://www.gowayfind.com/guide/best-beaches"]) {
  const out = resolvedUrl({ id: "p1", type: "guide", title: "Place", url });
  const want = url.startsWith("http") ? url : "https://www.gowayfind.com" + url;
  ok(out === want, `place/own url must be unchanged: ${url} -> ${out}`);
}
ok(resolvedUrl({ id: "x", url: "" }) === "https://www.gowayfind.com/", "empty url falls back to current page");

if (bad.length) { console.error("FAIL test-share-url-no-partner-leak:\n  " + bad.join("\n  ")); process.exit(1); }
console.log(`OK test-share-url-no-partner-leak: ${n} assertions (positive control, 4 partner shapes, id-only and field/path code routing, own-site queries untouched)`);
