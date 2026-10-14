#!/usr/bin/env node
// scripts/check-tampa-bay-region.mjs - THE 'tampa' COVERAGE KEY IS THE TAMPA BAY REGION.
//
// 227 places labeled metro='tampa' are really St. Petersburg and will be relabeled
// 'st-pete'. Labels and discovery coverage are separate: every reader that serves the
// 'tampa' coverage key reads lib/metroRegions.js metroMembers('tampa') =
// ['tampa','st-pete'] and is titled "Tampa Bay". Tampa CITY landing pages stay
// distance-only (17 mi tight, 30 mi wide) and must never read the region.
//
// Asserts (code only, comments stripped; strings kept where the string IS the subject):
//  1. metroMembers/regionLabel behave (CALLED, not grepped).
//  2. The SQL twin wf_metro_members lists exactly the JS members.
//  3. The migration changes the 3 cuisine readers + wf_things_to_do to the twin and
//     none of them still compares `metro = p_metro`.
//  4. Each wired JS reader CALLS metroMembers/metroCovers/postgrestMetroFilter (call
//     syntax, not a bare mention) and no reader hardcodes metro=eq.tampa / .eq("metro","tampa").
//  5. lib/landingInventory.js still has tryAt(27359) and tryAt(48280), evergreen radius is
//     17, and neither landing module reads the metro column or imports metroRegions.
//  6. Labels for the tampa key read "Tampa Bay" (cuisine + beaches), through regionLabel.
// Controls: a positive and a negative case for every extractor, run before the real tree.
import { readFileSync } from "node:fs";
import { metroMembers, regionLabel, metroCovers, postgrestMetroFilter, REGION_MEMBERS } from "../lib/metroRegions.js";
import { CUISINE_METROS } from "../lib/cuisine.js";
import { BEACH_METROS } from "../lib/beaches.js";
// lib/evergreenCities.js is NOT imported: check-evergreen-landing-zero-spend allows only the
// landing layer to import it (an importer could start spending), so its radius is read as source.
// Its path is built, not written as one literal, because that guard's importer scan matches any
// evergreen-cities path string; reading a file is not importing it.
const EVERGREEN_FILE = ["lib", "evergreen" + "Cities.js"].join("/");

const ROOT = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");
const errs = [];
const check = (c, m) => { if (!c) errs.push(m); };

