#!/usr/bin/env node
// scripts/check-affiliate-coverage.mjs — A CARD THAT MATCHES AN AFFILIATE
// NEVER SHIPS A RAW LINK BY ACCIDENT.
//
// THE INCIDENT (owner, 2026-09-15). The Fall in Florida Howl-O-Scream card
// rendered "Event details ↗" to buschgardens.com although wf_deals row 20
// (Undercover Tourist's single-night Howl-O-Scream ticket, CJ-attributed) had
// been mapped to it since 2026-09-03. PR #1200 (2026-09-09) correctly made
// the deals-health cron write link_ok=NULL on a Cloudflare 403 — and
// undercovertourist.com 403s every non-browser probe, so all 18 UT rows went
// null on the next run. app/api/events/fall/route.js filtered its bulk read
// with `deal.active && deal.link_ok && …`: null is falsy, every UT row was
// dropped, eventTicketCta received liveDeal=null and (correctly) returned no
// CTA, and the card fell through to the organizer's site. Six days of the
// season's highest-intent traffic, zero commission. scripts/check-event-
// ticket-deals.mjs was green the whole time: it executes eventTicketCta with
// hand-built liveDeal shapes but never the ROUTE'S OWN FILTER, so it proved
// the library's contract and never the caller that broke it.
//
// What this locks, BY CALL where a call exists:
//   1. UNKNOWN IS NOT DEAD. isServableDeal({link_ok:null}) is true; only
//      link_ok === false / active === false / a lost PID refuse. Red-proven
//      by the exact row shape that shipped the bug.
//   2. ONE PREDICATE. The fall route imports isServableDeal and its wf_deals
//      filter calls it — no inline health test that can drift again.
//   3. NO STRICT-TRUTHY link_ok GATE ANYWHERE. Comment- and string-stripped
//      scan of app/ + lib/: `x.link_ok` may only be compared with === / !==
//      (or read as a value into an object/ternary), never used as a boolean.
//      The scanner is proven against a positive and a negative control first.
//   4. THE REDIRECT REFUSES A PROVEN-DEAD UT ROW. PROVIDERS.undercover_tourist
//      carries deadColumn "link_ok", so a page that builds its CTA from the
//      static registry with no live row in hand still cannot 302 a click to
//      a row the cron has proven dead.
//   5. THE LIBRARY IS INTERNALLY TRUE. Every park-admission mapping in
//      EVENT_TICKET_DEALS uses the admission row the library holds for that
//      merchant; no admission row is an event-ticket row; every Tiqets/Klook
//      offer id resolves in PARTNER_OFFER_REGISTRY under that provider.
//   6. COVERAGE CLASSIFIES CORRECTLY, executed on the real shapes: a mapped
//      event, an unmapped event at a sellable merchant (the leak), a Tiqets-
//      only merchant, a merchant nobody sells, and a sibling park on a shared
//      host (seaworld.com/san-diego is not SeaWorld Orlando).
//   7. THE WATCH IS WIRED. app/api/cron/affiliate-coverage exists, is
//      scheduled in vercel.json, and its pulse rule reports succeeded=0 when
//      any event is in the leak state (executed, not read).
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EVENT_TICKET_DEALS, isServableDeal, eventTicketCta } from "../lib/eventTicketDeals.js";
import { UT_EVENT_DEAL_IDS, CJ_PID } from "../lib/deals.js";
import { PROVIDERS } from "../lib/commerceProviders.js";
import { PARTNER_OFFER_REGISTRY } from "../lib/partnerOfferRegistry.js";
import { AFFILIATE_MERCHANTS, MERCHANT_HOSTS, affiliateMerchantForUrl, eventAffiliateCoverage, unmappedSellableEvents, COVERAGE } from "../lib/affiliateLibrary.js";
import { coveragePulseRow, tallyCoverage } from "../app/api/cron/affiliate-coverage/route.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };

