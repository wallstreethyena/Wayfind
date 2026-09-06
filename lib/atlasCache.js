// lib/atlasCache.js — the SHARED, HONEST core of prompt caching for Atlas
// editorial calls. Used by BOTH app/api/cron/atlas-build/route.js (the
// interactive/trickle path) and scripts/atlas-batch.mjs (the operator-run
// Batch API path), so the two paths can never drift apart on what "the
// atlas-590-v1 standard" or "the cacheable system block" actually mean.
//
// WO-D-atlas-cache-batch (owner, 2026-09-04): "Turn both on" — prompt caching
// AND the Batch API. The load-bearing requirement is that caching be REAL:
//
//   Anthropic only caches a prompt block once the CACHEABLE PREFIX clears the
//   active model's documented minimum. Below that line, attaching
//   cache_control is legal JSON and does EXACTLY NOTHING — no error, no
//   warning from the API, just a normal call at normal price. That is worse
//   than not caching, because it LOOKS enabled. This module is the one place
//   that decides eligibility, states the numbers, and refuses to lie about it.
//
// TWO DEFECTS THIS MODULE FIXES AT ONCE:
//
//   1. THE MISSING STANDARD. The route's SYSTEM prompt has always said
//      "write ... to the atlas-590-v1 standard" and never once included that
//      standard — the model was told to follow a document it never saw.
//      loadAtlasStandardText() inlines docs/WAYFIND_CARD_STANDARD.md +
//      docs/editorial-standard.md VERBATIM, at the point the system blocks
//      are assembled, so the prompt and the standard can never drift (no
//      hand-copied paraphrase to go stale).
//
//   2. THE FAKE-CACHE TRAP. Before this change the runtime SYSTEM string was
//      ~329 tokens (measured: 1,315 chars / 4). Haiku 4.5's documented
//      minimum is 4,096. Attaching cache_control to a 329-token block would
//      have looked like "caching: on" in every sense except the one that
//      matters — Anthropic would accept the field and cache nothing.
//
// TOKEN ESTIMATE. Anthropic ships no public JS tokenizer for Claude, so
// estimateTokens() is a calibrated heuristic: ceil(chars / 4). Calibration
// (2026-09-04, this repo's own text): the pre-existing runtime SYSTEM string
// is 1,315 chars -> chars/4 gives 329, which is exactly the token count
// measured against a live Anthropic count_tokens call. The two standard docs
// combined are 9,250 chars -> chars/4 gives 2,313 against a live count of
// ~2,338 (99.9% .. 98.9% of the real figure — an UNDERESTIMATE). That is the
// SAFE direction: this estimator can make a genuinely-eligible prefix read as
// ineligible (an unnecessary "no" — safe, just conservative), but it can
// never make an ineligible prefix read as eligible (a false "caching is on"
// — the one failure this whole module exists to prevent).
//
// CACHE MINIMUMS ARE TABLE-DRIVEN, NEVER HARDCODED AT THE CALL SITE. A model
// with no entry in CACHE_MIN_TOKENS fails LOUD (eligible:false, a stated
// reason, a console.error) rather than silently assuming either known
// number. Two entries are live-doc-verified (2026-09-04) and no others are
// asserted, on purpose — a table entry is a claim about live Anthropic docs,
// and an unverified guess is worse than an honest "unknown."
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { resolveOverride } from "./envAudit.js";

// Live Anthropic docs, checked 2026-09-04 (verified fact, not re-derived —
// see WO-D-atlas-cache-batch). Keyed by exact model id so a future model
// never silently inherits the wrong number.
export const CACHE_MIN_TOKENS = Object.freeze({
  "claude-haiku-4-5": 4096,
  "claude-sonnet-5": 1024,
});

/** The documented prompt-cache minimum for `model`, or null if unrecorded. */
export function cacheMinimumFor(model) {
  return Object.prototype.hasOwnProperty.call(CACHE_MIN_TOKENS, model) ? CACHE_MIN_TOKENS[model] : null;
}

/** Calibrated token estimate — see the file header for the measurement. */
export function estimateTokens(text) {
  const s = String(text || "");
  return s.length ? Math.ceil(s.length / 4) : 0;
}

