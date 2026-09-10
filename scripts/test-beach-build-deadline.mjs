import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchBeachJson, BEACH_READ_MS } from "../lib/beachPageRead.js";

const originalFetch = globalThis.fetch;
const originalTimer = globalThis.setTimeout;
const source = readFileSync(new URL("../app/best-beaches/[metro]/page.js", import.meta.url), "utf8");
let checks = 0;
function ok(condition, message) { assert.ok(condition, message); checks++; }
try {
  const init = { method: "POST", body: "{}", next: { revalidate: 3600 } };
  let received;
  globalThis.fetch = async (url, options) => {
    received = options;
    return { ok: true, json: async () => [{ place_id: "beach-a" }] };
  };
  const rows = await fetchBeachJson("https://example.invalid", init);
  ok(rows[0].place_id === "beach-a", "healthy response survives");
  ok(received.next === init.next && received.body === init.body && !init.signal, "cache options and caller remain intact");
  ok(BEACH_READ_MS > 0 && BEACH_READ_MS <= 8000, "each read fits the page budget");
  globalThis.setTimeout = (fn, ms, ...args) => {
    ok(ms === BEACH_READ_MS, "the real read uses the declared budget");
    return originalTimer(fn, 15, ...args);
  };
  for (const bodyStalls of [false, true]) {
    let signal;
    globalThis.fetch = (_url, options) => {
      signal = options.signal;
      const never = new Promise(() => {});
      return bodyStalls ? Promise.resolve({ ok: true, json: () => never }) : never;
    };
    await assert.rejects(fetchBeachJson("https://example.invalid", init), /deadline/);
    ok(signal.aborted, `${bodyStalls ? "body" : "headers"} stall aborts even when the transport ignores cancellation`);
  }
  globalThis.setTimeout = originalTimer;
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  await assert.rejects(fetchBeachJson("https://example.invalid", init), /503/);
  checks++;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ error: "bad shape" }) });
  await assert.rejects(fetchBeachJson("https://example.invalid", init), /invalid/);
  checks++;

  // Execute the actual page readers, keeping the render/import layer outside
  // this harness. An upstream failure must differ from a legitimate empty list.
  const readers = source.slice(source.indexOf("const CENTROID ="), source.indexOf("export function generateStaticParams"));
  const load = (read) => new Function("fetchBeachJson", "rankBeaches", "mapWfEditorial", "process", "console",
    readers + "; return { beachesFor, editorialsFor };")(
      read, rows => rows, row => row,
      { env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture" } },
      { warn() {} });
  const healthy = load(async () => []);
  ok(Array.isArray(await healthy.beachesFor("tampa")), "healthy empty is a list");
  const failed = load(async () => { throw new Error("deadline"); });
  ok(await failed.beachesFor("tampa") === null, "failed rankings are unavailable, not zero beaches");
  ok(Object.keys(await failed.editorialsFor(["a"])).length === 0, "editorial outage preserves ranking fallback");
  ok(!/await fetch\(/.test(readers), "neither page reader can bypass the bounded read");
  ok(source.includes('beachResult === null') && source.includes('Beach rankings are temporarily unavailable.'), "page discloses unavailable rankings");
  ok(source.includes('export const revalidate = 3600'), "existing ISR interval stays unchanged");
  console.log(`test-beach-build-deadline: OK — ${checks} assertions (headers/body stalls, healthy control, reader failure semantics and page wiring)`);
} finally {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalTimer;
}
