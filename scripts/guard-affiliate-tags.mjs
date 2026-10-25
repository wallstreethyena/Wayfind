#!/usr/bin/env node
// guard-affiliate-tags — outbound affiliate links must carry the partner id
// the repo already defines. Scans guide, culture, and event content for partner
// -domain URLs, and judges the real link builders' outputs.
//
// A bare viator.com URL fails unless it is a viatorUrl product identity (the
// go-route input) or an argument to withViatorTracking / viatorProductGoUrl /
// viatorDirectUrl in the same statement. api.viator.com is the Partner API,
// not a click URL. An official non-affiliate link is allowed only with a
// same-line `wf-affiliate-allow: official` annotation.
//
// Partners whose publisher id is not a literal in the repo are gaps: the
// domain is reported and is not failed for a param this file would have invented.
//
//   node scripts/guard-affiliate-tags.mjs
//   node scripts/guard-affiliate-tags.mjs --scan path --no-builders
import { researchEvent } from "../lib/christmasResearch.js";
import { isTicketmasterFamily } from "../lib/affiliates.js";
import { eventDetailTicketAction } from "../lib/curatedEvents.js";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRules, scanFile, contentFiles, auditViatorCallSites, codeLines, judgeUrl } from "./lib/affiliateTagScan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const scanOnly = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--scan") scanOnly.push(args[++i]);
  else if (args[i] === "--no-builders") args.noBuilders = true;
}
const noBuilders = args.noBuilders === true;

const failures = [];
const fail = (m) => failures.push(m);

let rules;
try { rules = loadRules(ROOT); }
catch (e) { console.error("guard-affiliate-tags: FAIL — " + e.message); process.exit(1); }

const files = scanOnly.length
  ? scanOnly.map((p) => path.resolve(p))
  : contentFiles(ROOT);
if (!files.length) fail("content scan found no files — an empty scan would pass vacuously");

const totals = { violations: [], inputs: [], official: [], domainFlags: [], files: files.length };
for (const abs of files) {
  let result;
  try { result = scanFile(abs, rules, ROOT); }
  catch (e) { fail(`could not scan ${abs}: ${e.message}`); continue; }
  totals.violations.push(...result.violations);
  totals.inputs.push(...result.inputs);
  totals.official.push(...result.official);
  totals.domainFlags.push(...result.domainFlags);
}

if (!scanOnly.length) {
  const inputs = totals.inputs.map((r) => r.url);
  if (!inputs.some((u) => u.includes("d663-3458ENTRY"))) {
    fail("positive control missing: lib/guides.js Gatorland viatorUrl was not classified as a builder input");
  }
  if (!inputs.some((u) => u.includes("d25738-a23676"))) {
    fail("positive control missing: Ringling viatorUrl was not classified as a builder input");
  }
  if (totals.violations.some((v) => v.url && v.url.includes("d663-3458ENTRY"))) {
    fail("Gatorland viatorUrl was judged a bare hop; it is a product identity handed to viatorProductGoUrl");
  }

  const sites = auditViatorCallSites(ROOT);
  if (sites.files < 50) fail(`viatorUrl call-site audit only walked ${sites.files} files`);
  for (const v of sites.violations) {
    totals.violations.push(v);
  }

  const stray = strayDestinationCalls(ROOT);
  for (const hit of stray) fail(hit);
}

