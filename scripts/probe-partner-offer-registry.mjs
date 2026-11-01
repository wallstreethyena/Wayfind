#!/usr/bin/env node
// scripts/probe-partner-offer-registry.mjs — GET every destination in
// lib/partnerOfferRegistry.js with a phone user agent and report ok / dead /
// unknown / expired per offer. Read only: GETs public partner pages, never
// the affiliate redirector, so it creates no clicks. Exit 1 only on DEAD.
// Usage: node scripts/probe-partner-offer-registry.mjs [--json] [--provider=klook]
import { PARTNER_OFFER_REGISTRY } from "../lib/partnerOfferRegistry.js";
import { classifyProbe, isExpiredRow, summarize, VERDICT } from "../lib/partnerOfferHealth.js";
import { siteTodayStr } from "../lib/siteTime.js";

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 WayfindLinkHealth/1.0 (+https://gowayfind.com)";
const args = process.argv.slice(2);
const onlyProvider = (args.find((a) => a.startsWith("--provider=")) || "").split("=")[1];
const today = siteTodayStr();

async function probe(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(url, { redirect: "follow", headers: { "user-agent": UA, accept: "text/html" }, signal: ctl.signal });
    try { await res.body?.cancel(); } catch {}
    return { status: res.status, finalUrl: res.url };
  } catch (error) { return { error }; } finally { clearTimeout(t); }
}

const rows = Object.entries(PARTNER_OFFER_REGISTRY).filter(([, r]) => !onlyProvider || r.provider === onlyProvider);
const results = [];
const queue = [...rows];
await Promise.all(Array.from({ length: 6 }, async () => {
  while (queue.length) {
    const [id, row] = queue.shift();
    if (isExpiredRow(row, today)) { results.push({ id, provider: row.provider, verdict: VERDICT.EXPIRED, url: row.destination }); continue; }
    const p = await probe(row.destination);
    results.push({ id, provider: row.provider, url: row.destination, status: p.status ?? null, error: p.error ? String(p.error.cause?.code || p.error.message) : null, verdict: classifyProbe(p) });
  }
}));
results.sort((a, b) => a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id));
const s = summarize(results);
if (args.includes("--json")) console.log(JSON.stringify({ today, ...s, results }, null, 2));
else {
  for (const r of results) if (r.verdict !== VERDICT.OK) console.log(`${r.verdict.toUpperCase().padEnd(8)} ${r.provider.padEnd(22)} ${r.id}  ${r.status ?? r.error ?? ""}  ${r.url}`);
  console.log(`\n${today}: ${results.length} offers, ok ${s.counts.ok}, dead ${s.counts.dead}, unknown ${s.counts.unknown}, expired ${s.counts.expired}`);
}
process.exit(s.failed ? 1 : 0);
