// scripts/check-experiences-link-health.mjs — the wf_experiences link-health
// pipeline, asserted on the CALL (2026-08-26 affiliate deep-link audit).
//
// THE INCIDENT THIS GUARDS AGAINST. wf_experiences rows outlive the products
// they point at: the nightly ingest only refreshes what Viator's top-50 search
// still returns, so a retired product's row keeps serving and its stored URL
// 302s users to Viator's "similar experiences" SEARCH page — a specific-
// activity card that lands on a list of other activities (owner report,
// 2026-08-26). The link_ok/last_checked_at/fail_count columns existed but were
// stamped exactly once (2026-08-22) and nothing read or refreshed them. This
// guard pins all three layers of the fix: the sweep's decision logic, the
// serving filters, and the redirect refusal.
process.env.WF_SUPPRESS_ANALYTICS = "1";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  classifyProductProbe,
  nextHealthState,
  dropDeadLinkRows,
  DEAD_AFTER_FAILS,
} from "../lib/experienceLinkHealth.js";
import { PROVIDERS, resolveOffer } from "../lib/commerceProviders.js";

const REPO = fileURLToPath(new URL("..", import.meta.url));
let pass = 0; const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

/* ── 1. probe classification, CALLED ─────────────────────────────────────── */
ok(classifyProductProbe(200, { status: "ACTIVE" }) === "alive", "200+ACTIVE is alive");
ok(classifyProductProbe(200, { status: "INACTIVE" }) === "dead_confirmed", "200+INACTIVE is confirmed dead — Viator said so itself");
ok(classifyProductProbe(404, null) === "dead_probe", "404 is a probe failure, not yet a verdict");
ok(classifyProductProbe(410, null) === "dead_probe", "410 is a probe failure");
ok(classifyProductProbe(429, null) === "unknown", "a rate limit must never kill a product");
ok(classifyProductProbe(500, null) === "unknown", "an upstream 5xx must never kill a product");
ok(classifyProductProbe(401, null) === "unknown", "OUR bad key must never kill a product");
ok(classifyProductProbe(200, {}) === "unknown", "200 with no status field is schema drift, not death");

/* ── 2. state folding, CALLED ────────────────────────────────────────────── */
ok(DEAD_AFTER_FAILS >= 2, "a single probe failure must not be able to un-list a product");
const alive = nextHealthState({ link_ok: false, fail_count: 5 }, "alive");
ok(alive && alive.link_ok === true && alive.fail_count === 0, "a live probe fully resurrects a row (link_ok true, fails reset)");
const confirmed = nextHealthState({ link_ok: true, fail_count: 0 }, "dead_confirmed");
ok(confirmed && confirmed.link_ok === false, "INACTIVE kills immediately — no waiting period on Viator's own word");
const one404 = nextHealthState({ link_ok: true, fail_count: 0 }, "dead_probe");
ok(one404 && one404.link_ok === true && one404.fail_count === 1, "first 404 only counts the failure; the row still serves");
const two404 = nextHealthState({ link_ok: true, fail_count: 1 }, "dead_probe");
ok(two404 && two404.link_ok === false && two404.fail_count === 2, `${DEAD_AFTER_FAILS} consecutive 404s kill the row`);
ok(nextHealthState({ link_ok: true, fail_count: 0 }, "unknown") === null, "unknown writes nothing but last_checked_at");
const stayDead = nextHealthState({ link_ok: false, fail_count: 2 }, "dead_probe");
ok(stayDead && stayDead.link_ok === false, "a dead row stays dead on further probe failures");

/* ── 3. the serving filter, CALLED ───────────────────────────────────────── */
const rows = [{ id: 1, link_ok: true }, { id: 2, link_ok: false }, { id: 3 }, { id: 4, link_ok: null }, null];
const kept = dropDeadLinkRows(rows).map((r) => r.id);
ok(kept.join(",") === "1,3,4", "only proven-dead rows drop; unchecked (null/absent) rows still serve");

/* ── 4. every wf_experiences reader applies it ───────────────────────────── */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const serve = strip(readFileSync(REPO + "lib/experiencesServe.js", "utf8"));
ok(/rows\s*=\s*dropDeadLinkRows\(rows\)/.test(serve), "serveExperiences must drop dead rows before counting/serving");
ok(serve.indexOf("dropDeadLinkRows(rows)") < serve.indexOf("const chipCounts"), "the drop must happen BEFORE chip counts — a count and its list come from one array");
const curated = strip(readFileSync(REPO + "app/api/viator/curated/route.js", "utf8"));
ok(/dropDeadLinkRows\(/.test(curated), "/api/viator/curated must drop dead rows");
ok(/select=[^`"']*link_ok/.test(curated), "/api/viator/curated must select link_ok (a filter over an unselected column is decoration)");
const foodTours = strip(readFileSync(REPO + "lib/foodTours.js", "utf8"));
ok(/link_ok\s*!==\s*false/.test(foodTours), "foodTours keeps its own link_ok filter");

/* ── 5. the redirect refusal, CALLED (assert on the call, not the string) ── */
ok(PROVIDERS.viator.deadColumn === "link_ok", "the viator provider must declare its dead column");
const fakeEnv = () => ({ url: "https://sb.test", key: "k" });
const rowFetch = (row) => async (url) => new Response(JSON.stringify([row]), { status: 200, headers: { "Content-Type": "application/json" } });
{
  const dead = await resolveOffer("viator", "173028P1", { env: fakeEnv, fetch: rowFetch({ product_code: "173028P1", product_url: "https://www.viator.com/tours/x/d1-173028P1", link_ok: false }) });
  ok(dead.error === "offer-link-dead" && !dead.dest, "a link_ok=false row must REFUSE, never redirect");
  const live = await resolveOffer("viator", "173028P1", { env: fakeEnv, fetch: rowFetch({ product_code: "173028P1", product_url: "https://www.viator.com/tours/x/d1-173028P1", link_ok: true }) });
  ok(!!live.dest && /viator\.com/.test(live.dest), "a link_ok=true row still resolves");
  const unchecked = await resolveOffer("viator", "173028P1", { env: fakeEnv, fetch: rowFetch({ product_code: "173028P1", product_url: "https://www.viator.com/tours/x/d1-173028P1", link_ok: null }) });
  ok(!!unchecked.dest, "an unchecked row (link_ok null) still resolves — the sweep decides, not the reader");
}

/* ── 6. the sweep is real: route exists and is scheduled ─────────────────── */
let routeSrc = "";
try { routeSrc = readFileSync(REPO + "app/api/cron/experiences-link-health/route.js", "utf8"); } catch {}
ok(/export async function GET/.test(routeSrc), "the sweep route must exist and export GET");
ok(/CRON_SECRET/.test(routeSrc), "the sweep must carry the fail-closed cron auth");
ok(/classifyProductProbe/.test(routeSrc) && /nextHealthState/.test(routeSrc), "the sweep must decide through the shared, guard-called logic — not a private copy");
let crons = [];
try { crons = JSON.parse(readFileSync(REPO + "vercel.json", "utf8")).crons || []; } catch {}
ok(crons.some((c) => String(c.path || "").startsWith("/api/cron/experiences-link-health")), "vercel.json must schedule the sweep — a pipeline that ran once is indistinguishable from no pipeline");

/* ── verdict ─────────────────────────────────────────────────────────────── */
if (fail.length) {
  console.error(`check-experiences-link-health: ${fail.length} FAILED (${pass} passed)`);
  for (const m of fail) console.error("  ✗ " + m);
  process.exit(1);
}
console.log(`check-experiences-link-health: ${pass} assertions passed`);
