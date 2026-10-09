// lib/atlasBudget.js — an ENFORCEABLE dollar budget for the Atlas editorial writer.
//
// Pure ESM. No I/O except through an injected ledger (see lib/atlasBudgetFileLedger.js
// for the single-machine file ledger and supabase/proposals/2026-10-atlas-ai-budget.sql
// for the production-shaped Postgres twin). NOT wired into the atlas-build cron.
//
// ── MONEY UNITS ────────────────────────────────────────────────────────────
// The schedule is stored in NANO-USD per token (1 micro-USD = 1000 nano-USD).
// $2 per MTok = 2 micro-USD/token = 2000 nano/token, so $0.01/MTok (the cheapest
// rate here) = 10 nano/token is still an exact integer. A request's cost is the
// exact integer sum of (tokens x nano/token) + (searches x 10,000,000 nano),
// then rounded UP once to whole micro-USD (never down, never per line item, no
// floats anywhere). Ceil means we can over-book by < 1 micro-USD, never under.
//
// ── NO SDK, NO HIDDEN RETRIES ──────────────────────────────────────────────
// Checked 2026-10-08: `grep -n "@anthropic-ai" package.json` returns nothing.
// The writer calls the Messages API with raw fetch, which performs ZERO automatic
// retries (an SDK would retry 2x by default and each retry can bill). Therefore
// one provider call == one billable attempt, and this module adds none either:
// runAttempt never retries. ONE APPLICATION RETRY == ONE NEW ATTEMPT with a NEW
// attemptKey and a NEW reservation (the old attempt keeps its own liability).
//
// ── ASSUMPTIONS (documented, deliberately conservative) ────────────────────
// A1. claude-haiku-5-5 is priced in two tiers by request prompt length where
//     prompt = input_tokens + cache_read_input_tokens + cache_creation_input_tokens.
//     A server-tool loop (web_search) reports all iterations in ONE usage object and
//     the docs do not say how the 100,000-token threshold applies to iterations.
//     RULE: if that summed prompt > 100,000 we apply tier B to the WHOLE response.
//     This can over-state cost, never under-state it.
// A2. Thinking tokens are included in output_tokens, so no separate line.
// A3. web_fetch has no per-use charge (its content is billed as input tokens).
// A4. If cache_creation tokens are not split into 5m/1h we price them at the 1h
//     rate (worst case). Any unsplit remainder is also priced at 1h.
// A5. requestBound(): limits.maxInputTokens is the TOTAL prompt across all server
//     tool iterations (input + cache read + cache write). If the provider reports
//     more than that, the settled cost can exceed the bound -> overrun -> halt.

export const PRICE_VERSION = "anthropic-std-2026-10-08";
export const HAIKU_55_TIER_THRESHOLD = 100000;
export const WEB_SEARCH_NANO_USD = 10000000; // $10 / 1000 uses = 10,000 micro-USD each

const r = (inp, out, cw5m, cw1h, cr) => Object.freeze({ input: inp, output: out, cw5m, cw1h, cacheRead: cr });

// nano-USD per token. ($ per MTok) x 1000.
export const PRICE_SCHEDULE = Object.freeze({
  [PRICE_VERSION]: Object.freeze({
    models: Object.freeze({
      "claude-sonnet-5-5": Object.freeze({ tiers: Object.freeze({ A: r(2000, 10000, 2500, 4000, 100) }) }),
      "claude-haiku-5-5": Object.freeze({
        tierThreshold: HAIKU_55_TIER_THRESHOLD,
        tiers: Object.freeze({
          A: r(100, 500, 125, 200, 10),
          B: r(500, 2500, 625, 1000, 50),
        }),
      }),
      "claude-haiku-4-5": Object.freeze({ tiers: Object.freeze({ A: r(1000, 5000, 1250, 2000, 100) }) }),
    }),
    webSearchNanoUsdPerUse: WEB_SEARCH_NANO_USD,
    webFetchNanoUsdPerUse: 0,
  }),
});
export const KNOWN_PRICE_VERSIONS = Object.freeze(Object.keys(PRICE_SCHEDULE));

