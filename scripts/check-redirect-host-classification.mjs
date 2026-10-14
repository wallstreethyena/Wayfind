#!/usr/bin/env node
/**
 * check-redirect-host-classification - every host /api/commerce/go can put in a
 * Location header is classified as ATTRIBUTED by the one list the app derives
 * from PROVIDERS (lib/commerceProviders.js isAttributedRedirectHost), and the
 * synthetic book-links monitor uses that same function, not its own copy.
 *
 * Why: 2026-10-14 the production synthetic `book-links` went red on a correct
 * attributed redirect (klook.tpx.lu?sub_id=wf_...). The monitor's allowlist held
 * only provider DESTINATION hosts (klook.com), never the tracking networks or the
 * Travelpayouts short-link hosts the route itself emits, so it only passed while
 * the first Book link on the page happened to be a Viator one.
 *
 * Own/unknown hosts must stay UNclassified (negative controls) so the monitor
 * still fails closed on our own fallback or a look-alike host.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROVIDERS, isAttributedRedirectHost, attributedRedirectHostRegexes } from "../lib/commerceProviders.js";
import { PARTNER_OFFER_REGISTRY } from "../lib/partnerOfferRegistry.js";
import { tpDeepLink } from "../lib/travelpayouts.js";
import { validTpShortUrl } from "../lib/travelpayoutsProvisioning.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { failed++; console.error("FAIL  " + m); } else console.log("  ok  " + m); };
const host = (u) => { try { return new URL(u).hostname; } catch { return ""; } };

// 1. positive: the exact production incident + every emitted host class
ok(isAttributedRedirectHost("klook.tpx.lu"), "klook.tpx.lu (the 2026-10-14 incident host) is attributed");
for (const h of ["tiqets.tpx.lu", "gocity.tpx.lu", "tp.st", "abc.tp.st", "tp.media", "www.viator.com", "klook.com"]) ok(isAttributedRedirectHost(h), `${h} is attributed`);

// 2. every provider declares at least one host; Travelpayouts-attributed ones declare short-link hosts
for (const [key, p] of Object.entries(PROVIDERS)) ok(Array.isArray(p.hosts) && p.hosts.length > 0, `${key}: declares destination hosts`);
for (const key of ["tiqets", "klook", "gocity"]) ok((PROVIDERS[key].shortLinkHosts || []).length > 0, `${key}: declares shortLinkHosts (route redirects it via wf_tp_links short_url)`);

// 3. every host the registry can emit is classified (destination, tp.media wrapper, short link)
let checked = 0;
for (const [id, row] of Object.entries(PARTNER_OFFER_REGISTRY)) {
  const p = PROVIDERS[row.provider];
  if (!p) continue;
  checked++;
  const dh = host(row.destination);
  if (!isAttributedRedirectHost(dh)) ok(false, `${id}: destination host ${dh} is classified`);
  const wrapped = typeof p.track === "function" ? p.track(row.destination, {}) : null;
  if (wrapped && !isAttributedRedirectHost(host(wrapped))) ok(false, `${id}: tracked host ${host(wrapped)} is classified`);
  if (p.shortLinkHosts && !isAttributedRedirectHost(`${row.provider}.tpx.lu`)) ok(false, `${id}: ${row.provider}.tpx.lu is classified`);
}
ok(checked > 100, `${checked} registry offers: destination, tracked and short-link hosts all classified`);

// 4. parity with the storage validator: any short link we may store is classified
for (const u of ["https://tiqets.tpx.lu/NHifzZw0", "https://gocity.tpx.lu/kn3kv29H?erid=2VtzqwiKLkx", "https://klook.tpx.lu/XNhLp2Qk", "https://tp.st/abc"]) {
  ok(validTpShortUrl(u) && isAttributedRedirectHost(host(u)), `stored-valid short link ${host(u)} is classified`);
}

// 5. negative controls: fail closed
for (const h of ["www.gowayfind.com", "gowayfind.com", "localhost", "tpx.lu", "tpx.lu.evil.com", "a.b.tpx.lu", "evil.com", "klook.com.evil.com", "nottp.media", ""]) {
  ok(!isAttributedRedirectHost(h), `"${h}" is NOT attributed`);
}
ok(attributedRedirectHostRegexes().length > 10, "host list is non-trivial");

// 6. the monitor uses the app's function, with no second list of PROVIDERS hosts
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const mon = strip(readFileSync(path.join(ROOT, "scripts/run-synthetic-monitor.mjs"), "utf8"));
ok(/import\s*\{[^}]*\bisAttributedRedirectHost\b[^}]*\}\s*from\s*"\.\.\/lib\/commerceProviders\.js"/.test(mon), "monitor imports isAttributedRedirectHost from lib/commerceProviders.js");
ok(/return\s+isAttributedRedirectHost\(hostname\)/.test(mon), "monitor's isAttributedPartnerHost delegates to it");
ok(!/PROVIDERS/.test(mon) && !/\.hosts\b/.test(mon), "monitor keeps no host list of its own");

console.log(failed ? `\ncheck-redirect-host-classification: ${failed} FAILED of ${n}` : `\ncheck-redirect-host-classification: all ${n} checks passed (${checked} registry offers, ${Object.keys(PROVIDERS).length} providers)`);
process.exit(failed ? 1 : 0);
