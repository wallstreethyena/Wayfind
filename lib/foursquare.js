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
//   3. Exhausting the chain FAILS SOFT (never throws) and is OBSERVABLE: the
//      result carries every attempt with its generation and outcome, so a dead
//      source names itself instead of looking like "no results near you".
//   4. Foursquare failing must NEVER cause a compensating Google call. Callers
//      run the two providers in parallel (lib/sources.js `Promise.all`), and
//      this module returns an empty-but-honest result rather than signalling
//      anyone to go spend elsewhere. Locked by scripts/test-foursquare.mjs.

export const FSQ_V3_URL = "https://api.foursquare.com/v3/places/search";
export const FSQ_CURRENT_URL = "https://places-api.foursquare.com/places/search";
export const FSQ_PLACES_API_VERSION = "2025-06-17";
export const FSQ_V3_SUNSET = "2026-05-15";
export const FSQ_TIMEOUT_MS = 5000;

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
      attempts.push({ generation, status: r.status, reason: "ok" });
      const results = (data && Array.isArray(data.results) ? data.results : []);
      return { ok: true, status: r.status, generation, data, results, attempts, reason: "ok" };
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
