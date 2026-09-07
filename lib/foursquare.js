// lib/foursquare.js — THE ONE FOURSQUARE PROVIDER-SELECTION RULE.
//
// WHY THIS FILE EXISTS (2026-09-04 audit). Foursquare has two key generations
// and two hosts:
//
//   legacy v3   api.foursquare.com/v3/places/search   `fsq3…` keys, bare Authorization
//   current     places-api.foursquare.com/places/search  service keys, Bearer + X-Places-Api-Version
//
// v3 was SUNSET 2026-05-15. Three call sites each hand-rolled the same
// try-v3-then-fall-through chain, and two of them fell through on an ENUMERATED
// status list:
//
//     let r = await fetch(v3…);
//     if (r.status === 401 || r.status === 403) r = await fetch(current…);
//
// After the sunset v3 stopped answering 401/403 and started answering **429**.
// 429 was not in the list, so the fallthrough never fired, `r.ok` was false, and
// every caller fail-softed to an empty list. Foursquare contributed ZERO rows
// from 2026-05-15 until this fix while still reporting as a configured source,
// leaving Google as the only paid general-venue search. `lib/popularity.js` was
// repaired in isolation (v8.29.14, #892) and the repair was never propagated —
// which is the drift this module exists to make impossible.
//
// THE RULE, STATED ONCE:
//
//   1. A key that starts with `fsq3` is a legacy key: try v3, then current.
//      Anything else is a service key: go straight to current. (A modern key
//      probing v3 is a guaranteed-dead round trip — ~1,200 wasted requests a
//      day at popularity's cadence, the reason #892 added the prefix test.)
//   2. AN ATTEMPT THAT DOES NOT YIELD A USABLE RESPONSE NEVER TERMINATES THE
//      CHAIN. Not 401, not 403, not 429, not 5xx, not a network throw, not a
//      timeout. We advance to the next generation regardless of WHY. This
//      function deliberately ENUMERATES NO STATUS CODES, because enumerating
//      them is precisely what broke: any list is a list that the next upstream
//      change can fall outside of.
//   2b. "Usable" means STRUCTURALLY VALID, not non-empty. A 200 carrying
//      `results: []` is a real answer from a sparse area and TERMINATES the
//      chain; a 200 with no results array at all is a shape we do not
//      recognise and ADVANCES it. Conflating those two is how "usable
//      response" silently becomes "response with at least one place", which
//      would buy a second provider request on every quiet query.
//   3. Exhausting the chain FAILS SOFT (never throws) and is OBSERVABLE: the
//      result carries every attempt with its generation and outcome, so a dead
//      source names itself instead of looking like "no results near you".
//   4. Foursquare failing must NEVER cause a compensating Google call. Callers
//      run the two providers in parallel (lib/sources.js `Promise.all`), and
//      this module returns an empty-but-honest result rather than signalling
//      anyone to go spend elsewhere. Locked by scripts/test-foursquare.mjs.

import { breakerOpen, tripBreaker, classifyProviderFailure } from "./providerHealth.js";
import { providerSpendAllow } from "./providerSpend.js";

export const FSQ_V3_URL = "https://api.foursquare.com/v3/places/search";
export const FSQ_CURRENT_URL = "https://places-api.foursquare.com/places/search";
export const FSQ_PLACES_API_VERSION = "2025-06-17";
export const FSQ_V3_SUNSET = "2026-05-15";
export const FSQ_TIMEOUT_MS = 5000;

// THE ONE FOURSQUARE BREAKER KEY (2026-09-06). #1118 (this module) fixed the
// dead-v3 fallback — a real, separate bug — and production STILL measured 0
// results afterward: `wf_job_pulse` showed the CURRENT (non-sunset) Places API
// answering http_429 on EVERY ONE of ~30 calls/run for 3+ continuous days
// (2026-09-03 14:23Z onward), at the exact call volume that ran clean days
// earlier. A bad key returns 401 here (verified by call — lib/popularity.js's
// v8.29.14 note), so a PERSISTENT 429 with a valid key names the account's
// quota/plan as exhausted, not the request rate — retrying cannot help, and
// every retry burns a round trip against a quota that only recovers on its own
// schedule. Same shape, same day (2026-09-03), as the OpenWebNinja breaker in
// app/api/events/route.js (429 in four cities in the same second). REUSED, not
// reinvented: one shared breaker in lib/providerHealth.js. Shared by every
// Foursquare caller — this module's fsqSearch() AND lib/popularity.js's
// fetchFoursquare(), which calls fsqAttemptChain()/fsqRequest() directly — so
// one discovery, from any caller, protects all of them and every warm lambda.
export const FSQ_BREAKER = "foursquare";