// A raw research ticket is a builder input ONLY while its actual consumer
// produces our validated affiliate route. This executed proof is mandatory in
// the required guard, including targeted scans that encounter such an input.
const researchInputs = totals.inputs.filter((row) => row.via === "christmas-ticket-input");
if (!scanOnly.length || researchInputs.length) {
  try {
    const rows = JSON.parse(readFileSync(path.join(ROOT, "data/christmas-2026-research.json"), "utf8"));
    const family = rows.filter((row) => isTicketmasterFamily(row.ticket_url));
    if (!family.length || family.length !== researchInputs.length) fail("Christmas ticket input census does not match the runtime probe");
    process.env.WF_SUPPRESS_ANALYTICS = "1";
    const { GET } = await loadComponent(path.join(ROOT, "app/api/ticketmaster/go/route.js"), ROOT);
    for (const row of family) {
      const normalized = researchEvent(row);
      const url = new URL(normalized?.official_ticket_url, "https://www.gowayfind.com");
      if (normalized?.official_event_url !== row.official_url || url.origin !== "https://www.gowayfind.com" || url.pathname !== "/api/ticketmaster/go" || url.searchParams.get("url") !== row.ticket_url) {
        fail(`Christmas research ticket ${row.id} is not attributed to its unchanged event destination`);
        continue;
      }
      const action = eventDetailTicketAction(normalized);
      if (action?.kind !== "affiliate" || action.href !== normalized.official_ticket_url) fail(`Christmas research ticket ${row.id} lost its affiliate disclosure`);
      const result = await GET(new Request(url, { headers: { "user-agent": "Mozilla/5.0" } }));
      const hop = new URL(result.headers.get("location"));
      if (result.status !== 302 || hop.hostname !== "ticketmaster.evyy.net" || hop.pathname !== "/c/7475855/264167/4272" || hop.searchParams.get("u") !== row.ticket_url || judgeUrl(hop.href, rules)?.outcome !== "ok") fail(`Christmas research ticket ${row.id} lost the pinned Impact attribution or exact destination`);
    }
    console.log(`guard-affiliate-tags: Christmas runtime probe executed for ${family.length} ticket input(s)`);
  } catch (error) { fail("Christmas research ticket runtime probe failed: " + error.message); }
}

for (const v of totals.violations) {
  fail(`${v.file}:${v.line} [${v.partner}] ${v.detail}${v.url ? " — " + v.url : ""}`);
}

let builderCount = 0;
const gapOutputs = [];
if (!noBuilders) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (/^(NEXT_PUBLIC_IMPACT_SID|NEXT_PUBLIC_TM_|NEXT_PUBLIC_TP_MARKER|NEXT_PUBLIC_GYG|NEXT_PUBLIC_CJ_|NEXT_PUBLIC_VIATOR|VIATOR_API_KEY)$/.test(k)) delete env[k];
  }
  const child = spawnSync(process.execPath, [path.join(ROOT, "scripts/lib/affiliateTagBuilders.mjs")], {
    cwd: ROOT,
    env,
    encoding: "utf8",
    timeout: 60000,
  });
  if (child.status !== 0) {
    fail("builder probe exited " + child.status + "\n" + (child.stderr || child.stdout || ""));
  } else {
    let parsed;
    try { parsed = JSON.parse(child.stdout); }
    catch (e) { fail("builder probe did not print JSON: " + e.message + "\n" + String(child.stdout).slice(0, 400)); }
    if (parsed) {
      if (parsed.wrappedMarketCount !== parsed.marketCount) {
        fail(`destinationUrl viator wrap covered ${parsed.wrappedMarketCount} of ${parsed.marketCount} markets`);
      }
      for (const row of parsed.urls) {
        builderCount++;
        const problem = judgeBuilder(row, parsed.bareInput, rules);
        if (problem) fail(problem);
        else if (row.name === "bookingHotelSearchUrl" || row.name === "hotelUrl") gapOutputs.push(row.name);
      }
      if (!parsed.urls.some((r) => r.name === "viatorDirectUrl")) fail("builder probe did not call viatorDirectUrl");
    }
  }
}

if (failures.length) {
  console.error("guard-affiliate-tags: FAIL — " + failures.length);
  for (const m of failures) console.error("  - " + m);
  process.exit(1);
}

