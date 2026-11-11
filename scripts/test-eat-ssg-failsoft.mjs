#!/usr/bin/env node
// scripts/test-eat-ssg-failsoft.mjs — /eat SSG cannot SIGTERM `next build`.
//
// THE DEFECT, Vercel dpl_96WvKbByKsXtTqJrxJAtM9GzmVHJ (2026-08-29 18:33Z):
//   Error: Static page generation for /eat/tampa/indian is still timing out
//   after 3 attempts. Static worker SIGTERM at 60 seconds. Many
//   /eat/{metro}/{cuisine} pages (tampa, orlando, manatee-sarasota) plus
//   /florida-events/anastasia-manatee-performing-arts-2026 were restarted.
//
// #1022 skipped Places on landings/guides. /eat never called Places — it
// called wf_cuisine_* / wf_experiences with bare fetch and no deadline.
// Asserted by CALLING the helpers (CLAUDE.md: the call, not the string).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isSsgBuild,
  eatNetworkForbidden,
  eatRpc,
  eatCuisineStaticParams,
  eatExperienceRows,
  eatFetch,
} from "../lib/eatInventory.js";
import { fetchCuratedEvents, fetchCuratedEventBySlug } from "../lib/curatedEvents.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
}
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

function clearEatFixtures() {
  delete process.env.NEXT_PHASE;
  delete process.env.GOOGLE_MAPS_SERVER_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

// ── 1. Forbidden-network, EXECUTED ────────────────────────────────────────
ok(eatNetworkForbidden({ build: true }) === true,
  "build flag forbids /eat network even when NEXT_PHASE is unset");
ok(eatNetworkForbidden({ build: false }) === false,
  "CONTROL: runtime + no NEXT_PHASE may still read inventory");

process.env.NEXT_PHASE = "phase-production-build";
ok(isSsgBuild() === true, "NEXT_PHASE=phase-production-build is SSG");
ok(eatNetworkForbidden() === true,
  "isSsgBuild() alone forbids /eat RPCs (Vercel HAS Supabase — that is the hang)");
delete process.env.NEXT_PHASE;
ok(isSsgBuild() === false, "CONTROL: deleting NEXT_PHASE is not SSG");

// ── 2. eatRpc / static params at SSG — CALL, never wait ───────────────────
{
  process.env.NEXT_PHASE = "phase-production-build";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://e2eplaceholder.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "e2e-placeholder-anon-key-not-real";
  process.env.GOOGLE_MAPS_SERVER_KEY = "AIzaSy-not-a-real-key-but-long-enough-to-look-set";
  const prev = globalThis.fetch;
  let fetches = 0;
  const places = [];
  globalThis.fetch = async (input) => {
    fetches++;
    if (/places\.googleapis/.test(String(input))) places.push(String(input));
    return new Promise(() => {}); // hang — the failure mode dpl_96WvKb hit
  };
  try {
    const t0 = Date.now();
    const rows = await eatRpc("wf_cuisine_places", { p_metro: "tampa", p_cuisine: "indian" });
    const elapsed = Date.now() - t0;
    ok(rows === null, "SSG eatRpc returns null (could not ask) — does not invent places");
    ok(fetches === 0, `SSG eatRpc never started fetch (got ${fetches})`);
    ok(elapsed < 200, `SSG eatRpc is immediate, not a 60s hang (${elapsed}ms)`);
    ok(places.length === 0, "SSG eatRpc never touched places.googleapis");

    const t1 = Date.now();
    const params = await eatCuisineStaticParams();
    ok(Array.isArray(params) && params.length === 0,
      `SSG generateStaticParams is [] so /eat/tampa/indian is not prerendered (got ${params.length})`);
    ok(Date.now() - t1 < 200, "SSG static params is immediate");
    ok(fetches === 0, "SSG static params did not start a chips RPC");

    const tours = await eatExperienceRows("tampa", ["tampa"], {});
    ok(Array.isArray(tours) && tours.length === 0, "SSG food-tour read is [] — no invented tours");
    ok(fetches === 0, "SSG food-tour read never fetched");
  } finally {
    globalThis.fetch = prev;
    clearEatFixtures();
  }
}

// ── 3. Runtime hang becomes fail-soft, EXECUTED ───────────────────────────
{
  delete process.env.NEXT_PHASE;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://e2eplaceholder.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "e2e-placeholder-anon-key-not-real";
  const prev = globalThis.fetch;
  const keepAlive = setInterval(() => {}, 1000);
  globalThis.fetch = (u, i) => new Promise((_res, rej) => {
    if (i && i.signal) i.signal.addEventListener("abort", () => rej(new Error("aborted")));
  });
  try {
    const t0 = Date.now();
    const rows = await eatRpc("wf_cuisine_chips", { p_metro: "tampa" }, { deadlineMs: 250 });
    const elapsed = Date.now() - t0;
    ok(rows === null,
      "RUNTIME hang: eatRpc returns null (fail-soft), it does not throw a page");
    ok(elapsed < 2000,
      `RUNTIME hang rejects on the deadline, not at 60s (${elapsed}ms for 250ms)`);
    ok(elapsed >= 150,
      `CONTROL: runtime actually waited on the deadline (${elapsed}ms) — SSG skip would be ~0ms`);

    const t1 = Date.now();
    const params = await eatCuisineStaticParams({ deadlineMs: 250 });
    ok(Array.isArray(params) && params.length === 0,
      "RUNTIME hang: static params fail-soft to [] — no invented cuisine pairs");
    ok(Date.now() - t1 < 4000, "three-metro chips hang still settles (deadline, not SIGTERM)");
  } finally {
    clearInterval(keepAlive);
    globalThis.fetch = prev;
    clearEatFixtures();
  }
}

// ── 4. Runtime success still returns REAL inventory, not a skip ───────────
{
  delete process.env.NEXT_PHASE;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://e2eplaceholder.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "e2e-placeholder-anon-key-not-real";
  const prev = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const u = String(input);
    if (/wf_cuisine_chips/.test(u)) {
      return { ok: true, json: async () => [{ cuisine: "indian", places: 4, tier: "full" }] };
    }
    if (/wf_cuisine_places/.test(u)) {
      return { ok: true, json: async () => [{ place_id: "p1", name: "Real Indian Kitchen", rating: 4.6, reviews: 80, wf_score: 72 }] };
    }
    return { ok: false, status: 503, json: async () => ([]) };
  };
  try {
    const chips = await eatRpc("wf_cuisine_chips", { p_metro: "tampa" });
    ok(chips && chips[0] && chips[0].cuisine === "indian",
      "CONTROL: runtime eatRpc returns the inventory it was given — the skip is SSG-only");
    const params = await eatCuisineStaticParams();
    ok(params.some((p) => p.metro === "tampa" && p.cuisine === "indian"),
      "CONTROL: runtime static params include /eat/tampa/indian from chips — we do not invent, we pass through");
    ok(!params.some((p) => p.cuisine === "martian"),
      "CONTROL: a cuisine that is not in inventory is not minted");
  } finally {
    globalThis.fetch = prev;
    clearEatFixtures();
  }
}