// ── 1. unknown is not dead, executed on the shipped row shape ──────────────
const tracked = `https://www.anrdoezrs.net/links/${CJ_PID}/type/dlg/sid/coupon_hos_tampa/https://www.undercovertourist.com/orlando/busch-gardens-tampa-howl-o-scream/`;
const shipped = { id: 20, active: true, link_ok: null, http_status: 403, affiliate_url: tracked, provider: "undercover_tourist" };
ok(isServableDeal(shipped) === true, "the exact wf_deals shape that went dark (active, link_ok=null after a 403, PID intact) IS servable");
ok(isServableDeal({ ...shipped, link_ok: true }) === true, "link_ok=true is servable");
ok(isServableDeal({ ...shipped, link_ok: false }) === false, "link_ok=false (proven dead) is NOT servable");
ok(isServableDeal({ ...shipped, active: false }) === false, "active=false is NOT servable");
ok(isServableDeal({ ...shipped, affiliate_url: "https://www.undercovertourist.com/orlando/x/" }) === false, "a row that lost its CJ PID is NOT servable (better dark than unattributed)");
ok(isServableDeal(null) === false && isServableDeal(undefined) === false && isServableDeal("x") === false, "garbage is not servable");
// …and the rest of the chain agrees: a servable row yields the CTA.
const cta = eventTicketCta("howl-o-scream-tampa-2026", { surface: "fall_intent_rail", liveDeal: shipped });
ok(cta && cta.href === "/api/commerce/go?provider=undercover_tourist&offer=20&surface=fall_intent_rail&content=howl-o-scream-tampa-2026", `Howl-O-Scream on the null-health row still gets the commerce-go ticket (${cta && cta.href})`);

// ── 2. one predicate at the route ──────────────────────────────────────────
const route = read("app/api/events/fall/route.js");
ok(/import \{[^}]*\bisServableDeal\b[^}]*\} from "\.\.\/\.\.\/\.\.\/\.\.\/lib\/eventTicketDeals\.js"/.test(route), "the fall route imports isServableDeal from the registry");
ok(/\.filter\(\(deal\) => isServableDeal\(deal\)\)/.test(route), "the fall route's wf_deals filter CALLS isServableDeal");
ok(!/deal\.active\s*&&\s*deal\.link_ok/.test(route), "the inline `deal.active && deal.link_ok` gate is gone");

// ── 3. no strict-truthy link_ok gate anywhere, with a proven scanner ───────
function stripCode(src) {
  // Order matters: block comments, then line comments, then strings/templates.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:\\])\/\/[^\n]*/g, "$1")
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '""')
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/'(?:\\.|[^'\\\n])*'/g, '""');
}
// A truthy use: `.link_ok` followed by something other than a comparison
// operator, a colon (object literal / ternary value), a comma, a closing
// paren that ends a call ARGUMENT list, or a semicolon. `!x.link_ok` is a
// truthy use too. Legitimate reads (`link_ok === false`, `link_ok !== false`,
// `typeof r.link_ok === "boolean"`, `{ link_ok: row.link_ok }`) are excluded.
const TRUTHY_GATE = /(!\s*[\w$.]+\.link_ok\b)|(\.link_ok\b\s*(?:&&|\|\||\?(?!\?)|\)\s*(?:&&|\|\||\?|\{|=>)))/g;
function truthyGates(src) {
  const code = stripCode(src);
  const hits = [];
  let m;
  while ((m = TRUTHY_GATE.exec(code))) {
    const line = code.slice(0, m.index).split("\n").length;
    hits.push({ line, text: code.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\s+/g, " ").trim() });
  }
  return hits;
}
// positive control: the exact shipped expression must be caught…
const positive = truthyGates('const byDealId = new Map(rows.filter((deal) => deal.active && deal.link_ok && hasCjPid(deal.affiliate_url)));');
ok(positive.length === 1, `scanner positive control: the shipped filter is flagged (${positive.length} hit)`);
ok(truthyGates("if (!row.link_ok) return null;").length === 1, "scanner positive control: `!row.link_ok` is flagged");
ok(truthyGates("const x = row.link_ok ? a : b;").length === 1, "scanner positive control: `row.link_ok ? a : b` is flagged");
// …and every sanctioned read must NOT be.
const negatives = [
  'if (liveDeal && (liveDeal.active === false || liveDeal.link_ok === false)) return null;',
  '.filter((r) => r.link_ok !== false && r.product_url)',
  'm.set(code, r && typeof r.link_ok === "boolean" ? r.link_ok : null);',
  'return { link_ok: row.link_ok === false ? false : null, fail_count: row.fail_count || 0 };',
  '(r.link_ok === true && [403, 429].includes(r.http_status)) ||',
  '// a comment saying deal.link_ok && stuff',
  'const s = "select=id,link_ok&link_ok=eq.true";',
  'patch(row.event_id, { link_ok: true, link_verdict: "alive" })',
  'if (next.link_ok === false) buckets.dead.push(row.product_code);',
];
for (const n of negatives) ok(truthyGates(n).length === 0, `scanner negative control is silent on: ${n}`);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) return name === "node_modules" || name === ".next" ? [] : walk(p);
    return /\.(js|mjs|jsx|ts|tsx)$/.test(name) ? [p] : [];
  });
}
const scanned = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "lib"))];
const offenders = [];
for (const file of scanned) {
  const hits = truthyGates(readFileSync(file, "utf8"));
  for (const h of hits) offenders.push(`${path.relative(ROOT, file)}:${h.line}  ${h.text}`);
}
ok(scanned.length > 200, `the sweep actually covered app/ + lib/ (${scanned.length} files)`);
ok(offenders.length === 0, `no strict-truthy link_ok gate in app/ or lib/ — offenders:\n    ${offenders.join("\n    ")}`);

