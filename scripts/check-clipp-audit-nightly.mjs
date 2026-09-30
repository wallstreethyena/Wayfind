#!/usr/bin/env node
// Lock for the Clipp audit split (2026-09-29): a stale Clipp audit is a NIGHTLY
// alert, never a deploy blocker — and never a reason to show an unverified offer.
//
// THE INCIDENT. lib/coupons.js carries hand-set re-verify dates for Clipp's
// rotating certificates. check-guide-deal-cards read the real date, so on
// 2026-09-28 -> 09-29 it went red on unchanged code and every Vercel build
// failed until a human renewed a date (#1547). It recurs every two weeks.
//
// THE SPLIT THIS LOCKS.
//   build    deployability only — check-guide-deal-cards judges Clipp cards at a
//            pinned date (see that guard);
//   runtime  a lapsed fuse still HIDES its cards (couponIsLive, unchanged);
//   nightly  app/api/cron/certificate-audit reads the REAL date, pulses succeeded=0
//            while any fuse is stale, and job-watch emails until a human renews
//            after a real-browser check.
//
// EXECUTES THE CALLS. clippAuditStatus() and clippAuditPulseRow() run with an
// injected date, so "the rule is in the file" cannot satisfy any of it. The three
// fuses are also asserted to stay three separate declarations.
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { COUPONS, couponIsLive, clippAuditStatus } from "../lib/coupons.js";
import { CLIPP_MERCHANT_OFFERS, CLIPP_INDEX_REVERIFIED } from "../lib/clippOffers.js";