// Literal paths, not built from a variable — Next's file tracer only follows
// a STATICALLY ANALYSABLE readFileSync argument into the serverless bundle
// (same requirement documented in lib/atlasPlaceAllowlist.js, which already
// ships data/atlas/*.json this same way).
const STANDARD_FILES = Object.freeze([
  path.resolve(process.cwd(), "docs/WAYFIND_CARD_STANDARD.md"),
  path.resolve(process.cwd(), "docs/editorial-standard.md"),
]);

let _standardText = null;
/**
 * The atlas-590-v1 standard, inlined VERBATIM from its two source docs, in
 * the same order every time (byte-identical across calls — the guard's
 * "cacheable prefix is byte-identical" assertion depends on this). Cached in
 * module scope after the first read; the docs do not change mid-process.
 */
export function loadAtlasStandardText() {
  if (_standardText != null) return _standardText;
  const parts = [];
  for (const f of STANDARD_FILES) {
    if (!existsSync(f)) throw new Error(`atlasCache: missing standard doc ${f} (cwd=${process.cwd()})`);
    parts.push(readFileSync(f, "utf8").trim());
  }
  _standardText = parts.join("\n\n---\n\n");
  return _standardText;
}

// Test-only escape hatch: scripts/check-atlas-cache-batch.mjs needs to prove
// the byte-identical guarantee AND red-prove it by mutation, without writing
// to the real docs on disk. Never call this from route.js or atlas-batch.mjs.
export function _resetStandardTextCacheForTests() { _standardText = null; }

// The JSON-shape / voice rules every atlas-590-v1 call sends, VERBATIM from
// the route's original SYSTEM string (moved here so scripts/atlas-batch.mjs
// and the interactive route send the model the exact same instructions —
// the "atlas-590-v1 standard" is not allowed to mean two different things
// depending on which path is running). Deliberately says "given above": the
// standard text now precedes this block for real, so the model is not told
// to follow something it cannot see.
export const ATLAS_JSON_RULES =
  "You write the Wayfind \"Atlas\" editorial for ONE place, to the atlas-590-v1 standard given above. " +
  "Voice: specific, honest, a little wry, second person, no marketing fluff — give an OPINION, not a description. " +
  "Return ONLY compact JSON, no prose, no code fence: " +
  '{"hook":"one punchy concrete sentence — the single most distinctive thing",' +
  '"why_here":"2-4 sentences on what actually makes it worth it, honest about who it is for",' +
  '"know_before":"logistics: location, hours/closures, tickets/requirements",' +
  '"best_time":"a specific, reasoned time to go",' +
  '"local_tip":"one insider move",' +
  '"facts":[{"claim":"...","source":"https://..."}]}. ' +
  "Every facts[].claim MUST cite a REAL source URL — the official website you are given, or the place's Google Maps URL. " +
  "NEVER invent a fact, a source, a price, or hours you were not given. " +
  "When official_page_text is present, prefer it: it is the venue's own words. " +
  "Every number (price, year, time, count) and every proper name you write MUST appear literally in the context you were given — " +
  "if a founding date is not there, do not state one. Omit rather than guess; an omitted detail is correct, an invented one is not. " +
  "Ignore hygiene, cookie, privacy and accessibility boilerplate — it is not editorial. " +
  'If you cannot source anything concrete about THIS specific place, return exactly {"pending":true}.';

// Ride-level filter (shared): individual rides inside a park never get their
// own editorial (they merge into the parent park). Moved here from the route
// so scripts/atlas-batch.mjs applies the identical skip list — the same
// content-quality rule, not re-derived per path. scripts/test-atlas-ride-filter.mjs
// locks the sample.
export const RIDE_RX = new RegExp([
  "coaster", "log flume", "water ?slide", "drop tower", "\\bthe ride\\b", "mine train",
  "\\bsafaris?\\b", "river adventure", "motorbike adventure",
  "soarin", "flight of passage", "expedition everest", "space mountain", "tower of terror",
  "rock ?n ?roller", "cosmic rewind", "guardians of the galaxy", "rise of the resistance",
  "ratatouille", "\\bremy'?s\\b", "slinky dog", "tron lightcycle", "seven dwarfs",
  "haunted mansion", "big thunder", "splash mountain", "thunder mountain", "test track",
  "mission: ?space", "spaceship earth", "pirates of the caribbean", "jungle cruise",
  "small world", "frozen ever after", "toy story mania", "star tours", "millennium falcon",
  "smugglers run", "kilimanjaro",
  "hagrid", "gringotts", "men in black", "revenge of the mummy", "incredible hulk",
  "spider-?man", "rip ride rockit", "velocicoaster", "mako", "kraken", "montu",
  "cheetah hunt", "cobra'?s curse", "sheikra", "manta", "ice breaker", "pipeline",
].join("|"), "i");

