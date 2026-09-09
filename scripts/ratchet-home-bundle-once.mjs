#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(src, before, after, label) {
  const first = src.indexOf(before);
  if (first < 0) throw new Error(`missing anchor: ${label}`);
  if (src.indexOf(before, first + before.length) >= 0) throw new Error(`ambiguous anchor: ${label}`);
  return src.slice(0, first) + after + src.slice(first + before.length);
}

const bundlePath = "scripts/check-bundle.mjs";
let bundle = readFileSync(bundlePath, "utf8");
bundle = replaceOnce(
  bundle,
  "const TOTAL_BUDGET_KB = 498;       // every JS asset for route \"/\", gzipped.  RATCHET: lower only.",
  "// 2026-09-09: lazy Supabase left the homepage eager graph. Exact Vercel preview on\n// current main c722d56f measured 435.7KB gz. 445 banks 53KB of the reduction\n// while retaining 9.3KB measured headroom for gzip drift and emergency fixes.\nconst TOTAL_BUDGET_KB = 445;       // every JS asset for route \"/\", gzipped.  RATCHET: lower only.",
  "bundle ratchet 498 -> 445"
);
writeFileSync(bundlePath, bundle);

const sentryPath = "scripts/test-sentry-lazy.mjs";
let sentry = readFileSync(sentryPath, "utf8");
sentry = replaceOnce(sentry, "post-Next-15 498KB measured ratchet", "post-Supabase-extraction 445KB measured ratchet", "Sentry header ceiling note");
sentry = replaceOnce(sentry, "/const TOTAL_BUDGET_KB = 498;/", "/const TOTAL_BUDGET_KB = 445;/", "Sentry ceiling assertion");
sentry = replaceOnce(sentry, "documented 498KB post-Next-15 ceiling", "documented 445KB post-Supabase-extraction ceiling", "Sentry ceiling message");
writeFileSync(sentryPath, sentry);

console.log("ratchet-home-bundle-once: 498 -> 445 with exact-preview provenance");
