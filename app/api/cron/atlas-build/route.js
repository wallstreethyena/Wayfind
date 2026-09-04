import { gateFree, gateShut, spendAllow } from "../../../../lib/spendGate";
// app/api/cron/atlas-build/route.js — bulk-builds the Wayfind "Atlas" editorial
// (atlas-590-v1) for places that don't have one yet. Sources facts from the
// Google Places Details API, writes each entry with Claude, and upserts to
// wf_editorial ON CONFLICT (place_id) DO NOTHING — idempotent + resumable.
//
// v6.49: it now runs on a SCHEDULE (vercel.json, hourly at :15). It was
// hand-triggered only, which is why coverage froze on 2026-07-24 at 503 rows
// against 3,457 inventory places — 6.7% of cards had a reason to go, and the
// owner's report ("lots of detail cards do not have any information as to why
// someone should go") was the pipeline having simply stopped. Each run is
// bounded and self-terminating: once wf_atlas_missing returns empty for every
// category the route returns {done:true} and spends nothing but the RPC.
//
// ┌─ v6.69 — VERIFICATION RUN #2. REDUCED RATE, DIAGNOSTICS DELIBERATELY LIVE. 
// │
// │ The v6.49 note above diagnosed "coverage froze on 2026-07-24" as the
// │ pipeline having STOPPED, and fixed it by adding a schedule. The schedule
// │ works. The generation has failed on every single run since. Measured
// │ 2026-07-29:
// │
// │     last successfully published row   2026-07-24 18:38 UTC
// │     rows written since                525
// │     of which published                0
// │     of which PENDING SOURCE           515
// │
// │ Vercel reports HTTP 200 on every invocation and zero errors in 7 days,
// │ because both failure branches below did `return null` and logged nothing.
// │ A 100% failure rate reads, in every metric anyone was watching, as a
// │ healthy pipeline. The v6.49 fix converted a VISIBLE stop into an INVISIBLE
// │ total failure on the same date.
// │
// │ Worse than idle: wf_atlas_missing skips any row that already has a
// │ wf_editorial record, so each run took 25 eligible places, failed to source
// │ them, wrote PENDING SOURCE, and permanently removed them from its own
// │ future queue — 25 rows/hour of destroyed eligibility plus 50 metered API
// │ calls, for nothing. See issue #438.
// │
// │ THE DESIGN DEFECT: the two failure branches below are completely different
// │ causes (Google Places vs Anthropic) that wrote the SAME label. From the
// │ data you could not tell which service was broken. That is why ATLAS-DIAG
// │ logging exists at both sites.
// │
// │ ROOT CAUSE, CONFIRMED: an Anthropic key created 2026-07-22 whose value in
// │ Vercel never matched it — the console shows that key "Last used: never"
// │ while the previous one went cold the same day. Credits sat at $24.70
// │ throughout, so never a balance problem, and Google was never involved
// │ (GOOGLE_MAPS_SERVER_KEY untouched since Jul 6). Fixed and independently
// │ confirmed: credits began draining again after the redeploy, $24.70 ->
// │ $24.67, after five days of exactly zero spend.
// │
// │ THE VERIFICATION RUN ANSWERED ITS QUESTION AND FOUND A SECOND DEFECT.
// │ Three fires at ?limit=3 (20:15, 21:15, 22:15 on 2026-07-29), 9 rows:
// │     published            0
// │     FAILED VERIFICATION  7
// │     PENDING SOURCE       2
// │ The Anthropic branch IS FIXED, and FAILED VERIFICATION is the proof: that
// │ label can only be written after the model successfully returned a card. The
// │ key was the first defect and it is closed.
// │
// │ The second defect is in lib/atlasVerify, and it was rejecting CORRECTLY
// │ SOURCED hours. Almost every rejection was a clock time:
// │     unsourced-number:know_before:11 AM
// │ Google's weekdayDescriptions say "11:00 AM"; the model writes "11 AM"; norm()
// │ strips ':' so those became "1100am" vs "11am" and never matched. Fixed in
// │ this change by canonicalising ":00" on BOTH sides before comparison.
// │
// │ RE-ARMED at ?limit=3 to verify that fix against live data. Run #1 proved the
// │ Anthropic key (FAILED VERIFICATION can only be written after the model
// │ answers); run #2 is testing whether the time canonicalisation lets those
// │ cards publish. Clean = rows landing with issues NULL.
// │
// │ WHEN IT COMES BACK CLEAN: delete every ATLAS-DIAG line, restore ?limit=25
// │ and drop this notice in ONE change — check-atlas-diag-not-live enforces that
// │ pairing. IF NOT: remove the vercel.json entry again immediately.
// └────────────────────────────────────────────────────────────────────────────
//
// Cost: metered (Google Places Details + Anthropic per place). CRON_SECRET-gated
// (fail-closed). Bounded per call (?limit, ≤25) so each invocation is cheap and
// safe to loop. Never fabricates: every facts[].claim cites a real source; if a
// place can't be sourced it's stored issues=['PENDING SOURCE'] with empty facts.
// Ride-level rows (individual rides inside a park) are stored as RIDE-LEVEL, not
// written. NOTE: model is claude-haiku-4-5 by default (cheap/fast over ~2k rows);
// set ATLAS_MODEL=claude-sonnet-5 in the env for higher editorial quality.
//
// v2 — sourced + verified. Two changes, both measured on an 8-place Orlando batch:
//   1. We fetch the official site's homepage and hand the model its TEXT, not just
//      a link. Places Details alone is ten shallow fields; the page is where the
//      admission gotcha, the tour name and the current exhibit actually live.
//   2. Every card goes through lib/atlasVerify before it is written. A card whose
//      numbers or proper nouns don't appear literally in the sources is stored
//      issues=['FAILED VERIFICATION'] instead of published. This is what stops the
//      invented founding date (three seen across two runs) reaching a row.
import { aiKey } from "../../../../lib/aiKey";
import { sbEnv } from "../../../../lib/serverCache";
import { resolveOverride } from "../../../../lib/envAudit";
import { recordPulse } from "../../../../lib/jobPulse";
import { classifyProviderFailure, breakerOpen, tripBreaker } from "../../../../lib/providerHealth.js";
// Two halves of ONE pipeline, not alternatives:
//   atlasVerify   — fetches the venue's own page and returns the issue list
//                   (this is what catches invented founding dates).
//   atlasEditorial — turns that issue list into the row, deriving `verified`
//                   from it, so a row and the evidence against it cannot
//                   disagree. Replaces this file's old local editorialRow(),
//                   which hardcoded verified:false and left 169 clean rows
//                   invisible to users.
import { pageText, verifyAtlasEditorial, corpusOf } from "../../../../lib/atlasVerify";
import { editorialRow } from "../../../../lib/atlasEditorial";
import { extractModelJson } from "../../../../lib/atlasExtract";
import { hostOfUrl, isDeniedHost } from "../../../../lib/nightlifeRail";
import { isInsidePark } from "../../../../lib/parkZones";
import { jobCannotRun } from "../../../../lib/jobFail";
// WO-D-atlas-cache-batch (2026-09-04): the cacheable system block (the
// atlas-590-v1 standard, inlined verbatim, + the JSON-shape/voice rules) and
// the ride-level skip list now live in lib/atlasCache.js — the ONE place
// scripts/atlas-batch.mjs shares with this route, so the two paths can never
// send the model two different versions of "the standard". See that file's
// header for why caching is honest here (cacheMinimumFor / assessCacheEligibility)
// rather than a decorative cache_control that would be a no-op on Haiku.
import { buildAtlasSystemBlocks, RIDE_RX } from "../../../../lib/atlasCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ROLLOUT ORDER. The route works CATS front-to-back and only moves on when a
// category has no missing rows left, so this array is the rollout schedule, not
// a label. Two things were wrong with the previous value
// ["attractions","nightlife","hotels","food"]:
//   - `shopping` was ABSENT, which is why it sits at 13.5% coverage in Orlando
//     while attractions is at 68.3%. It was never eligible to be worked.
//   - `food` was LAST, and food is the largest and least-covered real category
//     (243 places, 21.8%). The job would have spent weeks on the tail before
//     reaching the thing users open first.
// Owner order, 2026-07-29: Food first, Shopping (incl. Gift Shops) last.
// `beach` (inventory singular — not the Atlas-590 TSV label "beaches") was
// ABSENT, the same defect that hid shopping. The beach rail is a first-class
// surface; without this category wf_atlas_missing never hands Siesta / Lido
// / the rest of the rail to the fleet. Atlas cards still win on the read
// path where they exist; this only lets the cron pick up the missing set.
const CATS = ["food", "attractions", "beach", "nightlife", "hotels", "shopping"];
const METROS = ["tampa", "orlando", "manatee-sarasota"];
// ATLAS_MODEL is a VALUE override, not a presence flag — absent is correct and
// means "use the default". The old form was
//   const MODEL = () => (process.env.ATLAS_MODEL || "claude-haiku-4-5").trim();
// which appeared in NO env audit list at all. Set it to a retired or mistyped
// model and this route hands that string to Anthropic, takes a 404, returns null
// from writeEditorial, and stores the row as PENDING SOURCE — identical in the
// data to a place that genuinely could not be sourced. A typo in an env var must
// not be able to masquerade as a sourcing problem, which is exactly the shape
// that hid 525 failed runs for five days (#440).
//
// resolveOverride classifies rather than throws (lib/envAudit.js owns the
// known-model list). Loud once per process at the point of USE, so it lands in
// this route's own logs and not only in whichever request booted the process.
function MODEL() {
  const o = resolveOverride("ATLAS_MODEL");
  if ((o.status === "unknown" || o.status === "malformed") && !globalThis.__wfAtlasModelWarned) {
    globalThis.__wfAtlasModelWarned = true;
    console.error(`[atlas] ATLAS_MODEL="${o.value}" is ${o.status === "malformed" ? "not a valid model id" : "not a recognised model"} — ${o.spec.consequence}. Unset it to use ${o.spec.fallback}.`);
  }
  return o.value;
}
const GKEY = () => (process.env.GOOGLE_MAPS_SERVER_KEY || "").trim();
// COST GUARD (2026-08-25): editorialSummary removed — atmosphere-tier field,
// bills the call at the top Details SKU. Blurbs generate from the remaining
// fields; re-adding it is an explicit owner spend decision (check-spend-guard).
const PLACE_FIELDS = "id,displayName,formattedAddress,rating,userRatingCount,websiteUri,regularOpeningHours,types,priceLevel,googleMapsUri";