// ── typed errors ────────────────────────────────────────────────────────────
export class UsageMissingError extends Error {
  constructor(msg) { super(msg); this.name = "UsageMissingError"; }
}
export class UnknownModelError extends Error {
  constructor(model) { super(`atlasBudget: unknown model ${JSON.stringify(model)} (no default price, refusing)`); this.name = "UnknownModelError"; }
}
export class UnknownPriceVersionError extends Error {
  constructor(v) { super(`atlasBudget: unknown price version ${JSON.stringify(v)}`); this.name = "UnknownPriceVersionError"; }
}
export class LedgerStateError extends Error {
  constructor(msg) { super(msg); this.name = "LedgerStateError"; }
}

function schedule(priceVersion) {
  const s = PRICE_SCHEDULE[priceVersion];
  if (!s) throw new UnknownPriceVersionError(priceVersion);
  return s;
}
function modelEntry(model, priceVersion) {
  const m = schedule(priceVersion).models[model];
  if (!m) throw new UnknownModelError(model);
  return m;
}
const isNonNegInt = (n) => Number.isInteger(n) && n >= 0;
const ceilDiv = (a, b) => Math.floor((a + b - 1) / b);
export const nanoToMicroCeil = (nano) => ceilDiv(nano, 1000);

function tierFor(entry, promptTokens) {
  return entry.tierThreshold && promptTokens > entry.tierThreshold ? "B" : "A";
}

// costOfUsage(model, usage, priceVersion, { toolsUsed = true, contentBlocks }) -> { microUsd, tier, breakdown }
// Never returns 0 for missing data: a missing/ill-typed usage THROWS UsageMissingError.
export function costOfUsage(model, usage, priceVersion = PRICE_VERSION, opts = {}) {
  const entry = modelEntry(model, priceVersion);
  if (!usage || typeof usage !== "object") throw new UsageMissingError("atlasBudget: usage object missing");
  if (!isNonNegInt(usage.input_tokens)) throw new UsageMissingError("atlasBudget: usage.input_tokens missing or not an integer");
  if (!isNonNegInt(usage.output_tokens)) throw new UsageMissingError("atlasBudget: usage.output_tokens missing or not an integer");
  const num = (v, name) => {
    if (v === undefined || v === null) return 0; // missing cache fields default 0
    if (!isNonNegInt(v)) throw new UsageMissingError(`atlasBudget: usage.${name} is not a non-negative integer`);
    return v;
  };
  const input = usage.input_tokens;
  const output = usage.output_tokens;
  const cacheRead = num(usage.cache_read_input_tokens, "cache_read_input_tokens");
  const cc = usage.cache_creation && typeof usage.cache_creation === "object" ? usage.cache_creation : null;
  const w5 = cc ? num(cc.ephemeral_5m_input_tokens, "cache_creation.ephemeral_5m_input_tokens") : 0;
  const w1 = cc ? num(cc.ephemeral_1h_input_tokens, "cache_creation.ephemeral_1h_input_tokens") : 0;
  const ccTotalField = num(usage.cache_creation_input_tokens, "cache_creation_input_tokens");
  const cacheWriteTotal = Math.max(ccTotalField, w5 + w1);
  const unsplit = cacheWriteTotal - w5 - w1; // A4: priced at 1h
  const prompt = input + cacheRead + cacheWriteTotal;
  const tier = tierFor(entry, prompt); // A1
  const p = entry.tiers[tier];

  let searches = 0, searchSource = "none";
  const stu = usage.server_tool_use;
  if (stu && typeof stu === "object" && stu.web_search_requests !== undefined && stu.web_search_requests !== null) {
    if (!isNonNegInt(stu.web_search_requests)) throw new UsageMissingError("atlasBudget: server_tool_use.web_search_requests is not a non-negative integer");
    searches = stu.web_search_requests;
    searchSource = "usage";
  } else if (opts.toolsUsed !== false && Array.isArray(opts.contentBlocks)) {
    // Second evidence source: the response content. Zero search blocks => provably zero searches.
    // Any search block while usage omits the count is ambiguous: never guess.
    const sawSearch = opts.contentBlocks.some((b) => b && ((b.type === "server_tool_use" && b.name === "web_search") || b.type === "web_search_tool_result"));
    if (sawSearch) throw new UsageMissingError("atlasBudget: content shows web_search blocks but usage omits web_search_requests (ambiguous)");
    searches = 0; searchSource = "content_blocks";
  } else if (opts.toolsUsed !== false) {
    // Unknown, NOT zero: the caller asserts no web_search tool via {toolsUsed:false}.
    throw new UsageMissingError("atlasBudget: server_tool_use.web_search_requests missing (pass {toolsUsed:false} if the request had no web_search tool)");
  }

  const breakdown = {
    inputNano: input * p.input,
    outputNano: output * p.output,
    cacheReadNano: cacheRead * p.cacheRead,
    cacheWrite5mNano: w5 * p.cw5m,
    cacheWrite1hNano: (w1 + unsplit) * p.cw1h,
    webSearchNano: searches * schedule(priceVersion).webSearchNanoUsdPerUse,
    promptTokens: prompt,
    webSearches: searches,
    searchCountSource: searchSource,
  };
  const totalNano = breakdown.inputNano + breakdown.outputNano + breakdown.cacheReadNano +
    breakdown.cacheWrite5mNano + breakdown.cacheWrite1hNano + breakdown.webSearchNano;
  breakdown.totalNano = totalNano;
  return { microUsd: nanoToMicroCeil(totalNano), tier, breakdown };
}