// Foursquare-specific cooldown, longer than providerHealth's generic 30-minute
// default. That default is sized for an HOURLY cron ("short enough that a
// top-up is picked up within the hour"); the popularity cron that drives most
// Foursquare volume runs every 2 HOURS (vercel.json), and the measured
// incident was a multi-DAY quota exhaustion, not a same-hour blip. 30 minutes
// would expire mid-cycle and let almost every run pay for rediscovering the
// same 429 at full cost. 4 hours covers at least one full cron cycle end to
// end while staying well inside "a same-day fix is picked up without a
// deploy" — and an operator who fixes the account sooner is not stuck
// waiting: /api/cron/breaker-reset?provider=foursquare clears it early.
export const FSQ_BREAKER_COOLDOWN_MS = 4 * 60 * 60 * 1000;

/**
 * Does this payload satisfy the DOCUMENTED response contract for its generation?
 *
 * Both generations document a top-level `results` array of place objects; they
 * differ only in the id field (`fsq_id` on legacy v3, `fsq_place_id` on the
 * current Places API), which is why callers already read `fsq_place_id || fsq_id`.
 *
 * This is deliberately a CONTRACT check, not a generic "is it JSON" check. An
 * error envelope ({message}/{error}), an HTML interstitial parsed as text, or a
 * schema change that renames the collection are all things a provider can return
 * with HTTP 200 — and reading any of them as "zero places nearby" is how a
 * provider failure becomes believable empty inventory. An empty `results` array
 * is the ONE shape that legitimately means zero places.
 */
export function validateFsqPayload(generation, data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { valid: false, why: "not_an_object" };
  if (!Array.isArray(data.results)) return { valid: false, why: "no_results_array" };
  if (data.results.length === 0) return { valid: true, empty: true };
  const first = data.results[0];
  if (!first || typeof first !== "object") return { valid: false, why: "results_not_objects" };
  const hasId = first.fsq_place_id != null || first.fsq_id != null;
  const hasName = typeof first.name === "string";
  if (!hasId && !hasName) return { valid: false, why: "not_place_shaped" };
  return { valid: true, empty: false };
}

/** A legacy `fsq3…` credential — the only generation for which v3 ever worked. */
export function isLegacyFsqKey(key) {
  return String(key || "").startsWith("fsq3");
}

/**
 * The generations to attempt, in order, for this credential.
 * Legacy key -> ["v3", "current"].  Service key -> ["current"].  No key -> [].
 */
export function fsqAttemptChain(key) {
  if (!String(key || "").trim()) return [];
  return isLegacyFsqKey(key) ? ["v3", "current"] : ["current"];
}

/**
 * Build the request for one generation. `fields` is a v3-only concept — the
 * current Places API returns the caller's full plan fields and rejects nothing,
 * so passing a fields list there would be meaningless at best.
 */
export function fsqRequest(generation, params, key, opts = {}) {
  if (generation === "v3") {
    const f = opts.fields ? "&fields=" + encodeURIComponent(opts.fields) : "";
    return {
      url: FSQ_V3_URL + "?" + params + f,
      init: { headers: { Authorization: key, Accept: "application/json" } },
    };
  }
  return {
    url: FSQ_CURRENT_URL + "?" + params,
    init: {
      headers: {
        Authorization: "Bearer " + key,
        "X-Places-Api-Version": FSQ_PLACES_API_VERSION,
        Accept: "application/json",
      },
    },
  };
}

/**
 * Run the chain. Resolves to:
 *   { ok, status, generation, data, results, attempts:[{generation,status,reason}], reason }
 * Never throws, never enumerates a status, never advises a caller to spend elsewhere.
 *
 * opts.fetchImpl lets the controls drive every branch without a network.
 */
