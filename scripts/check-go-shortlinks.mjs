#!/usr/bin/env node
/**
 * check-go-shortlinks — /go/<slug> is a closed registry, never an open redirect.
 *
 * This guard calls the pure resolver for the behavior we can execute under raw
 * Node, then checks the Next route wiring for the HTTP-only pieces (redirect /
 * notFound). The important security property is that request input can select a
 * registered key only; it can never supply a destination, provider, or offer id.
 */
import { readFileSync } from "node:fs";
import { resolveGoSlug, GO_SHORTLINKS, RESERVED_GO_SLUGS } from "../lib/goShortlinks.js";

let pass = 0;
const failures = [];
const ok = (cond, msg) => { if (cond) pass++; else failures.push(msg); };

const known = resolveGoSlug("howl-o-scream");
ok(known.kind === "shortlink", "known social slug resolves as a shortlink");
ok(known.eventId === "howl-o-scream-tampa-2026", "shortlink points at the governed canonical event id");
ok(typeof known.href === "string" && known.href.startsWith("/api/commerce/go?"), "shortlink resolves only to Wayfind's commerce redirect");
const qs = new URLSearchParams(String(known.href || "").split("?")[1] || "");
ok(qs.get("provider") === "undercover_tourist", "existing event mapping supplies the provider");
ok(qs.get("offer") === "20", "existing event mapping supplies deal 20");
ok(qs.get("surface") === "social_shortlink", "social shortlink attribution surface is stamped");
ok(qs.get("content") === "howl-o-scream-tampa-2026", "canonical event id rides as content attribution");

const city = resolveGoSlug("orlando");
ok(city.kind === "city" && city.city && city.city.name === "Orlando", "known city still resolves to the paid landing");
ok(RESERVED_GO_SLUGS.includes("orlando"), "city slugs are reserved from shortlink registration");
ok(!Object.prototype.hasOwnProperty.call(GO_SHORTLINKS, "orlando"), "no shortlink collides with a reserved city");

for (const probe of [
  "not-a-real-wayfind-slug",
  "https://evil.example/phish",
  "//evil.example/phish",
  "javascript:alert(1)",
  "constructor",
  "__proto__",
]) {
  const r = resolveGoSlug(probe);
  ok(r.kind === "not-found", `unregistered/arbitrary input is refused: ${probe}`);
  ok(!("href" in r), `refused input never receives a redirect href: ${probe}`);
}

// Positive control: the resolver must not be a blanket deny.
ok(resolveGoSlug("howl-o-scream").kind !== "not-found", "positive control proves the registry can resolve a real entry");

const route = readFileSync("app/go/[city]/page.js", "utf8");
const registry = readFileSync("lib/goShortlinks.js", "utf8");
ok(/import\s*\{[^}]*\bnotFound\b[^}]*\bredirect\b[^}]*\}\s*from\s*["']next\/navigation["']/.test(route)
  || /import\s*\{[^}]*\bredirect\b[^}]*\bnotFound\b[^}]*\}\s*from\s*["']next\/navigation["']/.test(route),
  "/go route imports both redirect and notFound from next/navigation");
ok(/resolved\.kind\s*===\s*["']shortlink["']\)\s*redirect\(resolved\.href\)/.test(route),
  "known shortlinks redirect server-side through the resolved first-party href");
ok((route.match(/resolved\.kind\s*===\s*["']not-found["'][^\n;]*notFound\(\)/g) || []).length >= 2,
  "unknown slugs call notFound() in metadata and page execution — no soft 404");
ok(!/affiliate_url|anrdoezrs\.net|dpbolvw\.net|qksrv\.net|jdoqocy\.com|kqzyfj\.com|emjcd\.com|dotomi\.com/i.test(route),
  "the /go page source contains no affiliate destination or CJ host");
ok(!/affiliate_url|anrdoezrs\.net|dpbolvw\.net|qksrv\.net|jdoqocy\.com|kqzyfj\.com|emjcd\.com|dotomi\.com/i.test(registry),
  "the social registry contains no affiliate destination or CJ host");
ok(!/\b(url|dest|destination|provider|offer|deal)\s*:/.test(JSON.stringify(GO_SHORTLINKS)),
  "registry entries store only canonical event identity, not redirect material");

if (failures.length) {
  console.error(`check-go-shortlinks: FAIL — ${failures.length} issue(s)`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`check-go-shortlinks: OK — ${pass} assertions (registry-only resolution, city preservation, arbitrary URL refusal, real 404 wiring, no affiliate URL in page/registry source)`);