// requestBound(model, limits, priceVersion) -> micro-USD (integer), conservative max liability.
// limits = { maxInputTokens (TOTAL prompt, A5), maxOutputTokens, maxSearches, cacheWriteTokens }
export function requestBound(model, limits, priceVersion = PRICE_VERSION) {
  const entry = modelEntry(model, priceVersion);
  const l = limits || {};
  for (const k of ["maxInputTokens", "maxOutputTokens", "maxSearches", "cacheWriteTokens"]) {
    const v = l[k] === undefined ? 0 : l[k];
    if (!isNonNegInt(v)) throw new RangeError(`atlasBudget.requestBound: limits.${k} must be a non-negative integer`);
  }
  const maxIn = l.maxInputTokens || 0, maxOut = l.maxOutputTokens || 0;
  const searches = l.maxSearches || 0, cw = l.cacheWriteTokens || 0;
  if (cw > maxIn) throw new RangeError("atlasBudget.requestBound: cacheWriteTokens cannot exceed maxInputTokens (it is a subset of the prompt)");
  const p = entry.tiers[tierFor(entry, maxIn)]; // higher tier whenever maxIn > threshold
  // Worst case per input token is the 1h cache-write rate on the cacheWrite part,
  // plain input rate on the rest (cache reads are cheaper than input, so ignored).
  const worstPlain = Math.max(p.input, p.cacheRead);
  const nano = (maxIn - cw) * worstPlain + cw * Math.max(p.cw1h, p.cw5m) + maxOut * p.output +
    searches * schedule(priceVersion).webSearchNanoUsdPerUse;
  return nanoToMicroCeil(nano);
}

// ── Budget lifecycle ────────────────────────────────────────────────────────
// States: reserved -> dispatched -> settled | unresolved ; reserved -> released.
// release() is legal ONLY from "reserved" (the provider was never called).
// Ledger interface (all async, each call atomic): reserveAttempt, dispatchAttempt, settleAttempt,
// unresolveAttempt, releaseAttempt, getAttempt. (Budget's methods are class fields only because
// check-lib-call-imports reads method definitions named like quotaLedger exports as bare calls.) The admission invariant is enforced INSIDE ledger.reserve:
//   settled(this period) + sum(bound of reserved|dispatched|unresolved, ANY period)
//     + newBound <= ceiling(scope, period)
// plus: no duplicate attemptKey, no 2nd active (reserved|dispatched) attempt per
// placeId, scope not halted, price version known, bound a non-negative integer.
export class Budget {
  constructor({ ledger, scope, period, priceVersion = PRICE_VERSION }) {
    if (!ledger) throw new Error("atlasBudget: ledger required");
    if (!scope || !period) throw new Error("atlasBudget: scope and period required");
    this.ledger = ledger; this.scope = scope; this.period = period; this.priceVersion = priceVersion;
  }

