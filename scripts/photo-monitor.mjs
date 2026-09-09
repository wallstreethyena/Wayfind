#!/usr/bin/env node
// scripts/photo-monitor.mjs — WHAT A READER ACTUALLY SEES, MEASURED.
//
// THE INCIDENT (2026-09-08, scratchpad/facts.md). The `photos` Google Places
// ledger exhausted 950/950 on 2026-09-01 19:43Z and stays exhausted through
// September. Since then, every uncached /api/photo request has either 302'd
// to the branded compass SVG or (after #1182) 404'd with a per-place monogram
// — and nothing measured it. This script is the missing measurement: it
// probes real card/route shapes on the LIVE site and reports what actually
// rendered, without ever being able to cause a paid Google call.
//
// THE PROBE HEADER IS THE WHOLE SAFETY PROPERTY. Every request here carries
// x-wayfind-photo-probe: 1. lib/placePhotoServe's resolver never even CALLS
// authorizeSpend when probing (0 calls, not "called and denied"), and
// app/api/photo/route.js's authorizeSpend closure is unreachable on that path
// for the same reason. This script also never imports lib/spendGate.js and
// never contains the string "places.googleapis.com" (scripts/test-photo-protection.mjs
// case 9).
//
// NOT GUARD-SHAPED ON PURPOSE (a `photo-` prefix, not `check-`/`test-`), so
// it sits outside scripts/check-guard-manifest.mjs, check-guard-hermeticity
// and the guard registry by construction — the same status as
// scripts/run-synthetic-monitor.mjs. It touches the network and a live
// database; the prebuild suite must stay hermetic.
//
// QUEUE AVAILABILITY (v8.56.12): wf_photo_repair_queue may not exist yet on a
// given environment. A missing table fails the queue write only — it is
// logged, counted, and the run still files its pulse and exits 0.
//
// RATE LIMITING (2026-09-09). The first live run against production (509
// probes, concurrency 6, no pacing) drew 62 HTTP 429s: `lib/apiGuard.js`
// rate-limits 120 requests per 60s per IP, best-effort, per instance — and
// this monitor is itself just another same-origin caller of that limit.
// RATE_PER_MINUTE paces requests well under that wall (not at it — headroom
// for ordinary jitter and any other same-IP traffic), CONCURRENCY is capped
// low so the pacer, not raw parallelism, sets the pace, and a 429 gets one
// retry (Retry-After if present, else 3s) before being counted. A run whose
// 429 rate stays high despite that is reported as "rate-limited", counted
// separately, and never allowed to inflate — or hide behind — a "real"
// placeholder-rate finding (see isSampleDegraded/computeBreach in
// lib/photoCoverage.js).
//
// USAGE
//   node scripts/photo-monitor.mjs --base-url=https://www.gowayfind.com
//     [--per-cell=2] [--epoch=2026-09-08T18] [--json] [--no-queue] [--pages]
//
// EXIT CODE. Non-zero ONLY on an operational failure this run could not
// perform at all (no Supabase credentials, zero rows sampled, every probe
// errored). A high placeholder rate is a FINDING — filed as a pulse and
// queue rows — never a crash. A red canary here always means the instrument
// failed, never that the world looked bad (spec §4, risk 13).
import { recordPulse } from "../lib/jobPulse.js";
import { classifyProbe, computeBreach, isSampleDegraded, mergeQueueUpsert, openGrowthRatio, parseOpenTotal, pulseVerdict } from "../lib/photoCoverage.js";