// ── 5. eatFetch itself REJECTS on a hang (the property pages rely on) ─────
{
  const prev = globalThis.fetch;
  const keepAlive = setInterval(() => {}, 1000);
  globalThis.fetch = (u, i) => new Promise((_res, rej) => {
    if (i && i.signal) i.signal.addEventListener("abort", () => rej(new Error("aborted")));
  });
  try {
    const verdict = await Promise.race([
      eatFetch("http://never.invalid", { next: { revalidate: 60 } }, 250).then(() => "resolved", () => "rejected"),
      new Promise((r) => setTimeout(() => r("hung"), 3000)),
    ]);
    ok(verdict === "rejected",
      `EXECUTED: eatFetch REJECTS against a never-settling fetch (got "${verdict}")`);
  } finally {
    clearInterval(keepAlive);
    globalThis.fetch = prev;
  }
}

// ── 6. Curated events SSG skip, EXECUTED (the other dpl_96WvKb timeout) ───
{
  process.env.NEXT_PHASE = "phase-production-build";
  try {
    const t0 = Date.now();
    const all = await fetchCuratedEvents();
    const one = await fetchCuratedEventBySlug("anastasia-manatee-performing-arts-2026");
    const elapsed = Date.now() - t0;
    ok(Array.isArray(all) && all.length === 0,
      "SSG fetchCuratedEvents is [] — hub renders empty rails, no invented events");
    ok(one === null,
      "SSG fetchCuratedEventBySlug is null — generateStaticParams then returns []");
    ok(elapsed < 200, `SSG curated-event reads are immediate (${elapsed}ms)`);
  } finally {
    clearEatFixtures();
  }
}

