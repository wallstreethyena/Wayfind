// docs/atlas-pilot-2026-10/cost-model.mjs — reproducible cost model for the Atlas web lane.
// Run: node docs/atlas-pilot-2026-10/cost-model.mjs
// Prices come from lib/atlasBudget.js (PRICE_VERSION anthropic-std-2026-10-08, standard
// list prices read from platform.claude.com on 2026-10-08; no account discounts/credits applied).
// EVERY token figure below is an ASSUMPTION until the pilot measures real usage objects.
import { costOfUsage, requestBound, PRICE_VERSION } from "../../lib/atlasBudget.js";

const P0 = 4300; // system ~2,646 (atlasCache estimate, old tokenizer) x1.3 for the 5.5 tokenizer + 286 tool overhead + tool defs/user msg
// One lane attempt = ONE Messages request containing a server-side loop. Anthropic does not
// document whether usage.input_tokens re-counts earlier loop context for each iteration, so we
// model both readings: "single" (final context only) and "cumulative" (every iteration re-billed).
function scenario({ searches, fetches, searchTok, fetchTok, stepOut, finalOut, thinking }) {
  const items = [...Array(searches).fill(searchTok), ...Array(fetches).fill(fetchTok)].sort((a, b) => b - a);
  const steps = items.length + 1;
  let ctx = P0, cumulative = P0;
  for (const t of items) { ctx += t + stepOut; cumulative += ctx; }
  const output = (steps - 1) * stepOut + finalOut + thinking;
  return { searches, single: ctx, cumulative, output };
}
const S = {
  typical: scenario({ searches: 2, fetches: 2, searchTok: 5000, fetchTok: 5000, stepOut: 300, finalOut: 1000, thinking: 1500 }),
  high: scenario({ searches: 3, fetches: 3, searchTok: 15000, fetchTok: 8500, stepOut: 2000, finalOut: 2000, thinking: 0 }),
};
const usage = (input, output, searches) => ({ input_tokens: input, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, server_tool_use: { web_search_requests: searches } });
const usd = (micro) => micro / 1e6;
const models = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"];
const out = { priceVersion: PRICE_VERSION, P0, scenarios: S, perAttempt: {}, bound: {} };
for (const m of models) {
  out.perAttempt[m] = {};
  for (const [name, s] of Object.entries(S)) for (const mode of ["single", "cumulative"]) {
    const c = costOfUsage(m, usage(s[mode], s.output, s.searches), PRICE_VERSION);
    out.perAttempt[m][`${name}/${mode}`] = { usd: usd(c.microUsd), tier: c.tier || null, input: s[mode], output: s.output, searches: s.searches };
  }
  out.bound[m] = usd(requestBound(m, { maxInputTokens: 350000, maxOutputTokens: 14000, maxSearches: 3, cacheWriteTokens: 350000 }, PRICE_VERSION));
}
// Denominators. a = first-attempt acceptance; r = retry acceptance given a first failure.
function policy(costAttempt, a, r, retry) {
  const attempts = retry ? 1 + (1 - a) : 1;
  const accept = retry ? a + (1 - a) * r : a;
  const perCandidate = costAttempt * attempts;
  return { attemptsPerCandidate: attempts, acceptancePerCandidate: accept, perAttempt: costAttempt, perCandidate, perAccepted: accept > 0 ? perCandidate / accept : null,
    for300Candidates: { cost: 300 * perCandidate, accepted: 300 * accept }, for300Accepted: accept > 0 ? { candidates: 300 / accept, cost: (300 / accept) * perCandidate } : null };
}
out.sensitivity = {};
for (const m of ["claude-haiku-5-5", "claude-sonnet-5-5"]) for (const key of ["typical/single", "typical/cumulative", "high/cumulative"]) {
  const c = out.perAttempt[m][key].usd;
  for (const a of [0, 0.1, 0.165, 0.3, 0.5, 0.7]) out.sensitivity[`${m} ${key} a=${a} noRetry`] = policy(c, a, 0, false);
  out.sensitivity[`${m} ${key} oldPipelineRates retry`] = policy(c, 0.165, 0.146, true);
  out.sensitivity[`${m} ${key} assumed60/60 retry`] = policy(c, 0.6, 0.6, true);
}
console.log(JSON.stringify(out, null, 1));