  // -> { ok:true } | { ok:false, reason }. Ledger errors FAIL CLOSED (reason "ledger_error").
  reserve = async (attemptKey, placeId, model, boundMicroUsd) => {
    if (!PRICE_SCHEDULE[this.priceVersion]) return { ok: false, reason: "unknown_price_version" };
    modelEntry(model, this.priceVersion); // unknown model -> throw, never default
    try {
      return await this.ledger.reserveAttempt({
        attemptKey, scope: this.scope, period: this.period, placeId, model,
        priceVersion: this.priceVersion, boundMicroUsd,
      });
    } catch (error) {
      return { ok: false, reason: "ledger_error", error };
    }
  }
  dispatch = async (attemptKey) => { await this.ledger.dispatchAttempt(attemptKey); }

  // Prices the usage with the row's own model + price version. Missing/invalid usage
  // marks the attempt UNRESOLVED (liability = bound stays) and rethrows. Never zero.
  settle = async (attemptKey, usage, { toolsUsed = true, requestId = null, contentBlocks } = {}) => {
    const row = await this.ledger.getAttempt(attemptKey);
    if (!row) throw new LedgerStateError(`atlasBudget: unknown attempt ${attemptKey}`);
    let cost;
    try {
      cost = costOfUsage(row.model, usage, row.priceVersion, { toolsUsed, contentBlocks });
    } catch (e) {
      await this.ledger.unresolveAttempt(attemptKey, `${e.name}: ${e.message}`);
      throw e;
    }
    const res = await this.ledger.settleAttempt(attemptKey, { settledMicroUsd: cost.microUsd, usage, requestId });
    return { microUsd: cost.microUsd, tier: cost.tier, overrun: !!res.overrun };
  }
  markUnresolved = async (attemptKey, reason) => { await this.ledger.unresolveAttempt(attemptKey, String(reason)); }
  release = async (attemptKey) => { await this.ledger.releaseAttempt(attemptKey); }
}

// runAttempt: reserve -> dispatch -> await call() -> settle. No internal retries.
// call({signal}) must return { usage, result?, requestId? }. Returns:
//   { status:"rejected",  reason }                       call() NOT invoked
//   { status:"settled",   microUsd, tier, overrun, result }
//   { status:"unresolved", reason, error }               liability = reserved bound, never released
export async function runAttempt({ budget, attemptKey, placeId, model, limits, call, timeoutMs = 0 }) {
  const bound = requestBound(model, limits, budget.priceVersion);
  const rsv = await budget.reserve(attemptKey, placeId, model, bound);
  if (!rsv.ok) return { status: "rejected", reason: rsv.reason, error: rsv.error };
  try {
    await budget.dispatch(attemptKey); // marked BEFORE the provider call
  } catch (error) {
    try { await budget.release(attemptKey); } catch { /* stays reserved: still counted */ }
    return { status: "rejected", reason: "dispatch_failed", error };
  }
  let out;
  const ac = new AbortController();
  let timer;
  try {
    const p = Promise.resolve().then(() => call({ signal: ac.signal }));
    out = timeoutMs > 0
      ? await Promise.race([p, new Promise((_, rej) => { timer = setTimeout(() => { ac.abort(); rej(new Error(`timeout after ${timeoutMs}ms`)); }, timeoutMs); })])
      : await p;
  } catch (error) {
    const reason = `provider_call_failed_after_dispatch: ${error && error.message}`;
    try { await budget.markUnresolved(attemptKey, reason); } catch { /* stays dispatched: still counted */ }
    return { status: "unresolved", reason, error };
  } finally { if (timer) clearTimeout(timer); }
  try {
    const s = await budget.settle(attemptKey, out && out.usage, { toolsUsed: (limits && limits.maxSearches > 0) || false, requestId: out && out.requestId, contentBlocks: out && out.contentBlocks });
    return { status: "settled", ...s, result: out && out.result };
  } catch (error) {
    // Budget.settle already marked unresolved on bad usage; a ledger failure leaves it dispatched. Both count.
    return { status: "unresolved", reason: `settle_failed: ${error && error.message}`, error };
  }
}