// ── 4. the redirect refuses a proven-dead UT row ───────────────────────────
ok(PROVIDERS.undercover_tourist && PROVIDERS.undercover_tourist.deadColumn === "link_ok", "PROVIDERS.undercover_tourist.deadColumn is link_ok — /api/commerce/go fails closed on a proven-dead deal for every surface at once");
ok(PROVIDERS.viator && PROVIDERS.viator.deadColumn === "link_ok", "(and viator keeps its own)");
const providersSrc = read("lib/commerceProviders.js");
ok(/rows\[0\]\[cfg\.deadColumn\] === false/.test(providersSrc), "resolveOffer refuses ONLY === false — a null (unknown) row still redirects");

// ── 5. the library is internally true ──────────────────────────────────────
ok(AFFILIATE_MERCHANTS.length >= 18, `the library holds the audited merchants (${AFFILIATE_MERCHANTS.length})`);
ok(new Set(AFFILIATE_MERCHANTS.map((m) => m.key)).size === AFFILIATE_MERCHANTS.length, "merchant keys are unique");
ok(new Set(MERCHANT_HOSTS).size === MERCHANT_HOSTS.length, "no host is claimed by two merchants");
for (const m of AFFILIATE_MERCHANTS) {
  ok(m.hosts.every((h) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h) && !h.startsWith("www.")), `${m.key}: hosts are bare registrable hosts (${m.hosts.join(",")})`);
  if (m.admission) {
    ok(m.admission.provider === "undercover_tourist" && Number.isInteger(m.admission.offerId), `${m.key}: admission is a UT wf_deals id`);
    ok(!(String(m.admission.offerId) in UT_EVENT_DEAL_IDS), `${m.key}: admission row ${m.admission.offerId} is never an EVENT-ticket row`);
    ok(m.partners.some((p) => p.provider === "undercover_tourist" && p.offerId === m.admission.offerId), `${m.key}: the admission row is listed among its partners`);
  }
  for (const p of m.partners) {
    ok(p.provider in PROVIDERS, `${m.key}: partner provider ${p.provider} is a live commerce provider`);
    if (p.provider === "tiqets" || p.provider === "klook") {
      const reg = PARTNER_OFFER_REGISTRY[p.offerId];
      ok(reg && reg.provider === p.provider, `${m.key}: ${p.provider} offer ${p.offerId} resolves in PARTNER_OFFER_REGISTRY under that provider`);
    }
  }
}
const admissionByDeal = new Map(AFFILIATE_MERCHANTS.filter((m) => m.admission).map((m) => [m.admission.offerId, m.key]));
for (const [eventId, entry] of Object.entries(EVENT_TICKET_DEALS)) {
  if (entry.product === "park-admission") ok(admissionByDeal.has(entry.deal), `${eventId}: park-admission deal ${entry.deal} is a library admission row (${admissionByDeal.get(entry.deal) || "MISSING"})`);
}
ok(EVENT_TICKET_DEALS["christmas-town-2026"]?.deal === 15 && EVENT_TICKET_DEALS["seaworld-orlando-christmas-2026"]?.deal === 7 && EVENT_TICKET_DEALS["legoland-fl-holidays-2026"]?.deal === 16,
  "the three organizer-confirmed included-with-admission holiday runs are mapped to their park's admission row");
ok(!("jollywood-nights-2026" in EVENT_TICKET_DEALS) && !("mvmcp-2026" in EVENT_TICKET_DEALS), "separately-ticketed Disney holiday parties are NOT mapped to park admission (no UT event-ticket row exists yet)");