export async function fsqSearch(params, key, opts = {}) {
  const doFetch = opts.fetchImpl || fetch;
  const timeoutMs = opts.timeoutMs == null ? FSQ_TIMEOUT_MS : opts.timeoutMs;
  const chain = fsqAttemptChain(key);
  const attempts = [];

  if (!chain.length) {
    return { ok: false, status: null, generation: null, data: null, results: [], attempts, reason: "no_key" };
  }

  // See FSQ_BREAKER above. An open breaker means a PRIOR call already proved
  // the current generation is quota/plan-exhausted — skip the network chain
  // entirely (v3 included: it is permanently gone post-sunset regardless of
  // account health) rather than rediscovering the same 429 at full request cost.
  const held = await breakerOpen(FSQ_BREAKER);
  if (held) {
    return { ok: false, status: null, generation: null, data: null, results: [], attempts: [{ generation: "breaker", status: null, reason: "breaker_open" }], reason: "breaker_open", breaker: held };
  }

  for (const generation of chain) {
    const { url, init } = fsqRequest(generation, params, key, opts);
    let ctrl = null, timer = null;
    try {
      let signal;
      if (timeoutMs > 0 && typeof AbortController === "function") {
        ctrl = new AbortController();
        timer = setTimeout(() => ctrl.abort(), timeoutMs);
        signal = ctrl.signal;
      }
      // A legacy key can have two hosts, so each actual provider request gets
      // its own atomic grant. Test fetches inject their own allowance.
      const allowSpend = opts.spendAllow || (opts.fetchImpl ? async () => true : providerSpendAllow);
      if (!(await allowSpend("foursquare"))) {
        attempts.push({ generation, status: null, reason: "spend_denied" });
        return { ok: false, status: null, generation: null, data: null, results: [], attempts, reason: "spend_denied" };
      }
      const r = await doFetch(url, signal ? { ...init, signal } : init);
      // RULE 2. Any non-ok status advances the chain. No status is named here.
      if (!r || !r.ok) {
        attempts.push({ generation, status: r ? r.status : null, reason: "http_" + (r ? r.status : "none") });
        continue;
      }
      let data = null;
      try {
        data = await r.json();
      } catch (e) {
        attempts.push({ generation, status: r.status, reason: "bad_json" });
        continue; // a 200 we cannot parse is a failed attempt, not a usable one
      }
      // THREE-WAY, and the middle case is the subtle one:
      //   valid + empty  -> TERMINATE NORMALLY. A sparse area legitimately has
      //                     no matching venues. Advancing here would spend a
      //                     second provider request on every quiet query and
      //                     quietly redefine "usable response" as "response
      //                     containing at least one place".
      //   malformed 200  -> ADVANCE. A 200 with no results ARRAY is not an
      //                     empty answer, it is a shape we do not recognise
      //                     (an error envelope, a changed schema, an HTML
      //                     interstitial). Treating it as "zero results" is
      //                     precisely the looks-configured-returns-nothing
      //                     failure this module exists to end.
      //   http/network   -> ADVANCE (handled above).
      const contract = validateFsqPayload(generation, data);
      if (!contract.valid) {
        attempts.push({ generation, status: r.status, reason: "malformed", why: contract.why });
        continue;
      }
      attempts.push({ generation, status: r.status, reason: "ok", results: data.results.length });
      return { ok: true, status: r.status, generation, data, results: data.results, attempts, reason: "ok", empty: !!contract.empty };
    } catch (e) {
      // RULE 2 again: a throw (network, DNS, abort/timeout) advances the chain.
      const aborted = e && (e.name === "AbortError" || e.name === "TimeoutError");
      attempts.push({ generation, status: null, reason: aborted ? "timeout" : "network" });
      continue;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // RULE 3. Chain exhausted: soft, honest, and self-describing.
  const last = attempts[attempts.length - 1];
  // BREAKER TRIP. Only the CURRENT generation's status means anything about
  // account health: v3 is PERMANENTLY gone post-sunset (FSQ_V3_SUNSET) and its
  // 429 is that fixed "gone" response, not a quota signal — tripping on v3's
  // status would arm the breaker for every legacy-key call regardless of
  // whether the account can serve current requests at all. classifyProviderFailure
  // needs a message to recognise "quota" text generically; Foursquare's 429
  // carries none we have verified, so — exactly like the OpenWebNinja breaker
  // in app/api/events/route.js — every current-generation 429 here is treated
  // as deterministic quota exhaustion directly, per the doctrine above.
  if (last && last.generation === "current" && last.status === 429) {
    const kind = classifyProviderFailure(429, "") || "quota";
    await tripBreaker(FSQ_BREAKER, kind, "http 429 on the current Places API — not retried for " + Math.round(FSQ_BREAKER_COOLDOWN_MS / 60000) + " min", FSQ_BREAKER_COOLDOWN_MS);
  }
  return {
    ok: false,
    status: last ? last.status : null,
    generation: null,
    data: null,
    results: [],
    attempts,
    reason: "exhausted",
  };
}

/** Compact one-line outcome for logs and probes. Never contains the key. */
export function fsqOutcomeLabel(res) {
  if (!res) return "none";
  if (res.ok) return res.generation + ":ok";
  return (res.attempts || []).map((a) => a.generation + ":" + a.reason).join(",") || res.reason || "none";
}