// RIDE_RX (individual rides inside a park skip their own editorial and merge
// into the parent) and the atlas-590-v1 SYSTEM prompt now live in
// lib/atlasCache.js (imported above) — moved there, verbatim, so
// scripts/atlas-batch.mjs shares the exact same rules and skip list rather
// than re-deriving a second copy that could drift. scripts/test-atlas-ride-filter.mjs
// still locks the sample; scripts/test-atlas-build.mjs reads lib/atlasCache.js
// as part of its source union for the prompt-content assertions.

async function placeDetails(placeId, key, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      signal: ctrl.signal,
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": PLACE_FIELDS },
    });
    // TEMPORARY DIAGNOSTIC — see the ATLAS-DIAG note in the file header.
    // Status + Google's own message. The key is in a header we never read back.
    if (!r.ok) {
      let msg = "";
      try { msg = String(((await r.json()) || {}).error?.message || "").slice(0, 200); } catch (e2) { msg = "(unparseable body)"; }
      console.error(`ATLAS-DIAG places status=${r.status} keyLen=${(key || "").length} msg=${msg}`);
      return null;
    }
    return await r.json();
  } catch (e) {
    console.error(`ATLAS-DIAG places threw name=${e && e.name} msg=${String(e && e.message).slice(0, 160)}`);
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Fetch the official homepage so the model writes from the venue's own words.
// Fail-soft and tightly bounded: this runs inside a 60s function alongside the
// Places call and the model call, so one slow site must never sink the batch.
// On failure we fall through to Places-only — exactly the v1 behaviour.
async function officialPage(url, timeoutMs = 5000) {
  if (!/^https?:\/\//i.test(String(url || ""))) return null;
  // AGENTS.md §7 — no automated requests against Disney hosts, whatever the
  // reason. This function fetches whatever websiteUri Places returns, and until
  // now nothing stopped it: adding `shopping` to CATS puts World of Disney, The
  // Art of Disney, DisneyStyle, Creations Shop, Disney's Character Warehouse and
  // the Cirque du Soleil Store into the work queue, and their websiteUri is a
  // disney.go.com URL. The rule would have been broken by a config change that
  // never mentioned Disney. Gate the FETCH, not the category list, so the same
  // thing cannot happen again the next time a category is added.
  //
  // Same entity rule as lib/nightlifeRail.isDeniedHost and
  // scripts/check-no-disney-sources.mjs — suffix match on a known property OR
  // any label containing the token "disney". Falling through returns null, which
  // is the existing Places-only path: the place still gets an editorial, written
  // from Google Places data alone.
  if (isDeniedHost(hostOfUrl(url))) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal, redirect: "follow", cache: "no-store",
      headers: { "user-agent": "Mozilla/5.0 (compatible; WayfindEditorial/1.0; +https://gowayfind.com)" },
    });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "";
    if (!/text\/html|text\/plain/i.test(ct)) return null;
    // Never pull an unbounded body into a 60s function's memory.
    const len = parseInt(r.headers.get("content-length") || "0", 10);
    if (len > 3_000_000) return null;
    const text = pageText(await r.text());
    return text.length > 200 ? { url, text } : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function writeEditorial(place, d, key, sources, stats, systemBlocks, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const ctx = {
    name: place.name,
    category: place.category,
    address: d.formattedAddress || null,
    website: d.websiteUri || null,
    google_maps_url: d.googleMapsUri || null,
    rating: typeof d.rating === "number" ? d.rating : null,
    reviews: typeof d.userRatingCount === "number" ? d.userRatingCount : null,
    hours: (d.regularOpeningHours && d.regularOpeningHours.weekdayDescriptions) || null,
    google_summary: (d.editorialSummary && d.editorialSummary.text) || null,
    types: Array.isArray(d.types) ? d.types.slice(0, 8) : null,
    price_level: d.priceLevel || null,
    official_page_text: (sources || []).map((s) => `--- ${s.url}\n${s.text}`).join("\n\n") || null,
  };
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      cache: "no-store",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL(), max_tokens: 700, temperature: 0.4, system: systemBlocks,
        messages: [{ role: "user", content: "Write the atlas-590-v1 editorial for this place. Source every claim from the website or Google Maps URL provided; invent nothing.\n\n" + JSON.stringify(ctx) }],
      }),
    });
    // TEMPORARY DIAGNOSTIC — remove once the 100%-failure cause is identified.
    // See the ATLAS-DIAG note in the file header. Status + provider message only;
    // the key is never read here and must never be logged.
    if (!r.ok) {
      let msg = "";
      try { msg = String(((await r.json()) || {}).error?.message || "").slice(0, 200); } catch (e) { msg = "(unparseable body)"; }
      console.error(`ATLAS-DIAG anthropic status=${r.status} model=${MODEL()} msg=${msg}`);
      // BILLING/QUOTA IS DETERMINISTIC (2026-08-25, the 579-call incident):
      // the next call in this batch cannot succeed either. Halt the run and
      // trip the cross-run breaker so subsequent invocations skip the batch
      // entirely until the cooldown passes or a human adds credits.
      const kind = classifyProviderFailure(r.status, msg);
      if (kind && stats) {
        stats.providerHalt = { kind, msg: `anthropic ${r.status}: ${msg}`.slice(0, 180) };
        tripBreaker("anthropic", kind, stats.providerHalt.msg).catch(() => {});
      }
      return null;
    }
    const j = await r.json();
    const txt = (j && j.content && j.content[0] && j.content[0].text) || "";
    // Tolerant extraction (lib/atlasExtract): first-balanced-span scan plus
    // truncation salvage. The old greedy any-span regex + raw JSON.parse threw
    // SyntaxError on every max_tokens-truncated reply (prod cluster since
    // 07-29) and the place was stored PENDING SOURCE despite a usable answer.
    // Salvage keeps only COMPLETE leading elements — never a half-written
    // string — and lib/atlasVerify downstream still gates every fact, so a
    // salvaged card clears the same honesty bar as a whole one.
    const ext = extractModelJson(txt);
    if (!ext) {
      console.error(`ATLAS-DIAG anthropic ok-but-no-json stop=${j && j.stop_reason} len=${txt.length} head=${txt.slice(0, 120)}`);
      return null;
    }
    if (ext.salvaged) {
      if (stats) stats.salvaged++;
      console.warn(`[atlas] salvaged truncated JSON stop=${j && j.stop_reason} len=${txt.length} droppedTail=${ext.dropped}`);
    }
    return ext.value;
  } catch (e) {
    console.error(`ATLAS-DIAG anthropic threw name=${e && e.name} msg=${String(e && e.message).slice(0, 160)}`);
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function pool(items, limit, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, async () => {
    while (i < items.length) { const j = i++; out[j] = await fn(items[j], j); }
  }));
  return out;
}