// ── 7. Source position: the pages actually take the SSG path ──────────────
{
  const metro = strip(read("app/eat/[metro]/page.js"));
  const cuisine = strip(read("app/eat/[metro]/[cuisine]/page.js"));
  const curated = strip(read("lib/curatedEvents.js"));
  const index = strip(read("lib/placeIndex.js"));

  ok(/from ["'][^"']*eatInventory["']/.test(metro),
    "PROBE: /eat/[metro] imports eatInventory");
  ok(/if \(isSsgBuild\(\)\) return null/.test(metro),
    "/eat/[metro] chipsFor returns null at SSG — the existing 'could not ask' UI");
  ok(/if \(isSsgBuild\(\)\) return \[\]/.test(metro),
    "/eat/[metro] foodToursFor returns [] at SSG");
  ok(/eatFetch\(/.test(metro), "/eat/[metro] uses eatFetch (deadline), not a bare hang");

  ok(/from ["'][^"']*eatInventory["']/.test(cuisine),
    "PROBE: /eat/[metro]/[cuisine] imports eatInventory");
  ok(/eatCuisineStaticParams\(\)/.test(cuisine),
    "generateStaticParams CALLS eatCuisineStaticParams — a comment is not the path");
  ok(/if \(isSsgBuild\(\)\) return null/.test(cuisine),
    "cuisine rpc() returns null at SSG — /eat/tampa/indian cannot wait 60s");
  ok(/eatFetch\(/.test(cuisine), "cuisine page uses eatFetch (deadline)");
  ok(/if \(isSsgBuild\(\)\) \{/.test(cuisine) && /Cuisine coverage is unavailable/.test(read("app/eat/[metro]/[cuisine]/page.js")),
    "SSG empty list renders the editorial shell, not a baked 404 and not invented rows");
  ok(/notFound\(\)/.test(cuisine),
    "CONTROL: runtime empty/unknown cuisine still 404s — we did not delete the honest empty");

  ok(/if \(isSsgBuild\(\)\) return \[\]/.test(curated),
    "fetchCuratedEvents returns [] at SSG — anastasia-manatee cannot hang the build");
  ok(/if \(isSsgBuild\(\)\) return null/.test(curated),
    "fetchCuratedEventBySlug returns null at SSG");

  ok(/fetchDeadline\(/.test(index),
    "placeIndex bounds wf_place_ids reads — remaining SSG network cannot hang");

  const home = read("app/home.js");
  ok(home.length > 1000, "PROBE: home.js is readable");
  ok(!/eatInventory/.test(home), "home.js does not import eatInventory (bundle cap)");
}

// ── 8. Red-prove: SSG skip is what stops the hang ─────────────────────────
{
  const wouldSkip = eatNetworkForbidden({ build: true });
  ok(wouldSkip === true, "self-test: build forbids network — if this is false the skip is decoration");
}

clearEatFixtures();

if (fail.length) {
  console.error(`test-eat-ssg-failsoft: ${fail.length} failure(s)`);
  for (const m of fail) console.error("  FAIL:", m);
  process.exit(1);
}
console.log(`test-eat-ssg-failsoft: OK — ${pass} assertions (SSG skip is immediate, zero Places, runtime hang fail-softs, /eat/tampa/indian not prerendered, curated events skip, ranking not invented)`);
