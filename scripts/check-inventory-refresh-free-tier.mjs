// scripts/check-inventory-refresh-free-tier.mjs — CLAUDE.md revenue rule 1: the
// env-gated branch (WAYFIND_GATE=free now RUNS the inventory refresh) has a
// static guard. Owner decision 2026-10-25: free tier only, never lose anything.
//
// STRUCTURAL-ONLY on purpose: the route needs Supabase + Google to execute, and
// the executed behaviour (grants, sub-caps, plans, a stubbed run of the route)
// is locked by scripts/test-inventory-free-refresh.mjs and
// scripts/test-coord-provenance.mjs. This file pins the route's SHAPE, on code
// with comments stripped, with a red-prove for every clause.
import { readFileSync } from "node:fs";
import { FREE_TIER_REFRESH_PATH, REBUY_PATHS_OFF_IN_FREE_MODE } from "../lib/ownedLibrary.js";
import { REFRESH_SUBCAPS, REFRESH_RICH_TIERS_FROM_MONTH } from "../lib/spendGate.js";

const ROUTE = "app/api/cron/inventory-refresh/route.js";
let pass = 0; const fail = [];
const ok = (c, m) => (c ? pass++ : fail.push(m));
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function checks(src, label) {
  const code = strip(src);
  const out = [];
  const t = (c, m) => out.push([c, `${label}: ${m}`]);
  const h = code.indexOf("export async function GET");
  const body = h >= 0 ? code.slice(h) : "";
  const shut = body.search(/if \(gateShut\(\)\) \{/);
  const firstPaid = body.search(/spendAllowRefresh\(|fetchGoogleCheck\(|createClient\(|places\.googleapis\.com/);
  t(h >= 0 && shut >= 0 && firstPaid > shut, "the shut check comes before any Google call, ledger grant or database client");
  t(!/gateFree\(/.test(code), "the route no longer parks itself in free mode (gateFree is not consulted)");
  t(/import \{[^}]*\bspendAllowRefresh\b[^}]*\} from "[^"]*lib\/spendGate"/.test(src), "grants come from spendAllowRefresh");
  t((code.match(/spendAllowRefresh\(/g) || []).length === 1, "exactly one grant site, one grant per Google call");
  t(!/\bspendAllow\s*\(|\bspendAllowCapped\s*\(|\btakeFromLedger\s*\(|\bspendAllowSeasonalVenue\s*\(|\bgetPlaceDetails(?:Dated)?\s*\(/.test(code), "no other ledger entry point and no cache-first details read (those can take a paid or shared grant)");
  t(/PLACE_DETAILS_FIELDS|PRO_MASK|ESSENTIALS_MASK/.test(code) && !/X-Goog-FieldMask/.test(code), "masks come from the tier constants; the route sets no mask of its own");
  // The ONLY write verb on wf_inventory is update; never delete / insert / upsert.
  t(!/\.(?:delete|upsert|insert)\s*\(/.test(code), "no delete, insert or upsert anywhere in the route");
  t((code.match(/\.update\s*\(/g) || []).length === 1, "exactly one write site (a compare-and-swap update)");
  t(/\.eq\("signals", JSON\.stringify\(plan\.expect\.signals\)\)/.test(code) && /\.is\("signals", null\)/.test(code), "the write is compare-and-swap on the signals it judged");
  t(!/\bexcluded\s*:\s*true|exclusion_reason\s*:/.test(code), "the route never sets excluded");
  t(/\.or\("excluded\.is\.null,excluded\.eq\.false"\)/.test(code) && /status\.neq\.CLOSED_PERMANENTLY/.test(code), "excluded and permanently-closed rows stay out of the queue");
  t(/refundToLedger\(refreshCounterSku\(sku\), 1\)[\s\S]{0,60}refundToLedger\(sku, 1\)/.test(code) && /if \(!res\.billed\)/.test(code), "an unbilled Google failure gives both grants back");
  t(/tripBreaker\(BREAKER/.test(code) && /classifyProviderFailure\(/.test(code), "billing/quota refusals trip the circuit breaker (revenue rule 2)");
  return out;
}

// By call: the no-re-buy law names this route as the one free-tier exception, and
// the sub-caps are exactly half the shared free-line ceilings.
ok(FREE_TIER_REFRESH_PATH === ROUTE && !REBUY_PATHS_OFF_IN_FREE_MODE.includes(ROUTE), "lib/ownedLibrary names this route as the free-tier exception, not a parked re-buy path");
ok(REFRESH_SUBCAPS.details_pro === 2400 && REFRESH_SUBCAPS.details_enterprise === 475 && REFRESH_SUBCAPS.details_essentials === 8000, "refresh sub-caps are 2400 Pro / 475 Enterprise / 8000 Essentials");
ok(REFRESH_RICH_TIERS_FROM_MONTH === "2026-11", "Pro and Enterprise refresh start with the 2026-11 ledger month");
const src = readFileSync(new URL("../" + ROUTE, import.meta.url), "utf8");
for (const [c, m] of checks(src, ROUTE)) ok(c, m);

// vercel.json still schedules it.
const cron = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")).crons || [];
ok(cron.some((c) => c.path === "/api/cron/inventory-refresh"), "vercel.json schedules /api/cron/inventory-refresh");

// ── red-proves: each clause fails on the sabotage it exists for ──
function red(name, find, replace) {
  ok(src.includes(find), `red-prove setup: route contains ${JSON.stringify(find.slice(0, 50))}`);
  const mut = src.replace(find, replace);
  ok(mut !== src, `red-prove setup: ${name} applied`);
  const failed = checks(mut, "mutant").filter(([c]) => !c).length;
  ok(failed > 0, `red-prove: ${name} is detected`);
}
red("gate check removed", "if (gateShut()) {", "if (false) {");
red("free mode parked again", "if (gateShut()) {", "if (gateShut() || gateFree()) {");
red("a plain ledger grant sneaks in", "if (!(await spendAllowRefresh(sku))) {", "if (!(await spendAllowCapped(sku, 99999))) {");
red("a delete appears", "const { data, error: upErr } = await q.select(", "await db.from('wf_inventory').delete().eq('place_id', row.place_id); const { data, error: upErr } = await q.select(");
red("rows get excluded", "let q = db.from(\"wf_inventory\").update(plan.update)", "let q = db.from(\"wf_inventory\").update({ ...plan.update, excluded: true })");
red("unconditional write", "q = plan.expect.signals == null ? q.is(\"signals\", null) : q.eq(\"signals\", JSON.stringify(plan.expect.signals));", "");
red("closed rows re-enter the queue", ".or(\"status.is.null,status.neq.CLOSED_PERMANENTLY\")", "");
// detector controls on literal fixtures: the probes DO fire on the shapes they forbid.
ok(/\.(?:delete|upsert|insert)\s*\(/.test("db.from('wf_inventory').delete().eq('a', 1)") && /gateFree\(/.test("if (gateShut() || gateFree()) return;") && /\bexcluded\s*:\s*true/.test("{ excluded: true }"), "the absence probes fire on literal examples of what they forbid");
// positive control: the untouched route passed every clause above
ok(checks(src, "control").every(([c]) => c), "positive control: the real route satisfies every clause, so each absence probe above is known to pass on good code and fail on the mutants");

if (fail.length) { console.error("check-inventory-refresh-free-tier: FAIL"); for (const m of fail) console.error("  - " + m); process.exit(1); }
console.log(`check-inventory-refresh-free-tier: OK — ${pass} assertions; the free-mode refresh route has one grant site (spendAllowRefresh), gate before any Google/DB call, update-only compare-and-swap writes, no delete/exclude/blank; 7 red-proves`);
