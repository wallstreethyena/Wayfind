// Browser bundles carry no Buffer polyfill (2026-11-12). next.config.js stops
// Next from injecting it into client builds, so in a browser `Buffer` is
// undefined, which is correct only while every browser use of the name is
// guarded. Two scans over built client chunks, used by scripts/check-bundle.mjs
// and tested by scripts/test-client-buffer-scan.mjs.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// A literal from next/dist/compiled/buffer that survives minification.
export const BUFFER_POLYFILL_PROBE = "Attempt to write outside buffer bounds";

// The global `Buffer` as an identifier: not a property (`x.Buffer`,
// `arrayBuffer`), not part of a longer name. Minifiers never rename globals.
const USE = /(?<![\w$.])Buffer\b/g;
// A use counts as guarded when one of these appears shortly before it: the
// forms this codebase (and @supabase/storage-js) use to reach Buffer only
// outside a browser.
const GUARDS = ["typeof Buffer", "typeof atob", "typeof TextEncoder", "typeof window"];
const WINDOW = 400;

function chunkFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...chunkFiles(p));
    else if (name.endsWith(".js")) out.push(p);
  }
  return out;
}

export function bufferPolyfillChunks(dir) {
  return chunkFiles(dir).filter((p) => readFileSync(p, "utf8").includes(BUFFER_POLYFILL_PROBE)).map((p) => relative(dir, p));
}

export function unguardedBufferUsesIn(code) {
  const hits = [];
  for (const m of String(code).matchAll(USE)) {
    const at = m.index;
    const before = code.slice(Math.max(0, at - WINDOW), at + 6);
    if (code.slice(Math.max(0, at - 7), at) === "typeof ") continue; // the guard itself
    if (GUARDS.some((g) => before.includes(g))) continue;
    hits.push({ at, snippet: code.slice(Math.max(0, at - 40), at + 40) });
  }
  return hits;
}

export function unguardedBufferUses(dir) {
  const out = [];
  for (const p of chunkFiles(dir)) {
    for (const hit of unguardedBufferUsesIn(readFileSync(p, "utf8"))) out.push({ file: relative(dir, p), ...hit });
  }
  return out;
}