let n = 0, bad = 0;
const ok = (cond, msg) => { n++; if (!cond) { bad++; console.error("  - " + msg); } };
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
// Strip comments so this guard cannot pass on its own (or the source's) prose.
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const dayAfter = (iso) => new Date(Date.parse(iso + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);

const route = await import("../app/api/cron/certificate-audit/route.js");
const { clippAuditPulseRow } = route;
ok(typeof clippAuditPulseRow === "function" && typeof route.GET === "function", "route exports GET and clippAuditPulseRow");

// The three expiries, read from the registry itself so a renewal is picked up
// without editing this file. merchant is the constant this PR is about.
const status = clippAuditStatus("2026-09-25");
const CITY = status.city.expires, MERCHANT = status.merchant.expires, REVERIFIED = status.reverified.expires;
ok(/^\d{4}-\d{2}-\d{2}$/.test(CITY) && /^\d{4}-\d{2}-\d{2}$/.test(MERCHANT) && /^\d{4}-\d{2}-\d{2}$/.test(REVERIFIED), "all three fuses are bounded ISO dates");
ok(status.city.total >= 4, `city fuse covers the 4 city cards (found ${status.city.total}) — 0 would make every state below vacuous`);
ok(status.merchant.total >= 1, `merchant fuse covers real merchant cards (found ${status.merchant.total})`);

// ── STATE 1: FRESH — a day inside every fuse ────────────────────────────────
const freshDay = ["2026-09-25", CITY, MERCHANT, REVERIFIED].sort()[0];
const fresh = clippAuditStatus(freshDay);
ok(!fresh.city.stale && !fresh.merchant.stale && !fresh.reverified.stale, `fresh ${freshDay}: no fuse stale`);
ok(fresh.city.hidden === 0 && fresh.merchant.hidden === 0 && fresh.reverified.hidden === 0, "fresh: no Clipp card hidden — merchant and city cards may display");
ok(fresh.merchant.visible === fresh.merchant.total && fresh.city.visible === fresh.city.total, "fresh: every counted card is visible");
const freshPulse = clippAuditPulseRow(fresh);
ok(freshPulse.succeeded === 1 && freshPulse.failed === 0 && freshPulse.attempted === 1 && /^clean Clipp audit:/.test(freshPulse.note), `fresh: nightly is clean (${JSON.stringify(freshPulse)})`);

// ── STATE 2: EXPIRED — the day after the merchant fuse ─────────────────────
// Judged against the merchant fuse ALONE (city may still be inside its window,
// which is exactly the independence being locked).
const lapsedDay = dayAfter(MERCHANT);
const lapsed = clippAuditStatus(lapsedDay);
ok(lapsed.merchant.stale === true, `expired ${lapsedDay}: merchant fuse reports stale`);
ok(lapsed.merchant.visible === 0 && lapsed.merchant.hidden === lapsed.merchant.total, "expired: EVERY merchant card is hidden (fail closed)");
const lapsedPulse = clippAuditPulseRow(lapsed);
ok(lapsedPulse.succeeded === 0 && lapsedPulse.failed >= 1, `expired: nightly reports the problem (succeeded=0) so job-watch pages (${JSON.stringify(lapsedPulse)})`);
ok(/^stale Clipp audit:/.test(lapsedPulse.note) && /merchant/.test(lapsedPulse.note) && lapsedPulse.note.includes(MERCHANT) && /real browser/.test(lapsedPulse.note), "expired: the note names the merchant fuse, its date, and the human check required");
ok(lapsedPulse.note.length <= 200, "pulse note fits the 200 char pulse column");
// The runtime hide is the REAL couponIsLive over the REAL registry, not the counter.
// The exact merchant set, by id (offers not in the separately re-verified subset) —
// never selected by date, so renewing the merchant fuse to the same day as the
// re-verified one cannot make this assertion wrong.
const reverifiedIds = new Set(CLIPP_INDEX_REVERIFIED.offerIds);
const merchantIds = new Set(CLIPP_MERCHANT_OFFERS.map((o) => "cpn-" + o.offerId).filter((id) => !reverifiedIds.has(id.replace(/^cpn-/, ""))));
const merchantCards = COUPONS.filter((c) => merchantIds.has(c.id));
ok(merchantCards.length === status.merchant.total && merchantCards.length >= 1, `registry has exactly the counted merchant cards (${merchantCards.length} vs ${status.merchant.total})`);
ok(merchantCards.every((c) => c.expires === MERCHANT), "every merchant card expires on the merchant fuse and nothing else");
ok(merchantCards.every((c) => couponIsLive(c, MERCHANT) && !couponIsLive(c, lapsedDay)), "each merchant card is live on its last day and hidden the day after, through the real couponIsLive");

// ── FUSES ARE INDEPENDENT ───────────────────────────────────────────────────
const src = read("lib/coupons.js");
const c = code(src);
const cityDecl = c.match(/const\s+CLIPP_AUDIT_EXPIRY\s*=\s*"(\d{4}-\d{2}-\d{2})"\s*;/g) || [];
const merchDecl = c.match(/const\s+CLIPP_MERCHANT_AUDIT_EXPIRY\s*=\s*"(\d{4}-\d{2}-\d{2})"\s*;/g) || [];
ok(cityDecl.length === 1, `CLIPP_AUDIT_EXPIRY is declared exactly once as a string literal (found ${cityDecl.length})`);
ok(merchDecl.length === 1, `CLIPP_MERCHANT_AUDIT_EXPIRY is declared exactly once as a string literal (found ${merchDecl.length})`);
ok(!/CLIPP_MERCHANT_AUDIT_EXPIRY/.test(cityDecl[0] || ""), "the city fuse is not derived from the merchant fuse");
ok(!/CLIPP_AUDIT_EXPIRY\b/.test(merchDecl[0] || ""), "the merchant fuse is not derived from the city fuse");
// A literal is the point: a computed date (Date, now, +days) would auto-renew itself,
// which is the false verification this design exists to prevent.
ok(!/(?:Date|Date\.now|siteTodayStr|new Date)/.test((cityDecl[0] || "") + (merchDecl[0] || "")), "neither fuse is computed from the clock — a date must be edited by a human, never self-renew");
ok(/expires:\s*CLIPP_AUDIT_EXPIRY\s*,/.test(c), "city cards expire on the city fuse");
ok(/expires:\s*CLIPP_INDEX_REVERIFIED_IDS\.has\([^)]*\)\s*\?\s*CLIPP_INDEX_REVERIFIED\.expires\s*:\s*CLIPP_MERCHANT_AUDIT_EXPIRY/.test(c), "merchant cards expire on the merchant fuse (or the separate re-verified date)");