/**
 * The honesty gate. NEVER returns eligible:true silently — always states the
 * numbers (tokens, min, model) so a caller can put them in a pulse note or a
 * log line, and treats an unrecognised model as INELIGIBLE (fail loud, not
 * fail open) rather than guessing a minimum for it.
 */
export function assessCacheEligibility(prefixText, model) {
  const tokens = estimateTokens(prefixText);
  const min = cacheMinimumFor(model);
  if (min == null) {
    const reason = `no documented prompt-cache minimum for model "${model}" — refusing to claim caching is on rather than guessing`;
    console.error(`[atlas-cache] ${reason} (prefix=${tokens} tokens)`);
    return { eligible: false, tokens, min: null, model, reason };
  }
  if (tokens < min) {
    const reason = `cacheable prefix is ${tokens} tokens, below ${model}'s documented ${min}-token minimum — cache_control would be a no-op`;
    console.warn(`[atlas-cache] CACHING DISABLED for ${model}: ${reason}`);
    return { eligible: false, tokens, min, model, reason };
  }
  return { eligible: true, tokens, min, model, reason: null };
}

/**
 * Build the ordered Anthropic `system` content-blocks array for one
 * atlas-590-v1 call: [inlined standard, JSON-shape/voice rules]. Per-place
 * `ctx` is NEVER part of this — it goes in the user message, unique per
 * call, so caching it would be pointless (it can never repeat). Because
 * neither block depends on any place-specific input, the returned `blocks`
 * (ignoring the ephemeral eligibility log) is BYTE-IDENTICAL for every place
 * given the same model — that identity is exactly what makes a cache HIT
 * possible, and it is what scripts/check-atlas-cache-batch.mjs asserts by
 * calling this twice with two different places' worth of surrounding
 * context and diffing the `system` field alone.
 *
 * cache_control is attached to the LAST block ONLY when the prefix actually
 * clears the active model's minimum — an ineligible model gets the exact
 * same two blocks, still improved by the now-inlined standard, just without
 * a cache_control field that would otherwise be decorative.
 */
export function buildAtlasSystemBlocks(model) {
  const standard = loadAtlasStandardText();
  const prefixText = standard + "\n\n" + ATLAS_JSON_RULES;
  const info = assessCacheEligibility(prefixText, model);
  const blocks = [
    { type: "text", text: standard },
    info.eligible
      ? { type: "text", text: ATLAS_JSON_RULES, cache_control: { type: "ephemeral", ttl: "1h" } }
      : { type: "text", text: ATLAS_JSON_RULES },
  ];
  return { blocks, ...info };
}

// ATLAS_BATCH_MODEL — the model scripts/atlas-batch.mjs sends to the Batch
// API. Read the SAME way ATLAS_MODEL already is (lib/envAudit VALUE_OVERRIDES
// + resolveOverride), so a mistyped/retired model id is LOUD rather than a
// silent 100%-failure batch (the exact #440 shape WO-D explicitly must not
// repeat). Deliberately defaults to claude-sonnet-5, not claude-haiku-4-5:
// Sonnet clears the 1,024-token cache minimum against the now-inlined
// standard; Haiku (4,096) does not, so leaving the trickle path's default
// alone (per WO-D item 2) keeps it correctly, loudly, cache-ineligible.
export function resolveAtlasBatchModel() {
  const o = resolveOverride("ATLAS_BATCH_MODEL");
  if (o.status === "unknown" || o.status === "malformed") {
    console.error(
      `[atlas-batch] ATLAS_BATCH_MODEL="${o.value}" is ${o.status === "malformed" ? "not a valid model id" : "not a recognised model"} — ${o.spec.consequence}. Unset it to use ${o.spec.fallback}.`,
    );
  }
  return o.value;
}