const gapList = rules.gaps.map((g) => `${g.id} (${g.hosts.join(", ")})`).join("; ");
console.log(
  `guard-affiliate-tags: OK — ${totals.files} content files, ` +
  `${totals.violations.length} violations, ${totals.inputs.length} builder inputs, ` +
  `${totals.official.length} official allows, ${totals.domainFlags.length} gap-domain hits, ` +
  `${builderCount} builder outputs` +
  (gapOutputs.length ? ` (${gapOutputs.length} booking.com outputs flagged as gaps)` : "")
);
if (totals.official.length) {
  console.log("  official allows:");
  for (const o of totals.official) console.log(`    ${o.file}:${o.line} ${o.url}`);
}
if (totals.domainFlags.length) {
  console.log("  gap domains present in content (not failed; required value is not pinned):");
  for (const o of totals.domainFlags) console.log(`    ${o.file}:${o.line} [${o.partner}] ${o.url}`);
}
console.log("  gaps (required param undefined in repo, domain flagged only): " + gapList);
console.log(
  "  partners: viator pid=" + rules.pid + " mcid=" + rules.mcid + " medium=link|api; " +
  "Stay22 aid=" + rules.stayAid + "; CJ PID " + rules.cjPid + "; Awin affid " + rules.awinAffid + "; " +
  "Impact /c/" + rules.tm.sid + "/" + rules.tm.campaign + "/" + rules.tm.ad + "; " +
  "Travelpayouts marker=" + rules.marker + " trs=" + rules.trs
);

function judgeBuilder(row, bareInput, rules) {
  const { name, url } = row;
  if (name === "bookItTarget.viator") {
    if (url == null) return null;
    const judged = judgeUrl(url, rules);
    if (!judged || judged.outcome !== "ok") {
      return "bookItTarget emitted an untracked Viator URL (viator is excluded from that surface; a bare hop is the bypass): " + url;
    }
    return null;
  }
  if (url == null) return name + " returned null";
  if (name === "bookingHotelSearchUrl" || name === "hotelUrl") {
    const judged = judgeUrl(url, rules);
    if (!judged || judged.outcome !== "gap" || judged.partner !== "booking") {
      return name + " should be an untagged booking.com URL (Stay22 gap), got " + url;
    }
    return null;
  }
  if (/^(viatorProductGoUrl|bookingTargets|eventTicketHref|commerceHref)/.test(name)) {
    let abs;
    try { abs = new URL(url, "https://gowayfind.com"); }
    catch { return name + " is not a URL: " + url; }
    if (abs.hostname !== "gowayfind.com" || !abs.pathname.startsWith("/api/")) {
      return name + " bypassed our go route: " + url;
    }
    return null;
  }
  if (name === "viatorDirectUrl" && url === bareInput) {
    return "viatorDirectUrl returned the bare viator.com URL unchanged (affiliate id dropped)";
  }
  const judged = judgeUrl(url, rules);
  if (!judged) return name + " output is not on a known partner host: " + url;
  if (judged.outcome === "violation") return name + ": " + judged.detail + " — " + url;
  if (judged.outcome === "gap") return name + " output is on a gap domain (no pinned param): " + url;
  return null;
}

function strayDestinationCalls(root) {
  const hits = [];
  const dirs = [path.join(root, "app"), path.join(root, "lib")];
  const files = [];
  for (const dir of dirs) walkJs(dir, files);
  for (const abs of files) {
    const rel = path.relative(root, abs).split(path.sep).join("/");
    if (rel === "lib/destinations.js" || rel === "lib/monetize.js") continue;
    const src = readFileSync(abs, "utf8");
    for (const line of codeLines(src)) {
      if (/destinationUrl\s*\(/.test(line.code) && !/withViatorTracking\s*\(|tpDeepLink\s*\(/.test(line.code)) {
        hits.push(`${rel}:${line.lineNo} calls destinationUrl() without a tracking wrapper on the same line`);
      }
      if (/\.viator\.url\b/.test(line.code) && !/withViatorTracking\s*\(/.test(line.code)) {
        hits.push(`${rel}:${line.lineNo} reads a bare MARKETS viator.url`);
      }
      if (/\bwrapCard\s*\(/.test(line.code)) {
        hits.push(`${rel}:${line.lineNo} calls wrapCard() — its Viator search URL is untracked`);
      }
    }
  }
  return hits;
}

function walkJs(dir, acc) {
  let names;
  try { names = readdirSync(dir); }
  catch { return; }
  for (const name of names) {
    if (name === "node_modules" || name === ".next") continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkJs(p, acc);
    else if (name.endsWith(".js") || name.endsWith(".jsx")) acc.push(p);
  }
}