// ── STATE 3: RENEWED — only a deliberate edit of the literal shows cards again ─
// Nothing about the passage of time or the nightly job can make a hidden merchant
// card visible: with the constant untouched, every later day stays hidden, and the
// nightly job only reads. The only path back is the literal, checked here by
// showing visibility is a pure function of (today <= that literal).
const laterDays = [dayAfter(MERCHANT), "2026-12-25", "2027-06-01"];
ok(laterDays.every((d) => clippAuditStatus(d).merchant.visible === 0), "renewed-only-by-edit: with the literal unchanged, merchant cards stay hidden on every later day");
// The POSITIVE half: a deliberate edit of the merchant literal — and nothing else —
// brings the cards back. Proven on a throwaway copy of lib/coupons.js whose ONLY
// difference is that one literal, so the real file is never touched.
{
  const probePath = new URL("../lib/__renewed_probe_coupons.js", import.meta.url);
  const renewedSrc = src.replace(/(const\s+CLIPP_MERCHANT_AUDIT_EXPIRY\s*=\s*)"\d{4}-\d{2}-\d{2}"/, '$1"2099-01-01"');
  ok(renewedSrc !== src, "the probe copy really changed the merchant literal (a probe that changed nothing would prove nothing)");
  try {
    writeFileSync(probePath, renewedSrc);
    const renewed = await import(probePath.href + "?probe=" + Date.now());
    const before = clippAuditStatus(lapsedDay), after = renewed.clippAuditStatus(lapsedDay);
    ok(before.merchant.visible === 0 && after.merchant.visible === after.merchant.total && after.merchant.total === before.merchant.total && after.merchant.stale === false, `renewed: editing ONLY the merchant literal brings all ${after.merchant.total} merchant cards back on ${lapsedDay} (0 before)`);
    ok(after.city.visible === before.city.visible && after.city.stale === before.city.stale && after.city.expires === before.city.expires, "renewed: the city fuse is unaffected by a merchant renewal — the fuses are independent");
    ok(after.reverified.visible === before.reverified.visible, "renewed: the re-verified subset is unaffected too");
    ok(clippAuditPulseRow(renewed.clippAuditStatus(lapsedDay)).note.indexOf("merchant certificates lapsed") === -1, "renewed: the nightly no longer reports the merchant fuse");
  } finally {
    try { unlinkSync(probePath); } catch (e) {}
  }
  ok(!existsSync(probePath), "the probe copy was removed");
}
const routeSrc = code(read("app/api/cron/certificate-audit/route.js"));
ok(!/writeFile|appendFile|createClient|\.from\(|fetch\(|\.update\(|\.insert\(|\.upsert\(/.test(routeSrc), "the nightly job is read-only: no file write, no database write, no fetch — it can never renew a date");
ok(!/CLIPP_(?:MERCHANT_)?AUDIT_EXPIRY\s*=/.test(routeSrc), "the nightly job never assigns a fuse");
ok(clippAuditStatus(MERCHANT).merchant.visible === status.merchant.total && clippAuditStatus(MERCHANT).merchant.stale === false, "on the fuse date itself the cards are still visible (last valid day), matching couponIsLive");

// ── the build must not depend on the fuses ──────────────────────────────────
const guard = code(read("scripts/check-guide-deal-cards.mjs"));
ok(/const\s+CLIPP_FIXTURE_TODAY\s*=\s*"\d{4}-\d{2}-\d{2}"/.test(guard), "check-guide-deal-cards pins the date it judges Clipp cards at");
ok(/const\s+liveAt\s*=\s*\(c\)\s*=>\s*couponIsLive\(c,\s*isClipp\(c\)\s*\?\s*CLIPP_FIXTURE_TODAY\s*:\s*today\)/.test(guard) && /liveAt\(c\)/.test(guard.replace(/const\s+liveAt[^\n]*/, "")), "check-guide-deal-cards judges ONLY Clipp cards at the pin (liveAt) and every other card at the real date, and actually uses liveAt");
const PIN = (guard.match(/CLIPP_FIXTURE_TODAY\s*=\s*"(\d{4}-\d{2}-\d{2})"/) || [])[1] || "";
ok(PIN && PIN <= CITY && PIN <= MERCHANT && PIN <= REVERIFIED, `the pin ${PIN} is <= every fuse (${CITY}, ${MERCHANT}, ${REVERIFIED})`);

// ── the nightly path is wired ───────────────────────────────────────────────
ok(existsSync(new URL("../app/api/cron/certificate-audit/route.js", import.meta.url)), "app/api/cron/certificate-audit exists");
const vercel = JSON.parse(read("vercel.json"));
ok((vercel.crons || []).some((x) => x.path === "/api/cron/certificate-audit" && /^\d+ \d+ \* \* \*$/.test(x.schedule)), "vercel.json schedules certificate-audit daily");
ok(/recordPulse\(JOB,/.test(routeSrc) && /siteTodayStr\(\)/.test(routeSrc), "the cron pulses through recordPulse (job-watch delivers) against the real venue-local date");
ok(/CRON_SECRET/.test(routeSrc) && /401/.test(routeSrc), "the cron is CRON_SECRET-gated and fails closed");

if (bad) { console.error(`check-clipp-audit-nightly: FAIL — ${bad}/${n} assertions`); process.exit(1); }
console.log(`check-clipp-audit-nightly: OK — ${n} assertions (fresh: ${status.merchant.total} merchant + ${status.city.total} city cards visible, nightly clean; expired: all merchant cards hidden, nightly succeeded=0; fuses stay separate literals; nightly job read-only; build pinned <= every fuse)`);