const DEFAULT_BASE_URL = "https://www.gowayfind.com";
// RL_LIMIT in lib/apiGuard.js is 120 requests / 60s per IP, best-effort, per
// instance. 90 is deliberately under that wall, not at it. Low concurrency
// (not the pacer alone) is what keeps bursts from a Promise.all batch from
// briefly exceeding the per-minute rate even though the AVERAGE stays paced.
const RATE_PER_MINUTE = 90;
const CONCURRENCY = 2;
const TIMEOUT_MS = 10000;
const USER_AGENT = "WayfindPhotoMonitor/1.0 (+https://www.gowayfind.com)";
const PROBE_HEADER = { "x-wayfind-photo-probe": "1", "user-agent": USER_AGENT };
const RETRY_AFTER_DEFAULT_MS = 3000;
// amendment A4 — rotate cells by epoch when the full sweep would exceed this.
// Lowered 600 -> 500 alongside RATE_PER_MINUTE=90: 509 probes at 90/min is
// ~5.7 minutes even with zero 429 retries, which keeps the canary workflow's
// 10-minute timeout realistic once retry waits (up to Retry-After, or 3s
// default) are factored in; a run that would need more than 500 probes now
// rotates cells instead of pushing the sweep length toward the timeout.
const PROBE_CAP = 500;
const PLACEHOLDER_RATE_THRESHOLD = 0.35; // measured baseline today is ~0.75 (15,088/19,852 uncached); this is a ratchet, not a description of today
const OPEN_GROWTH_THRESHOLD = 0.2;
const SAMPLE_DEGRADED_WARNING =
  "photo-monitor: WARNING — sample degraded: too many probes were rate-limited by our own per-IP limit; this run's placeholder rate is not reliable and will not breach on it alone.";

// Token-bucket pacing: RATE_PER_MINUTE requests spread evenly across each
// minute. Pure scheduling math with an injectable clock/sleep so it is
// testable without ever actually waiting — a real caller gets the real
// Date.now()/setTimeout, a test supplies a virtual clock and asserts the
// computed delays directly.
export function createPacer({ ratePerMinute = RATE_PER_MINUTE, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const intervalMs = 60000 / Math.max(1, ratePerMinute);
  let nextAt = 0;
  return {
    // Returns the delay (ms) this call actually waited, so a test can assert
    // on the pacing math directly instead of on wall-clock side effects.
    async wait() {
      const t = now();
      const start = Math.max(t, nextAt);
      nextAt = start + intervalMs;
      const delay = start - t;
      if (delay > 0) await sleep(delay);
      return delay;
    },
  };
}

const pacer = createPacer({ ratePerMinute: RATE_PER_MINUTE });

// One HTTP attempt, paced. Exported (with fetchImpl/sleep injectable) so the
// retry-once-on-429 contract can be proven by calling the real function
// against a scripted fetch, not by regexing this file.
export async function fetchWithRetry(url, { fetchImpl, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), pace = () => pacer.wait() } = {}) {
  const attempt = fetchImpl || defaultFetchOnce;
  await pace();
  const first = await attempt(url);
  if (first.status !== 429) return first;
  const retryAfterSec = Number(first.retryAfter);
  const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : RETRY_AFTER_DEFAULT_MS;
  await sleep(waitMs);
  await pace();
  // Whatever the second attempt returns is the final answer — even a second
  // 429 is returned as-is, and classifyProbe's status-429 branch is what
  // then reads it as "rate-limited". This function's job is only "retry
  // once", never to decide what a repeated 429 means.
  return attempt(url);
}

// ── FNV-1a — deterministic, never Math.random() (case 8's whole point: two
// runs at the same epoch must sample the SAME places) ──────────────────────
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function defaultEpoch() {
  return new Date().toISOString().slice(0, 13); // hourly rotation
}

// rows: [{place_id, metro, category, photo_ref}]. Groups into (metro,
// category) cells and takes up to `perCell` rows per cell, chosen by
// ascending FNV-1a(place_id + "|" + epoch) — a different epoch rotates the
// selection, the same epoch always reproduces it exactly. EVERY cell present
// in the input appears in the output (the PROBE_CAP in main() is a
// SEPARATE, later step over which CELLS get probed this run — this function
// always reports full coverage of the input).
export function sampleCells(rows, { perCell = 2, epoch } = {}) {
  const ep = String(epoch || defaultEpoch());
  const n = Math.max(0, Math.floor(Number(perCell) || 0));
  const byCell = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || !r.place_id) continue;
    const metro = String(r.metro || "");
    const category = String(r.category || "");
    const key = metro + " " + category;
    if (!byCell.has(key)) byCell.set(key, { metro, category, all: [] });
    byCell.get(key).all.push(r);
  }
  const cells = [];
  for (const { metro, category, all } of byCell.values()) {
    const scored = all
      .map((r) => ({ row: r, h: fnv1a(String(r.place_id) + "|" + ep) }))
      .sort((a, b) => (a.h - b.h) || String(a.row.place_id).localeCompare(String(b.row.place_id)));
    cells.push({ metro, category, rows: scored.slice(0, n).map((s) => s.row) });
  }
  cells.sort((a, b) => (a.metro + " " + a.category).localeCompare(b.metro + " " + b.category));
  return cells;
}