// The row shape and the publish decision live in lib/atlasEditorial.js — pure,
// and unit-tested with real inputs by scripts/test-atlas-editorial-row.mjs. This
// route decides WHEN to give up on a place; that module decides whether what came
// back is publishable.

export async function GET(req) {
  // The owned Atlas is permanent. Free mode serves that library and must not
  // schedule paid Details + model calls to buy the same records again.
  if (gateShut() || gateFree()) return Response.json({ skipped: "gate " + (gateShut() ? "shut" : "free: atlas re-buy is disabled") });
  const url = new URL(req.url);
  const retryMode = url.searchParams.get("retry") === "1";
  const refreshMode = !retryMode && url.searchParams.get("refresh") === "1";
  const pulse = (opts) => {
    if (refreshMode) return recordPulse("atlas-refresh", opts);
    if (retryMode) return recordPulse("atlas-retry", opts);
    return recordPulse("atlas-build", opts);
  };
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || (auth !== "Bearer " + secret && url.searchParams.get("key") !== secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const s = sbEnv();
  const gkey = GKEY();
  const akey = aiKey();
  if (!s) return jobCannotRun("atlas-build", "SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing");
  if (!gkey || !akey) return jobCannotRun("atlas-build", "GOOGLE_MAPS_SERVER_KEY or ANTHROPIC_API_KEY is missing");
  const svcH = { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json" };

  // THE CACHE HONESTY GATE, computed ONCE per invocation (both blocks are
  // place-independent — see lib/atlasCache.js). MODEL() here is the trickle
  // path's own model (ATLAS_MODEL, default claude-haiku-4-5) — deliberately
  // untouched by WO-D-atlas-cache-batch item 2: the batch path gets its own
  // ATLAS_BATCH_MODEL default (claude-sonnet-5) precisely so it can clear the
  // cache minimum without changing what runs here. sysInfo.eligible is
  // usually FALSE on this path today (the inlined-standard prefix is ~2,650
  // tokens against Haiku's documented 4,096-token minimum) — that is the
  // honest answer, not a bug, and it is why cacheEligible is stamped into
  // EVERY pulse note below (cachePulseFragment) rather than silently assumed
  // either way. Computed before the circuit breaker so even an early-exit
  // pulse states it.
  const sysInfo = buildAtlasSystemBlocks(MODEL());
  const cachePulseFragment = `cacheEligible=${sysInfo.eligible} tokens=${sysInfo.tokens} min=${sysInfo.min ?? "unknown"} model=${sysInfo.model}`;

  // CIRCUIT BREAKER (2026-08-25, after the 579-call billing incident). If a
  // previous run proved the provider is refusing for a deterministic reason
  // (billing/quota), skip the whole batch — no Places spend, no model calls —
  // until the cooldown passes. attempted:1/succeeded:0 keeps the dead-run
  // streak accumulating so job-watch pages instead of reading this as idle.
  {
    const down = await breakerOpen("anthropic");
    if (down) {
      await pulse({
        attempted: 1, succeeded: 0,
        // "billing:"/"quota:" MUST stay the first four-plus chars — classifyHealth
        // pattern-matches the START of the note, so cachePulseFragment goes after.
        note: ((down.kind === "billing" ? "billing: " : "quota: ") + "anthropic circuit open — " + (down.reason || "") + " | " + cachePulseFragment).slice(0, 200),
      });
      return Response.json({ ok: false, skipped: "anthropic-circuit-open", kind: down.kind, reason: down.reason, since: down.at });
    }
  }

  const limit = Math.max(1, Math.min(parseInt(url.searchParams.get("limit") || "10", 10) || 10, 25));
  const reqCat = (url.searchParams.get("category") || "").trim();
  // RETRY MODE. Same generation machinery, different selector and different
  // write. wf_atlas_missing returns places with NO row; wf_atlas_retryable
  // returns places whose row says PENDING SOURCE and which pass the four rules
  // (survived reclassification, not §7-blocked, attempt_count < 2 with a
  // cooldown, operational, ordered by reviews desc). Reusing this route rather
  // than forking one means the §7 gate, the verifier and the deadline guard
  // cannot drift between the two paths.
  // REFRESH MODE rewrites only verified rows older than 21 days. Failed
  // refreshes never write, so the last good editorial remains publishable.

  // Pick the category to work: the requested one, else the first (in owner order)
  // that still has missing rows.
  // A FAILED SELECTOR IS NOT AN EMPTY QUEUE. This used to return [] on any
  // non-2xx, so an unreachable selector produced `done: true, "no missing rows"`
  // and job-watch saw a healthy idle job. On 2026-08-05 that hid a 401 (the
  // service key is a legacy JWT; legacy keys were disabled 2026-07-16) — the
  // backlog looked drained while nothing could be selected at all. Exactly the
  // shape of the 5-day outage that ran behind HTTP 200s.
  let selectorError = null;
  async function missing(cat) {
    try {
      const selector = refreshMode ? "wf_atlas_stale" : retryMode ? "wf_atlas_retryable" : "wf_atlas_missing";
      const r = await fetch(`${s.url}/rest/v1/rpc/${selector}`, {
        method: "POST", headers: svcH, cache: "no-store",
        body: JSON.stringify({ p_category: cat, p_metros: METROS, p_limit: limit }),
      });
      if (!r.ok) { selectorError = `rpc ${r.status}`; return []; }
      return await r.json();
    } catch (e) { selectorError = "rpc threw"; return []; }
  }

  let category = reqCat, places = [];
  if (retryMode && !category) {
    // The backlog is worked by VALUE, not category by category: these rows
    // failed for a reason that had nothing to do with what they are.
    category = "(retry)";
    places = await missing("");
  } else if (category) {
    places = await missing(category);
  } else {
    for (const c of CATS) { const rows = await missing(c); if (Array.isArray(rows) && rows.length) { category = c; places = rows; break; } }
  }
  if (!category || !places.length) {
    // Idle, not broken. attempted:0 is what stops a self-terminating job from
    // reading as an incident in /api/cron/job-watch.
    // Idle and BROKEN are now different outcomes. An empty queue is `done`;
    // a selector that could not be reached is an error with a non-200, so
    // job-watch pages instead of recording a healthy no-op.
    if (selectorError) {
      await pulse({ attempted: 0, succeeded: 0, note: ("SELECTOR UNREACHABLE: " + selectorError + " | " + cachePulseFragment).slice(0, 200) });
      return Response.json({ ok: false, done: false, error: "selector-unreachable", detail: selectorError }, { status: 503 });
    }
    await pulse({
      attempted: 0, succeeded: 0,
      note: ((refreshMode ? "no verified editorial older than 21 days" : "no missing rows in target categories/metros") + " | " + cachePulseFragment).slice(0, 200),
    });
    return Response.json({ ok: true, done: true, note: "no missing rows in target categories/metros" });
  }

  const nowIso = new Date().toISOString();
  const rows = [];
  // MERGE NOTE (v6.49 onto #383): both branches independently added a wall-clock
  // budget to this loop — #383's `deadline`/42s/`skipped`, and v6.49's
  // `DISPATCH_DEADLINE_MS`/45s/`deferred`. They solve the identical problem, so
  // keeping both would double-count and report two different numbers for one
  // thing. Kept v6.49's: it reserves the tail explicitly for the upsert rather
  // than picking one absolute instant, and its `startedAt` is what `took_ms`
  // below is measured from. #383's `unverified` and `withPage` counters are
  // untouched — those count verification outcomes, not time, and nothing in
  // v6.49 replaces them.
  let rides = 0, sourced = 0, pending = 0, unverified = 0, withPage = 0, deferred = 0;
  // Salvage visibility: how many replies needed truncation salvage this run.
  // Persistently non-zero means max_tokens is too tight for the page corpus.
  const stats = { salvaged: 0 };

  // v6.49 DEADLINE GUARD. The upsert happens once, after every place resolves,
  // so a run that overruns maxDuration loses the WHOLE batch — every Places
  // Details call and every model call in it, paid for and thrown away.
  //
  // The arithmetic that makes this reachable: pool() runs 6 at a time, so
  // limit=25 is 5 rounds, and one round can cost the placeDetails timeout (8s)
  // plus the writeEditorial timeout (20s) = 28s. Five slow rounds is 140s
  // against a 60s budget. It has not bitten yet only because the model usually
  // answers in a few seconds — i.e. we were relying on latency luck, and this
  // route is about to run unattended on a schedule instead of by hand.
  //
  // So: stop DISPATCHING new places at 45s and keep the remaining 15s for the
  // upsert and the response. A deferred place simply gets no row, which means
  // wf_atlas_missing hands it back on the next run — the file's stated
  // resumable design, now actually load-bearing rather than incidental.
  const startedAt = Date.now();
  const DISPATCH_DEADLINE_MS = 45000;

  await pool(places, 6, async (place) => {
    if (Date.now() - startedAt > DISPATCH_DEADLINE_MS) { deferred++; return; } // stays in wf_atlas_missing, picked up next run
    // In-run circuit: after one billing/quota refusal, every further place this
    // run would spend a Places call + page fetch feeding a provider that cannot
    // answer. Defer instead — wf_atlas_missing hands them back once it recovers.
    if (stats.providerHalt) { deferred++; return; }
    // ride-level → store as RIDE-LEVEL, never written/sourced
    const parkZone = isInsidePark(place.lat, place.lng, place.name);
    if (RIDE_RX.test(String(place.name || "")) || parkZone) {
      rides++;
      if (!refreshMode) rows.push(editorialRow(place, null, nowIso, ["RIDE-LEVEL — merge into parent park"]));
      return;
    }
    if (!(await spendAllow("details_enterprise"))) { deferred++; return; }
    const d = await placeDetails(place.place_id, gkey);
    if (!d) { pending++; if (!refreshMode) rows.push(editorialRow(place, null, nowIso, ["PENDING SOURCE"])); return; }

    // The venue's own words, when we can get them. Fail-soft → Places-only.
    const page = await officialPage(d.websiteUri);
    const sources = page ? [page] : [];
    if (page) withPage++;

    const parsed = await writeEditorial(place, d, akey, sources, stats, sysInfo.blocks);
    if (!parsed || parsed.pending === true || !parsed.hook) {
      // A venue whose only official source is a Disney host can NEVER be sourced
      // — §7 forbids the fetch, permanently. Labelling that PENDING SOURCE put it
      // in the retry queue forever, where every attempt is a guaranteed no-op
      // that still costs a Places call. Say which it is.
      const blocked = isDeniedHost(hostOfUrl(d.websiteUri));
      pending++;
      if (!refreshMode) rows.push(editorialRow(place, null, nowIso, [blocked ? "BLOCKED — §7 source" : "PENDING SOURCE"]));
      return;
    }

    // The honesty gate. A claim we cannot trace to what the model was shown does
    // not get published — it is parked for the owner with the reason attached.
    const ctxForCheck = {
      name: place.name, address: d.formattedAddress,
      google_summary: (d.editorialSummary && d.editorialSummary.text) || "",
      hours: (d.regularOpeningHours && d.regularOpeningHours.weekdayDescriptions) || [],
      rating: typeof d.rating === "number" ? d.rating : null,
      reviews: typeof d.userRatingCount === "number" ? d.userRatingCount : null,
    };
    // §7 again, on the CITATION side. officialPage() no longer fetches a Disney
    // host, but websiteUri was still being handed to the verifier as a permitted
    // source — so a card could cite a page we are not allowed to have read, and
    // the guard's whole point is that a Disney URL never appears as a source.
    const allowed = [d.websiteUri, d.googleMapsUri, ...(sources.map((s) => s.url))]
      .filter(Boolean)
      .filter((u) => !isDeniedHost(hostOfUrl(u)));
    const problems = verifyAtlasEditorial(parsed, corpusOf(ctxForCheck, sources), allowed);
    if (problems.length) {
      unverified++;
      const detail = problems.slice(0, 6).map((p) => `${p.check}:${p.field}:${p.value}`.slice(0, 90));
      if (!refreshMode) rows.push(editorialRow(place, null, nowIso, ["FAILED VERIFICATION", ...detail]));
      return;
    }

    sourced++;
    rows.push(editorialRow(place, parsed, nowIso, null));
  });

  // Upsert — ON CONFLICT (place_id) DO NOTHING keeps the 373 existing rows safe.
  let written = 0, upErr = null;
  if (rows.length) {
    if (retryMode) {
      // These rows ALREADY EXIST, so the insert path (resolution=ignore-duplicates)
      // would silently do nothing — the retry would report success and change
      // not one row. Update each, and bump attempt_count/last_attempted_at on
      // EVERY outcome: a retry that failed is still an attempt, and not counting
      // it is how a bounded retry quietly becomes an unbounded one.
      let okCount = 0;
      for (const row of rows) {
        try {
          const rr = await fetch(`${s.url}/rest/v1/rpc/wf_editorial_record_attempt`, {
            method: "POST", headers: { ...svcH, "content-type": "application/json" },
            body: JSON.stringify({ p_place_id: row.place_id, p_issues: row.issues && row.issues.length ? row.issues : null }),
            cache: "no-store",
          });
          if (rr.ok) okCount++; else upErr = `retry update http ${rr.status}`;
        } catch (e) { upErr = `retry update threw ${String(e && e.message).slice(0, 100)}`; }
      }
      written = okCount;
    } else if (refreshMode) {
      // Refresh rows are all verified (failure paths above do not enqueue a
      // row). Merge replaces a 21-day-old card only after its replacement has
      // cleared the same sourcing and verification gates as the original.
      const h = { ...svcH, Prefer: "resolution=merge-duplicates,return=minimal" };
      const r = await fetch(`${s.url}/rest/v1/wf_editorial?on_conflict=place_id`, { method: "POST", headers: h, body: JSON.stringify(rows), cache: "no-store" });
      if (r.ok) written = rows.length; else upErr = `refresh upsert http ${r.status}: ${(await r.text()).slice(0, 160)}`;
    } else {
      const h = { ...svcH, Prefer: "resolution=ignore-duplicates,return=minimal" };
      const r = await fetch(`${s.url}/rest/v1/wf_editorial?on_conflict=place_id`, { method: "POST", headers: h, body: JSON.stringify(rows), cache: "no-store" });
      if (r.ok) written = rows.length; else upErr = `upsert http ${r.status}: ${(await r.text()).slice(0, 160)}`;
    }
  }

  // Affiliate opportunities: bookable places (attractions/hotels) with no verified
  // product yet get flagged for follow-up. Bounded to this batch. Fail-soft.
  let opps = 0;
  if (!upErr && (category === "attractions" || category === "hotels")) {
    try {
      const ids = rows.filter((r) => !r.issues).map((r) => r.place_id);
      if (ids.length) {
        const pr = await fetch(`${s.url}/rest/v1/wf_place_products?rn=eq.1&place_id=in.(${ids.join(",")})&select=place_id`, { headers: svcH, cache: "no-store" });
        const have = new Set((pr.ok ? await pr.json() : []).map((x) => x.place_id));
        const oppRows = places
          .filter((p) => ids.includes(p.place_id) && !have.has(p.place_id))
          .map((p) => ({ place_id: p.place_id, name: p.name, category: p.category, reason: "atlas: bookable, no verified product", suggested_partner: category === "hotels" ? "stay22" : "viator" }));
        if (oppRows.length) {
          const or = await fetch(`${s.url}/rest/v1/wf_affiliate_opportunities?on_conflict=place_id`, { method: "POST", headers: { ...svcH, Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(oppRows), cache: "no-store" });
          if (or.ok) opps = oppRows.length;
        }
      }
    } catch (e) {}
  }

  const left = await missing(category);

  // THE PULSE. `succeeded` is PUBLISHED rows, not written ones — that distinction
  // is the entire lesson of the five-day outage: 525 rows were written and zero
  // published, and every layer that was watching counted the writes. Recorded on
  // every path including failures; a job that only pulses when it succeeds is
  // exactly as blind as one that never pulses.
  const publishedCount = rows.filter((r) => r.verified).length;
  // HONESTY FIX (2026-09-04, WO-C). `places.length > 0` is guaranteed here —
  // the `!category || !places.length` branch above already returned for a
  // genuinely empty queue, with its own note. So reaching this point with
  // `rows.length === 0` means every candidate was DEFERRED (spend-gate
  // ledger exhausted, the in-run deadline, or a mid-batch provider halt) —
  // real work existed and none of it happened. The pulse used to read
  // `attempted: rows.length` (0) with `note: null` in that case: identical,
  // byte for byte, to a healthy idle run with nothing to do. That is the
  // exact failure this repo already has a name for (job-watch's own docstring:
  // "a job that ATTEMPTS work and SUCCEEDS at none of it... looks healthy from
  // the outside") — just relocated one level down, from "the cron never runs"
  // to "the cron runs and every candidate silently starves." Measured live
  // 2026-09-04: five consecutive real runs (atlas-build/-retry/-refresh,
  // 07:15-08:35 UTC) posted attempted:0/note:null while wf_spend_ledger shows
  // details_enterprise at 950/950 for September — the shared free-tier SKU
  // this route now draws from via spendAllow() (see the route header) was
  // already maxed by live traffic before this route's per-call gate even
  // shipped. `attempted: places.length` here (not rows.length) is what makes
  // classifyHealth() see "work existed, nothing succeeded" instead of "idle"
  // — job-watch pages after DEAD_RUN_THRESHOLD consecutive dead runs, which
  // is the correct outcome: this state does not clear on its own retry.
  const failureNote = stats.providerHalt
    // "billing:"/"quota:" prefix is the escalation hook: classifyHealth
    // treats it as an incident after ONE dead run, not DEAD_RUN_THRESHOLD.
    ? `${stats.providerHalt.kind}: ${stats.providerHalt.msg}`
    : rows.length === 0
      ? `budget: 0 of ${places.length} candidates written — ${deferred} deferred (spend gate / deadline)`
      : publishedCount === 0 && rows.length > 0
        ? `0 published of ${rows.length}: pending=${pending} unverified=${unverified} with_page=${withPage}`
        : null;
  // cachePulseFragment ALWAYS rides along — WO-D-atlas-cache-batch's binding
  // requirement is that cacheEligible never be a silent no-op, on a healthy
  // run exactly as much as a broken one. It goes AFTER the billing/quota
  // prefix (never before it — classifyHealth's escalation match is anchored
  // to the start of the note) and is the WHOLE note on an otherwise-quiet
  // successful run, where the old code wrote `null`.
  await pulse({
    attempted: rows.length || places.length,
    succeeded: publishedCount,
    note: [failureNote, cachePulseFragment].filter(Boolean).join(" | ").slice(0, 200) || null,
  });

  return Response.json({
    // `processed` counts places that actually produced a row. It used to report
    // places.length, which silently equalled the batch size even when the run
    // fell over — with the deadline guard live, `deferred` is the difference and
    // a persistently non-zero deferred is the signal to lower ?limit.
    ok: !upErr, mode: refreshMode ? "refresh" : retryMode ? "retry" : "build", category, processed: rows.length, deferred, written,
    // `sourced` is "the model answered"; `published` is "it cleared the content
    // bar and a user will see it". They used to be the same number by
    // assumption; a gap between them is the run telling you the model is
    // producing thin cards, which is worth knowing before 2,900 of them exist.
    published: rows.filter((r) => r.verified).length,
    // From #383, kept: these count VERIFICATION outcomes, which is a different
    // question from either timing or publishability. `unverified` is how many
    // the honesty gate rejected for inventing facts; `with_page` is how many had
    // the venue's own words to check against at all — a low with_page is why a
    // batch verifies badly, so losing it would hide the cause.
    unverified, with_page: withPage,
    sourced, pending, rides, salvaged: stats.salvaged, opportunities: opps,
    provider_halt: stats.providerHalt || null,
    took_ms: Date.now() - startedAt,
    remaining_after: Array.isArray(left) ? left.length + "+ (paged)" : "?", error: upErr, model: MODEL(),
    // Stated plainly on every response, not just the pulse note: whether the
    // cache_control this run attached (if any) can do anything real.
    cache: { eligible: sysInfo.eligible, prefix_tokens: sysInfo.tokens, model_minimum: sysInfo.min, reason: sysInfo.reason },
  }, { headers: { "Cache-Control": "no-store" } });
}
