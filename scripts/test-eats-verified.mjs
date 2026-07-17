// scripts/test-eats-verified.mjs — locks the Order-In "exact store" contract
// (B1 + B8) on both /api/eats routes. resolveStore does a live Uber fetch, so
// these are source invariants, not a runtime call.
//   B1: a store counts only if its slug shares a >=4-char name token — never the
//       bare first Uber result (which could be a DIFFERENT restaurant).
//   B8: the shared cache key includes a coarse lat/lng bucket so two locations of
//       one chain in a city don't collide on a single cached store.
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-eats-verified: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

for (const f of ["go", "check"]) {
  const src = readFileSync(new URL(`../app/api/eats/${f}/route.js`, import.meta.url), "utf8");
  ok(/const best = matched;/.test(src), `${f}: the store is the token-MATCHED result only`);
  ok(!/const best = matched \|\| first/.test(src), `${f}: no longer promotes the bare 'first' Uber result`);
  ok(!/let first = null|if \(!first\) first =/.test(src), `${f}: the 'first' fallback variable is removed`);
  ok(/if \(!best\) return null|const url = best \?/.test(src), `${f}: no match -> null (honest search fallback / unverified)`);
  ok(/norm\(city\) \+ "\|" \+ \(isFinite\(lat\)/.test(src), `${f}: cache key includes a lat/lng geo bucket (B8)`);
  ok(/\(\+lat\)\.toFixed\(2\)/.test(src) && /\(\+lng\)\.toFixed\(2\)/.test(src), `${f}: geo bucket is ~1km (2 decimals), lat and lng`);
}

console.log(`test-eats-verified: OK — ${pass} assertions (token-matched store only; per-location cache key)`);