async function defaultFetchOnce(url) {
  try {
    const r = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      headers: PROBE_HEADER,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return {
      status: r.status,
      location: r.headers.get("location"),
      resultHeader: r.headers.get("x-wayfind-photo-result"),
      retryAfter: r.headers.get("retry-after"),
    };
  } catch (e) {
    return { status: 0, location: null, resultHeader: null, retryAfter: null, error: String((e && e.message) || e) };
  }
}

async function fetchOne(url) {
  return fetchWithRetry(url);
}

// One row, both card shapes. `?ref=` (poster/hero — IconicPlaceCard.photoUrl,
// todaysBest.tbPhotoUrl, PaidLanding) when the row carries a photo_ref, and
// `?place=` (ownedPlacePhotoSrc, Coupons, EventWhere) always — a no-ref place
// is exactly what §3 needs to still measure. Each surface is classified
// immediately via lib/photoCoverage.js's classifyProbe so summarize() never
// has to re-derive a verdict from a raw fetch result.
export async function probeUrl(baseUrl, row, w) {
  const width = Number(w) || 640;
  const placeId = row && row.place_id;
  const metro = row && row.metro;
  const category = row && row.category;
  const surfaces = [];

  if (row && row.photo_ref) {
    const u = new URL("/api/photo", baseUrl);
    u.searchParams.set("ref", row.photo_ref);
    u.searchParams.set("w", String(width));
    const res = await fetchOne(u.href);
    surfaces.push({ kind: "ref", ...res, verdict: classifyProbe(res) });
  }
  if (placeId) {
    const u = new URL("/api/photo", baseUrl);
    u.searchParams.set("place", placeId);
    u.searchParams.set("w", String(width));
    const res = await fetchOne(u.href);
    surfaces.push({ kind: "place", ...res, verdict: classifyProbe(res) });
  }
  return { placeId, metro, category, photoRef: (row && row.photo_ref) || null, surfaces };
}

// Aggregates an array of probeUrl() results. Pure — every field it reads was
// already computed by probeUrl's classifyProbe call, so this never has to
// re-classify a raw response.
// classifyProbe's verdict strings are lowercase-hyphenated ("rate-limited");
// byResult's keys stay camelCase JSON identifiers ("rateLimited") — this is
// the one place that translates between them.
function resultBucket(verdict) {
  return verdict === "rate-limited" ? "rateLimited" : verdict;
}

export function summarize(probeResults) {
  const byResult = { real: 0, compass: 0, miss: 0, rateLimited: 0, error: 0 };
  const byReason = {};
  const byMetro = {};
  const byCategory = {};
  const metros = new Set();
  const categories = new Set();
  let sampled = 0;

  const bump = (bucket, dict, key) => {
    if (!dict[key]) dict[key] = { real: 0, compass: 0, miss: 0, rateLimited: 0, error: 0 };
    dict[key][bucket] = (dict[key][bucket] || 0) + 1;
  };

  for (const pr of Array.isArray(probeResults) ? probeResults : []) {
    const metro = String((pr && pr.metro) || "");
    const category = String((pr && pr.category) || "");
    metros.add(metro);
    categories.add(category);
    for (const s of (pr && pr.surfaces) || []) {
      sampled++;
      const bucket = resultBucket(s.verdict);
      byResult[bucket] = (byResult[bucket] || 0) + 1;
      const reason = s.resultHeader || s.verdict;
      byReason[reason] = (byReason[reason] || 0) + 1;
      bump(bucket, byMetro, metro);
      bump(bucket, byCategory, category);
    }
  }

  // placeholderRate = (compass + miss) / probes — a "compass" (302 to the
  // shared SVG) and a "miss" (404, per-title monogram) are both a reader NOT
  // seeing that place's own photo; "real" is the only non-placeholder
  // outcome. "error" and "rateLimited" are both excluded from the numerator
  // (neither is evidence the READER saw a placeholder — "rateLimited" means
  // the PROBE learned nothing about this place at all, throttled by our own
  // per-IP limit) but both still count toward `sampled`, same as before.
  const placeholderRate = sampled > 0 ? (byResult.compass + byResult.miss) / sampled : 0;
  return {
    sampled,
    byResult,
    byReason,
    placeholderRate,
    byMetro,
    byCategory,
    sampledFrom: { metros: metros.size, categories: categories.size },
  };
}

