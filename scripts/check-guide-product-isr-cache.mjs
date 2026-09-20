#!/usr/bin/env node
// Guide pages are ISR. Exact Viator resolution is skipped during the production
// build, but its runtime spend grant deliberately uses cache: "no-store". The
// resolver therefore has to run inside a Data Cache boundary on an ISR miss;
// otherwise a page first rendered statically changes to dynamic at runtime.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createCachedGuideProductResolver,
  GUIDE_PRODUCT_CACHE_KEY,
  GUIDE_PRODUCT_REVALIDATE_SECONDS,
} from "../lib/guideProductResolveCache.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fail = [];
const ok = (condition, message) => condition ? pass++ : fail.push(message);

// Execute the wrapper with a cache double. The loader stands in for the real
// resolver's no-store spend-ledger request and records whether it escaped the
// boundary. Cache identity includes every input the resolver reads.
{
  const stored = new Map();
  const configs = [];
  const loads = [];
  let insideBoundary = false;
  let escapedBoundary = false;
  const cache = (fn, keyParts, options) => {
    configs.push({ keyParts, options });
    return async (...args) => {
      const key = JSON.stringify([...keyParts, ...args]);
      if (stored.has(key)) return stored.get(key);
      insideBoundary = true;
      try {
        const value = await fn(...args);
        stored.set(key, value);
        return value;
      } finally {
        insideBoundary = false;
      }
    };
  };
  const cached = createCachedGuideProductResolver({
    cache,
    load: async (pick, region) => {
      if (!insideBoundary) escapedBoundary = true;
      loads.push({ pick, region });
      return { url: `https://example.test/${encodeURIComponent(pick.bookQuery || pick.name)}`, title: pick.name };
    },
  });
  const base = { name: "Clear kayak tour", bookQuery: "Cocoa Beach bioluminescence clear kayak tour" };
  await cached(base, "Cocoa Beach");
  await cached({ ...base }, "Cocoa Beach");
  await cached({ ...base, indoor: true }, "Cocoa Beach"); // unread field: same answer
  await cached({ ...base, bookQuery: "Merritt Island bioluminescence kayak tour" }, "Cocoa Beach");
  await cached(base, "Space Coast");

  ok(configs.length === 1 && configs[0].keyParts[0] === GUIDE_PRODUCT_CACHE_KEY,
    "guide products use one versioned Data Cache namespace");
  ok(configs[0].options.revalidate === GUIDE_PRODUCT_REVALIDATE_SECONDS && GUIDE_PRODUCT_REVALIDATE_SECONDS === 900,
    "a failed or empty resolution is retried on the guide's 15-minute ISR cadence");
  ok(!escapedBoundary, "the runtime product resolver executes inside the Data Cache boundary");
  ok(loads.length === 3, `identical resolver inputs coalesce while query and region split cache identity (got ${loads.length})`);
  ok(loads.every(({ pick, region }) => typeof pick.name === "string" && Object.hasOwn(pick, "bookQuery") && typeof region === "string"),
    "the cached loader receives every field guide product resolution reads");
}

// Source contract: retain the build skip (no paid-provider work during SSG),
// and make the cached entrypoint the only runtime call from the ISR page.
{
  const page = readFileSync(path.join(ROOT, "app/guides/[slug]/page.js"), "utf8");
  ok(/!isSsgBuild\(\)[\s\S]*await cachedGuideProduct\(pick, region\)/.test(page),
    "guide SSG still skips product resolution and ISR uses the cached entrypoint");
  ok(!/await resolveGuideProduct\(pick, region\)/.test(page),
    "the ISR page cannot bypass the cache boundary for exact product resolution");

  const resolver = readFileSync(path.join(ROOT, "lib/guideProductResolve.js"), "utf8");
  const resolverBody = resolver.slice(resolver.indexOf("export async function resolveGuideProduct"));
  ok(/pick\.bookQuery\s*\|\|\s*pick\.name/.test(resolverBody),
    "cache identity includes the resolver's preferred bookQuery and fallback name inputs");
  ok(!/pick\.viatorUrl/.test(resolverBody),
    "viatorUrl is not part of cache identity because the resolver never reads it");
}

if (fail.length) {
  for (const message of fail) console.log("  FAIL:", message);
  console.log(`check-guide-product-isr-cache: FAIL — ${fail.length} of ${pass + fail.length} assertions`);
  process.exit(1);
}
console.log(`check-guide-product-isr-cache: OK — ${pass} assertions (SSG skips paid work; ISR product resolution stays inside a 15-minute Data Cache boundary)`);