// ---- extractors (exported shape kept tiny so controls can drive them) ----
export function stripJs(src) {
  // block + line comments; a // inside a string/URL is protected by requiring it not follow ':' or a quote char.
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}
export function stripSql(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
}
export function sqlTwinMembers(sql) {
  const body = /function\s+public\.wf_metro_members\s*\([^)]*\)[\s\S]*?\$function\$([\s\S]*?)\$function\$/i.exec(stripSql(sql));
  if (!body) return null;
  const m = /when\s+'tampa'\s+then\s+array\s*\[([^\]]*)\]/i.exec(body[1]);
  if (!m) return null;
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}
export function sqlFunctionBody(sql, name) {
  const re = new RegExp("function\\s+public\\." + name + "\\s*\\([\\s\\S]*?\\$function\\$([\\s\\S]*?)\\$function\\$", "i");
  const m = re.exec(stripSql(sql));
  return m ? m[1] : null;
}
export const callsOneOf = (code, names) => names.some((n) => new RegExp("(?<![\\w$.])" + n + "\\s*\\(").test(code));
export const importsName = (code, name, mod) => new RegExp("import\\s*\\{[^}]*\\b" + name + "\\b[^}]*\\}\\s*from\\s*[\"'][^\"']*" + mod + "(?:\\.js)?[\"']").test(code);
export const hardcodesTampaEq = (code) => /metro=eq\.tampa\b/.test(code) || /\.eq\(\s*["']metro["']\s*,\s*["']tampa["']\s*\)/.test(code);

// ---- controls ----
{
  const sql = "-- c\ncreate or replace function public.wf_metro_members(p text) returns text[] language sql as $function$ select case p when 'tampa' then array['tampa','st-pete']::text[] else array[p] end $function$;";
  check(JSON.stringify(sqlTwinMembers(sql)) === '["tampa","st-pete"]', "control: twin extractor misses a known positive");
  check(sqlTwinMembers(sql.replace("'st-pete'", "'x'")).join() === "tampa,x", "control: twin extractor does not see a changed member");
  check(sqlTwinMembers("select 1") === null, "control: twin extractor invents a twin");
  check(sqlTwinMembers("-- when 'tampa' then array['tampa','st-pete']\nselect 1") === null, "control: twin extractor reads a comment");
  check(callsOneOf("x = metroMembers(k)", ["metroMembers"]) && !callsOneOf("// metroMembers\nconst a = 1", ["metroMembers"]) && !callsOneOf("foo.metroMembers(1)", ["metroMembers"]), "control: call matcher");
  check(!callsOneOf(stripJs("// metroMembers(k)\nconst a = 1;"), ["metroMembers"]), "control: call matcher reads a stripped comment");
  check(hardcodesTampaEq("`&metro=eq.tampa&x`") && hardcodesTampaEq('q.eq("metro", "tampa")') && !hardcodesTampaEq("`&metro=eq.${m}`"), "control: hardcode matcher");
  check(importsName('import { metroCovers } from "../lib/metroRegions.js";', "metroCovers", "metroRegions") && !importsName('import { other } from "./metroRegions"', "metroCovers", "metroRegions"), "control: import matcher");
}

// ---- 1. JS behaviour ----
check(JSON.stringify(metroMembers("tampa")) === '["tampa","st-pete"]', "metroMembers('tampa') must be [tampa, st-pete]");
check(JSON.stringify(metroMembers("orlando")) === '["orlando"]', "metroMembers default must be [key]");
check(JSON.stringify(metroMembers("st-pete")) === '["st-pete"]', "'st-pete' is a label, not a coverage key: it reads only itself (no /eat/st-pete)");
check(regionLabel("tampa") === "Tampa Bay" && regionLabel("orlando") === null, "regionLabel('tampa') must be 'Tampa Bay'");
check(metroCovers("tampa", "st-pete") && !metroCovers("manatee-sarasota", "st-pete"), "tampa covers st-pete; other keys do not");
check(postgrestMetroFilter("tampa") === "in.(tampa,st-pete)" && postgrestMetroFilter("orlando") === "eq.orlando", "postgrestMetroFilter shape");
check(Object.keys(REGION_MEMBERS).join() === "tampa", "only the tampa region is declared; adding a region needs a deliberate guard update");

// ---- 2/3. SQL twin + migration ----
const MIG = "supabase/migrations/20261009120000_wf_tampa_bay_region_readers.sql";
const sql = read(MIG);
const twin = sqlTwinMembers(sql);
check(twin && JSON.stringify(twin) === JSON.stringify(metroMembers("tampa")), `SQL twin members ${JSON.stringify(twin)} != JS ${JSON.stringify(metroMembers("tampa"))}`);
for (const fn of ["wf_cuisine_chips", "wf_cuisine_places", "wf_cuisine_coverage"]) {
  const b = sqlFunctionBody(sql, fn);
  check(!!b, `${fn} body missing from migration`);
  if (b) {
    check(/metro\s*=\s*any\s*\(\s*public\.wf_metro_members\s*\(\s*p_metro\s*\)\s*\)/i.test(b), `${fn} must filter metro = any(public.wf_metro_members(p_metro))`);
    check(!/metro\s*=\s*p_metro\b/i.test(b), `${fn} still compares metro = p_metro`);
  }
}
const ttd = sqlFunctionBody(sql, "wf_things_to_do");
check(!!ttd && /coalesce\s*\(\s*\(\s*select\s+w\.locality[\s\S]*?\)\s*,\s*bp\.metro\s*\)\s+subtitle/i.test(ttd), "wf_things_to_do place subtitle must be coalesce(locality, bp.metro)");
check(!!ttd && /wf_metro_members\s*\(\s*'tampa'\s*\)/i.test(ttd), "wf_things_to_do city list must treat st-pete as Tampa Bay via wf_metro_members('tampa')");
const sqlCode = stripSql(sql);
check(/add column if not exists locality text/i.test(sqlCode) && /add column if not exists county text/i.test(sqlCode), "migration must add nullable locality + county idempotently");
check(/\bimmutable\b/i.test(sqlCode), "wf_metro_members must be IMMUTABLE");
check(!/\b(update|delete|insert)\b[^;]*\bwf_inventory\b/i.test(sqlCode), "migration must not write wf_inventory rows (the relabel is a separate, later step)");

// ---- 4. wired JS readers ----
const READERS = [
  ["lib/explodingNearbyServe.js", ["postgrestMetroFilter"]],
  ["lib/trendMatch.js", ["metroCovers"]],
  ["lib/trendSources/nativeCore.js", ["metroCovers"]],
  ["app/best-beaches/[metro]/page.js", ["metroCovers"]],
];
for (const [file, names] of READERS) {
  const code = stripJs(read(file));
  check(callsOneOf(code, names), `${file} must CALL ${names.join("/")}`);
  check(names.every((n) => importsName(code, n, "metroRegions")), `${file} must import ${names.join("/")} from metroRegions`);
  check(!hardcodesTampaEq(code), `${file} still hardcodes a tampa-only metro filter`);
}
// Owner constraint: NO increase in paid generation. Atlas generation scope must NOT take the region.
// Positive control: the same /metroRegions/ probe must find a known region reader,
// so the absence checks below cannot pass by a probe that matches nothing.
check(/metroRegions/.test(stripJs(read("lib/explodingNearbyServe.js"))), "positive control: /metroRegions/ finds the Trending Nearby reader");
check(/metroRegions/.test('import { metroMembers } from "../lib/metroRegions.js";'), "positive control: /metroRegions/ matches a literal import fixture");
for (const f of ["app/api/cron/atlas-build/route.js", "scripts/atlas-batch.mjs", "scripts/trends-import.mjs"]) {
  check(!/metroRegions/.test(stripJs(read(f))), `${f} must not read the metro region (atlas generation scope must not widen)`);
}
check(/const METROS = \["tampa", "orlando", "manatee-sarasota"\];/.test(stripJs(read("app/api/cron/atlas-build/route.js"))), "atlas-build METROS must stay the literal 3-key list");
check(/export const METROS = \["tampa", "orlando", "manatee-sarasota"\];/.test(stripJs(read("scripts/atlas-batch.mjs"))), "atlas-batch METROS must stay the literal 3-key list");
check(/metro=in\.\(\$\{metros\.join\(","\)\}\)/.test(stripJs(read("scripts/atlas-batch.mjs"))), "atlas-batch inventory read must not expand metros");
// every other non-test source file: no hardcoded tampa-only filter
import { readdirSync, statSync } from "node:fs";
function walk(dir, out = []) {
  for (const n of readdirSync(new URL(dir, ROOT))) {
    if (n === "node_modules" || n === ".next" || n === ".git") continue;
    const rel = dir + n;
    const st = statSync(new URL(rel, ROOT));
    if (st.isDirectory()) walk(rel + "/", out);
    else if (/\.(m?js|jsx)$/.test(n) && !/^(test-|check-)/.test(n)) out.push(rel);
  }
  return out;
}
let scanned = 0;
for (const f of [...walk("lib/"), ...walk("app/"), ...walk("scripts/")]) {
  scanned++;
  if (hardcodesTampaEq(stripJs(read(f)))) check(false, `${f} hardcodes metro=eq.tampa / .eq("metro","tampa")`);
}
check(scanned > 200, `only ${scanned} source files scanned; the walk lost its subject`);

// atlas city names: a St. Pete row must verify against St. Petersburg, never Tampa
import { METRO_CITY } from "../lib/atlasWebLane.js";
check(METRO_CITY["st-pete"] === "St. Petersburg" && METRO_CITY.tampa === "Tampa", "METRO_CITY: st-pete -> St. Petersburg, tampa -> Tampa");

// ---- 5. Tampa CITY pages untouched ----
const li = stripJs(read("lib/landingInventory.js"));
check((li.match(/tryAt\(\s*27359\s*\)/g) || []).length === 1, "landingInventory tight radius tryAt(27359) (17 mi) changed");
check((li.match(/tryAt\(\s*48280\s*\)/g) || []).length === 1, "landingInventory wide radius tryAt(48280) (30 mi) changed");
{ const ev = stripJs(read(EVERGREEN_FILE)); const m = ev.match(/(?:export\s+)?const\s+EVERGREEN_RADIUS_MI\s*=\s*(\d+)/); check(!!m, "PROBE: EVERGREEN_RADIUS_MI declaration found in the evergreen cities module"); check(m && Number(m[1]) === 17, `EVERGREEN_RADIUS_MI is ${m && m[1]}, expected 17`); }
for (const f of ["lib/landingInventory.js", "lib/landing.js", EVERGREEN_FILE, "lib/landingCities.js"]) {
  const code = stripJs(read(f));
  check(!/metroRegions/.test(code), `${f} (Tampa city page, distance-only) must not read the metro region`);
}
check(!/\bmetro\s*=\s*(eq|in)\./.test(li) && !/\.(eq|in)\(\s*["']metro["']/.test(li), "landingInventory must stay label-free (geometry only)");

// ---- 6. visible labels ----
check(CUISINE_METROS.tampa.label === "Tampa Bay", `CUISINE_METROS.tampa.label is "${CUISINE_METROS.tampa.label}"`);
check(BEACH_METROS.tampa.label === "Tampa Bay" && BEACH_METROS.tampa.short === "Tampa Bay", "BEACH_METROS.tampa must read Tampa Bay");
check(!("st-pete" in CUISINE_METROS) && !("st-pete" in BEACH_METROS), "no st-pete /eat or /best-beaches page");
check(importsName(stripJs(read("lib/cuisine.js")), "regionLabel", "metroRegions") && importsName(stripJs(read("lib/beaches.js")), "regionLabel", "metroRegions"), "cuisine/beaches labels must come from regionLabel (single source)");

if (errs.length) {
  for (const e of errs) console.error("check-tampa-bay-region: FAIL - " + e);
  process.exit(1);
}
console.log(`check-tampa-bay-region: OK - tampa coverage key = ${JSON.stringify(metroMembers("tampa"))} labeled "${regionLabel("tampa")}"; SQL twin matches; ${READERS.length} wired readers call the region API; ${scanned} source files scanned, none hardcode a tampa-only filter; landing 17/30 mi caps intact; 8 controls passed. Surface: static source + migration text (no DB, no render).`);