// Which (placeId, surface) results belong in the repair queue.
//
// `unconfigured` is NEVER queued — a missing GOOGLE_MAPS_SERVER_KEY is a
// config outage, not a place defect, and filing 19,852 places into the queue
// because a key rotated would bury the genuinely broken places under a false
// alarm. It is counted separately (see configOutages in main()) so the
// outage is still visible.
//
// `gate-shut` is likewise never queued — a global switch, not a per-place
// defect.
//
// probe-no-spend and spend-denied both map to "source-unavailable", never
// "spend-restricted" — a probe never asks the ledger (lib/placePhotoServe.js
// skips authorizeSpend entirely while probing) and even a real denied request
// only proves THIS request was refused, not that the ledger is exhausted.
// "source-unavailable" is the honest placeholder: "uncached, cause not yet
// determined by this probe". lib/photoRepair.js's worker DOES read
// wf_spend_ledger on its next drain and overwrites this with the real answer
// (spend-restricted vs source-unavailable) — it never consults the queue
// row's existing failure_reason, so this initial label is corrected within
// one drain cycle regardless of which of the two it starts as.
export function queueCandidates(probeResults) {
  const out = [];
  for (const pr of Array.isArray(probeResults) ? probeResults : []) {
    for (const s of (pr && pr.surfaces) || []) {
      const reason = s.resultHeader || s.verdict;
      let failureReason = null;
      if (s.verdict === "compass" && reason === "no-photo") failureReason = "no-source";
      else if (s.verdict === "miss" && (reason === "probe-no-spend" || reason === "spend-denied")) failureReason = "source-unavailable";
      else if (s.verdict === "miss" && reason === "owned-miss") failureReason = "owned-miss";
      if (!failureReason) continue;
      out.push({ placeId: pr.placeId, currentRef: pr.photoRef, failureReason });
      break; // one queue row per place per run, whichever surface found the problem first
    }
  }
  return out;
}

async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) || 0 }, run));
  return results;
}

function parseArgs(argv) {
  const out = { baseUrl: DEFAULT_BASE_URL, perCell: 2, epoch: null, json: false, queue: true, pages: false };
  for (const a of argv) {
    if (a.startsWith("--base-url=")) out.baseUrl = a.slice(11).replace(/\/+$/, "");
    else if (a.startsWith("--per-cell=")) out.perCell = Math.max(0, parseInt(a.slice(11), 10) || 0);
    else if (a.startsWith("--epoch=")) out.epoch = a.slice(8);
    else if (a === "--json") out.json = true;
    else if (a === "--no-queue") out.queue = false;
    else if (a === "--pages") out.pages = true;
  }
  return out;
}

function sbEnvHere() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!raw || !key) return null;
  return { url: /^https?:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : "https://" + raw, key };
}