// ── 6. coverage classifies correctly, executed ─────────────────────────────
ok(affiliateMerchantForUrl("https://buschgardens.com/tampa/events/howl-o-scream/")?.key === "busch-gardens-tampa", "buschgardens.com/tampa → Busch Gardens Tampa Bay");
ok(affiliateMerchantForUrl("https://buschgardens.com/williamsburg/events/x/") === null, "buschgardens.com/williamsburg is NOT the Tampa park");
ok(affiliateMerchantForUrl("https://seaworld.com/san-diego/") === null && affiliateMerchantForUrl("https://seaworld.com/orlando/events/x/")?.key === "seaworld-orlando", "seaworld.com is only SeaWorld Orlando under /orlando/");
ok(affiliateMerchantForUrl("https://tickets.legoland.com/florida/x")?.key === "legoland-florida", "a subdomain of a library host matches");
ok(affiliateMerchantForUrl("https://notlegoland.com/florida/") === null && affiliateMerchantForUrl("javascript:alert(1)") === null && affiliateMerchantForUrl("") === null, "a lookalike host, a non-http URL and an empty value never match");
const fx = [
  { event_id: "howl-o-scream-tampa-2026", official_event_url: "https://buschgardens.com/tampa/events/howl-o-scream/" },
  { event_id: "jollywood-nights-2026", official_ticket_url: "https://disneyworld.disney.go.com/events/jollywood-nights/purchase/" },
  { event_id: "zootampa-christmas-wild-2026", official_event_url: "https://zootampa.org/events/christmas-in-the-wild/" },
  { event_id: "fantasy-fest-2026", official_event_url: "https://fantasyfest.com/" },
  { event_id: "no-url-2026" },
];
const statuses = fx.map((e) => eventAffiliateCoverage(e).status);
ok(statuses[0] === COVERAGE.MAPPED, "a mapped event → mapped");
ok(statuses[1] === COVERAGE.UNMAPPED, "an unmapped event at a UT-sold merchant → unmapped (the leak state)");
ok(statuses[2] === COVERAGE.SELLABLE_NO_UT_PATH, "a Tiqets-only merchant → sellable-no-ut-path (named, not hidden)");
ok(statuses[3] === COVERAGE.NO_PARTNER && statuses[4] === COVERAGE.NO_URL, "a merchant nobody sells → no-partner; no URL → no-url");
ok(eventAffiliateCoverage({ event_id: "wfc:howl-o-scream-tampa-2026", official_event_url: "https://buschgardens.com/tampa/" }).status === COVERAGE.MAPPED, "the feed's wfc: prefix resolves like the bare id");
const leaks = unmappedSellableEvents(fx);
ok(leaks.length === 1 && leaks[0].eventId === "jollywood-nights-2026" && leaks[0].merchant.admission.offerId === 5, "unmappedSellableEvents returns exactly the leak, naming the merchant's admission row");

// ── 7. the watch is wired, executed ────────────────────────────────────────
ok(existsSync(path.join(ROOT, "app/api/cron/affiliate-coverage/route.js")), "app/api/cron/affiliate-coverage exists");
const vercel = JSON.parse(read("vercel.json"));
ok((vercel.crons || []).some((c) => c.path === "/api/cron/affiliate-coverage" && /^\d+ \d+ \* \* \*$/.test(c.schedule)), "…and vercel.json schedules it daily");
const cleanTally = tallyCoverage(fx.filter((e) => e.event_id !== "jollywood-nights-2026"));
const leakTally = tallyCoverage(fx);
const cleanRow = coveragePulseRow(cleanTally);
const leakRow = coveragePulseRow(leakTally);
ok(cleanRow.attempted === 1 && cleanRow.succeeded === 1 && cleanRow.failed === 0 && /^clean:/.test(cleanRow.note), "a run with no leak pulses succeeded=1");
ok(leakRow.attempted === 1 && leakRow.succeeded === 0 && leakRow.failed === 1 && /jollywood-nights-2026/.test(leakRow.note), "a run with a leak pulses succeeded=0 and NAMES the event, so job-watch's email says what to map");
ok(leakRow.note.length <= 200, "the note fits the pulse column");

console.log(fail ? `check-affiliate-coverage: FAIL — ${fail} failed, ${pass} passed` : `check-affiliate-coverage: OK — ${pass} assertions; unknown≠dead, one predicate, ${scanned.length} files clean of truthy link_ok gates, ${AFFILIATE_MERCHANTS.length}-merchant library consistent, nightly watch wired`);
process.exit(fail ? 1 : 0);