// One paged read of the active inventory this monitor is allowed to sample
// (amendment A7's predicate). Never selects photo_url or any owned-URL
// field — this script measures the SERVED result, it does not need to know
// the raw candidate.
async function fetchActiveRows(s) {
  const rows = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const r = await fetch(
      `${s.url}/rest/v1/wf_inventory?select=place_id,metro,category,photo_ref&status=eq.OPERATIONAL&or=(excluded.is.null,excluded.is.false)`,
      {
        headers: { apikey: s.key, Authorization: "Bearer " + s.key, Range: `${from}-${from + pageSize - 1}`, Prefer: "count=exact" },
        cache: "no-store",
      }
    );
    if (!r.ok) throw new Error(`wf_inventory read failed: HTTP ${r.status}`);
    const page = await r.json();
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function queueError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// The rows that already exist for these place ids, so mergeQueueUpsert can
// bump `detections` and re-open a `recovered` row without ever overturning an
// operator's `retired` verdict. Chunked: an `in.(...)` list of several hundred
// ids is a multi-kilobyte URL, and a request that a proxy truncates is a read
// that silently returns the wrong answer.
//
// Fail-soft (v8.56.12): wf_photo_repair_queue may not exist yet (the
// migration has not landed on this environment). A failed read here throws
// with a `.status` so main() can log `queue: unavailable (<status>)`, count
// it, and still file the pulse — never a crash.
async function fetchExistingQueueRows(s, placeIds) {
  const out = [];
  const ids = [...new Set(placeIds.filter(Boolean).map(String))];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const inList = chunk.map((id) => '"' + id.replace(/"/g, '""') + '"').join(",");
    const r = await fetch(
      `${s.url}/rest/v1/wf_photo_repair_queue?place_id=in.(${encodeURIComponent(inList)})&select=place_id,status,detections`,
      { headers: { apikey: s.key, Authorization: "Bearer " + s.key }, cache: "no-store" }
    );
    if (!r.ok) throw queueError(r.status, `wf_photo_repair_queue read failed: HTTP ${r.status}`);
    const page = await r.json();
    if (Array.isArray(page)) out.push(...page);
  }
  return out;
}

export async function upsertQueueRows(s, candidates) {
  if (!candidates.length) return 0;
  const nowIso = new Date().toISOString();
  const existing = await fetchExistingQueueRows(s, candidates.map((c) => c.placeId));
  const body = mergeQueueUpsert(existing, candidates, nowIso);
  if (!body.length) return 0;
  const r = await fetch(`${s.url}/rest/v1/wf_photo_repair_queue`, {
    method: "POST",
    cache: "no-store",
    headers: {
      apikey: s.key,
      Authorization: "Bearer " + s.key,
      "content-type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw queueError(r.status, `wf_photo_repair_queue upsert failed: HTTP ${r.status}`);
  return body.length;
}

async function lastPhotoMonitorPulses(s, limit = 6) {
  try {
    const r = await fetch(
      `${s.url}/rest/v1/wf_job_pulse?job=eq.photo-monitor&select=note,ran_at,succeeded&order=ran_at.desc&limit=${limit}`,
      { headers: { apikey: s.key, Authorization: "Bearer " + s.key }, cache: "no-store" }
    );
    if (!r.ok) return [];
    const rows = await r.json();
    return Array.isArray(rows) ? rows.map((x) => ({ note: x.note, ranAt: x.ran_at, succeeded: x.succeeded })) : [];
  } catch {
    return [];
  }
}

async function currentOpenCount(s) {
  try {
    const r = await fetch(`${s.url}/rest/v1/wf_photo_repair_queue?select=place_id&status=eq.open`, {
      headers: { apikey: s.key, Authorization: "Bearer " + s.key, Prefer: "count=exact", Range: "0-0" },
      cache: "no-store",
    });
    if (!r.ok) return null;
    const n = Number((r.headers.get("content-range") || "").split("/")[1]);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

// Optional render-level check (off by default): does the browser actually
// paint a real photo, not just does the API redirect correctly? Reuses the
// same Chromium-resolution helper the synthetic monitor uses; skips loudly
// (a warning, never a fabricated result) when no usable Chromium is found.
async function renderedPlaceholderRate(baseUrl) {
  let launchChromium;
  try {
    ({ launchChromium } = await import("./lib/synthetic/chromium.mjs"));
  } catch {
    return { checked: false, reason: "chromium helper unavailable" };
  }
  let browser = null;
  try {
    browser = await launchChromium();
  } catch (e) {
    return { checked: false, reason: `chromium launch failed: ${(e && e.message) || e}` };
  }
  if (!browser) return { checked: false, reason: "no usable Chromium in this environment" };

  const paths = ["/", "/best-beaches/manatee-sarasota"];
  let real = 0, placeholder = 0;
  try {
    for (const p of paths) {
      const page = await browser.newPage();
      try {
        await page.goto(new URL(p, baseUrl).href, { waitUntil: "networkidle", timeout: 20000 });
        const srcs = await page.evaluate(() =>
          Array.from(document.querySelectorAll(".wf-place-card img, .wf8-tile img")).map((img) => img.currentSrc || img.src)
        );
        for (const src of srcs) {
          // #1188: upload.wikimedia.org is the free PERMANENT photo lane
          // (lib/freePhoto.js) — a real photo, same as a googleusercontent.com
          // one, just not rented from Google. See lib/photoCoverage.js's
          // REAL_HOST_RX, which classifies the synthetic /api/photo probe the
          // same way.
          if (/googleusercontent\.com/i.test(src) || /upload\.wikimedia\.org/i.test(src)) real++;
          else if (/wf-photo-fallback\.svg/i.test(src)) placeholder++;
        }
      } finally {
        await page.close();
      }
    }
  } catch (e) {
    return { checked: false, reason: `render sweep failed: ${(e && e.message) || e}` };
  } finally {
    try { await browser.close(); } catch {}
  }
  const total = real + placeholder;
  return { checked: true, real, placeholder, rate: total > 0 ? placeholder / total : null };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const epoch = args.epoch || defaultEpoch();
  const generatedAt = new Date().toISOString();

  const s = sbEnvHere();
  if (!s) {
    console.error("photo-monitor: FAIL — SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY missing; cannot sample wf_inventory.");
    process.exit(1);
  }

  let rows;
  try {
    rows = await fetchActiveRows(s);
  } catch (e) {
    console.error(`photo-monitor: FAIL — could not read wf_inventory: ${(e && e.message) || e}`);
    process.exit(1);
  }
  if (!rows.length) {
    console.error("photo-monitor: FAIL — zero active rows sampled from wf_inventory.");
    process.exit(1);
  }

  const allCells = sampleCells(rows, { perCell: args.perCell, epoch });
  const probesPerRow = (row) => (row.photo_ref ? 2 : 1);
  const cellCost = (cell) => cell.rows.reduce((sum, r) => sum + probesPerRow(r), 0);
  const totalCost = allCells.reduce((sum, c) => sum + cellCost(c), 0);

  // Amendment A4 — if the full sweep would exceed PROBE_CAP requests, rotate
  // which CELLS run this hour by epoch, greedily, so every cell still gets
  // visited across enough runs rather than the same head of the list winning
  // every time.
  let selectedCells = allCells;
  let capped = false;
  if (totalCost > PROBE_CAP) {
    capped = true;
    const ranked = allCells
      .map((c) => ({ c, h: fnv1a(c.metro + " " + c.category + "|" + epoch) }))
      .sort((a, b) => a.h - b.h);
    selectedCells = [];
    let budget = 0;
    for (const { c } of ranked) {
      const cost = cellCost(c);
      if (budget + cost > PROBE_CAP && selectedCells.length > 0) continue;
      selectedCells.push(c);
      budget += cost;
      if (budget >= PROBE_CAP) break;
    }
  }

  const flatRows = [];
  for (const cell of selectedCells) for (const row of cell.rows) flatRows.push(row);

  let errors = 0;
  const probeResults = await pool(flatRows, CONCURRENCY, async (row) => {
    const pr = await probeUrl(args.baseUrl, row, 640);
    for (const surf of pr.surfaces) if (surf.verdict === "error") errors++;
    return pr;
  });

  const summary = summarize(probeResults);
  const candidates = queueCandidates(probeResults);
  // "unconfigured" is a config outage, not a place defect — never queued
  // (see queueCandidates' header), but still worth surfacing on its own.
  const configOutages = summary.byReason.unconfigured || 0;

  let queueWrites = 0;
  let queueUnavailable = false;
  let queueErrorMessage = null;
  if (args.queue && candidates.length) {
    try {
      queueWrites = await upsertQueueRows(s, candidates);
    } catch (e) {
      queueErrorMessage = String((e && e.message) || e);
      const status = e && e.status != null ? e.status : null;
      queueUnavailable = true;
      console.error(`photo-monitor: queue: unavailable (${status != null ? status : queueErrorMessage})`);
    }
  }

  let renderCheck = null;
  if (args.pages) renderCheck = await renderedPlaceholderRate(args.baseUrl);

  // RUN-OVER-RUN, NOT RUN-VERSUS-TOTAL. The previous run's open TOTAL comes
  // from its own pulse note (`open=<n>`), read back here — the queue itself
  // only ever knows "now", so without that breadcrumb there is no baseline to
  // compare against and the growth condition can only ever be a guess. Both
  // reads happen BEFORE the verdict so the same `recentPulses` serves both.
  // Both reads are fail-soft (empty/null) if the queue is unavailable.
  const recentPulses = await lastPhotoMonitorPulses(s, 6);
  const openTotal = await currentOpenCount(s);
  const previousOpenTotal = parseOpenTotal(recentPulses[0] && recentPulses[0].note);
  const openGrowth = openGrowthRatio(previousOpenTotal, openTotal);

  // A run whose own probe traffic got rate-limited by lib/apiGuard.js's
  // per-IP limit has not measured the placeholder rate reliably — it has
  // measured how much of ITS OWN traffic got throttled. Such a run must
  // never page on placeholder rate (an under-sampled run must not page);
  // it can still page on open-growth, which comes from the queue's own
  // accumulated state, not from this run's reliability.
  const rateLimitedCount = summary.byResult.rateLimited || 0;
  const sampleDegraded = isSampleDegraded(rateLimitedCount, summary.sampled);
  if (sampleDegraded) console.error(SAMPLE_DEGRADED_WARNING + ` (${rateLimitedCount}/${summary.sampled} rate-limited)`);

  const breach = computeBreach({
    placeholderRate: summary.placeholderRate,
    placeholderThreshold: PLACEHOLDER_RATE_THRESHOLD,
    openGrowth,
    openGrowthThreshold: OPEN_GROWTH_THRESHOLD,
    sampleDegraded,
  });
  const primaryReason = Object.entries(summary.byReason).sort((a, b) => b[1] - a[1])[0];
  const dayKey = generatedAt.slice(0, 10);
  const incidentKey = `photos:${(primaryReason && primaryReason[0]) || "unknown"}:${dayKey}`;

  const verdict = pulseVerdict({ breached: breach, key: incidentKey, recentPulses });

  const pct = Math.round(summary.placeholderRate * 100);
  const noteBits = [`placeholder-rate ${pct}% of ${summary.sampled} probes`];
  // `open=<total>` is the breadcrumb the NEXT run parses for its baseline —
  // keep the literal shape parseOpenTotal reads.
  if (openTotal != null) noteBits.push(`open=${openTotal} (+${candidates.length} this run)`);
  if (queueUnavailable) noteBits.push("queue unavailable");
  if (configOutages > 0) noteBits.push(`config-outage=${configOutages}`);
  if (rateLimitedCount > 0) noteBits.push(`rate-limited=${rateLimitedCount}`);
  if (sampleDegraded) noteBits.push("sample-degraded");
  noteBits.push(`key=${incidentKey}`);
  const note = (verdict.suppressed ? "photos: ongoing " : "photos: ") + noteBits.join(" | ");

  await recordPulse("photo-monitor", {
    attempted: summary.sampled,
    succeeded: verdict.succeeded ? Math.max(1, summary.sampled - errors) : 0,
    note: note.slice(0, 200),
  });

  const out = {
    epoch,
    baseUrl: args.baseUrl,
    sampled: summary.sampled,
    byResult: summary.byResult,
    byReason: summary.byReason,
    placeholderRate: summary.placeholderRate,
    configOutages,
    rateLimited: rateLimitedCount,
    sampleDegraded,
    renderedPlaceholderRate: renderCheck && renderCheck.checked ? renderCheck.rate : null,
    renderCheck,
    byMetro: summary.byMetro,
    byCategory: summary.byCategory,
    sampledFrom: { ...summary.sampledFrom, cells: selectedCells.length, cellsTotal: allCells.length, capped, cap: PROBE_CAP },
    queueWrites,
    queueUnavailable,
    queueError: queueErrorMessage,
    openTotal,
    previousOpenTotal,
    openGrowth,
    breach,
    incidentKey,
    generatedAt,
  };

  if (args.json) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(`photo-monitor: sampled ${out.sampled} probes across ${out.sampledFrom.cells}/${out.sampledFrom.cellsTotal} cells`);
    console.log(`  real=${summary.byResult.real} compass=${summary.byResult.compass} miss=${summary.byResult.miss} rateLimited=${summary.byResult.rateLimited} error=${summary.byResult.error}`);
    console.log(`  placeholderRate=${(summary.placeholderRate * 100).toFixed(1)}% queueWrites=${queueWrites} configOutages=${configOutages} sampleDegraded=${sampleDegraded} breach=${breach}`);
    if (queueUnavailable) console.log(`  queue: unavailable (${queueErrorMessage})`);
  }

  // Operational failure only: nothing sampled or everything errored. A high
  // placeholder rate is a finding (already filed as a pulse + queue rows
  // above), never a crash. A missing repair-queue table is likewise never a
  // crash — it is logged and counted above, and this run still exits 0.
  if (summary.sampled === 0 || errors === summary.sampled) {
    console.error("photo-monitor: FAIL — every probe errored; this run could not measure anything.");
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`photo-monitor: FAIL — ${(e && e.stack) || e}`);
    process.exit(1);
  });
}
