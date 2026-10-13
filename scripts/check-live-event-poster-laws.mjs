// scripts/check-live-event-poster-laws.mjs
//
// Deterministic guard for the live-poster image engine (owner-locked
// 2026-09-16). Fails the build if any of these laws are broken, on the
// theory that a rule enforced by hand is a rule that eventually gets
// broken by accident.

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { globSync } from "node:fs";

import { RAILS } from "../lib/rails.js";

const root = process.cwd();
const fail = [];
const ok = (label) => console.log(`  OK  ${label}`);
const bad = (label, detail) => { fail.push(label); console.log(`FAIL  ${label}${detail ? " — " + detail : ""}`); };

function git(cmd) {
  try { return execSync(`git ${cmd}`, { cwd: root, encoding: "utf8" }); } catch (e) { return ""; }
}

// 1. Test the shipped contract, not whether unrelated files differ from HEAD.
// Static seasonal posters may join RAILS; live sports posters remain synthetic.
// The old diff-only gate rejected valid static additions before commit and
// checked nothing after commit. These predicates hold in both states.
{
  const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const home = strip(readFileSync("app/home.js", "utf8"));
  const menu = strip(readFileSync("app/components/DaypartRail.js", "utf8"));
  const hook = strip(readFileSync("app/components/useLivePosterTiles.js", "utf8"));
  const staticOnly = (rows) => rows.length > 0 && rows.every((r) => !/^live-/.test(r.id) && !["sports", "concerts"].includes(r.id)
    && !["livePosterSrc", "livePosterType", "livePosterEventId"].some((key) => key in r));
  const canonical = (source) => /const livePosterTiles = useLivePosterTiles\(\{ center: railCenter \|\| center, city: locName \}\);/.test(source);
  const handoff = (source) => /<DaypartRail\s+rails=\{RAILS\}\s+livePosters=\{livePosterTiles\}/.test(source);
  const sharedFeed = (source) => /usePosterEvents\(\{ active: !!config, center, city, mode: config\?\.mode \}\)/.test(source);
  const indexed = (source) => /new Map\(\[\.\.\.\(livePosters \|\| \[\]\), \.\.\.withSponsor\]\.map/.test(source);
  const ordered = (source) => /const live = \(livePosters \|\| \[\]\)\.map\(\(r\) => r\.id\);/.test(source)
    && /return \[\.\.\.withSponsor\.slice\(0, AT\), \.\.\.live, \.\.\.withSponsor\.slice\(AT\)\];/.test(source);
  const check = (yes, label) => yes ? ok(label) : bad(label);
  check(staticOnly(RAILS), "canonical RAILS contains only static posters");
  check(canonical(home), "live poster hook uses the canonical active location");
  check(handoff(home), "home passes static RAILS and synthetic live posters separately");
  check(sharedFeed(hook), "live posters consume the shared bounded event feed");
  check(indexed(menu), "synthetic live posters enter the menu lookup");
  check(ordered(menu), "synthetic live IDs enter the displayed poster order");
  check(!staticOnly([...RAILS, { id: "live-sports" }]), "negative control rejects a live registry ID");
  check(!staticOnly([...RAILS, { id: "renamed", livePosterSrc: "/poster" }]), "negative control rejects renamed live metadata");
  check(!canonical(home.replace("center: railCenter || center, city: locName", "center: otherCenter, city: locName")), "negative control rejects divergent live location");
  check(!handoff(home.replace("rails={RAILS}", "rails={otherRails}")), "negative control rejects a swapped static registry");
  check(!sharedFeed(hook.replace("usePosterEvents({", "useIndependentEvents({")), "negative control rejects an independent poster feed");
  check(!indexed(menu.replace("new Map([...(livePosters || []), ...withSponsor]", "new Map([...withSponsor]")), "negative control rejects missing live lookup entries");
  check(!ordered(menu.replace("...withSponsor.slice(0, AT), ...live, ...withSponsor.slice(AT)", "...withSponsor")), "negative control rejects missing live menu entries");
}

// 2. No second Ticketmaster fetcher added BY THIS LANE. The Discovery API
// host legitimately already appears in two pre-existing files --
// app/api/events/route.js (the search) and lib/eventResolve.js (the
// existing cold-load by-id re-resolve path, unrelated to this lane,
// untouched by it) -- so the law isn't "exactly one file in the whole
// repo," it's "no file this lane ADDED calls Ticketmaster directly."
{
  let out = "";
  try { out = execSync(`grep -rln "app.ticketmaster.com/discovery" app lib --include="*.js"`, { cwd: root, encoding: "utf8" }); } catch { out = ""; }
  const hits = out.split("\n").filter(Boolean);
  const newFiles = new Set(
    git("status --porcelain").split("\n")
      .filter((l) => l.trim().startsWith("??"))
      .map((l) => l.replace("??", "").trim())
  );
  const newOffenders = hits.filter((f) => newFiles.has(f));
  if (newOffenders.length === 0) {
    ok(`no new file added by this lane calls Ticketmaster directly (existing callers: ${hits.join(", ")})`);
  } else {
    bad("a new file added by this lane calls Ticketmaster's API directly", newOffenders.join(", "));
  }
}

// 3. sharp must never be imported by anything that ships to the client --
// only server-only files (lib/posterImageFit.js and app/api/**/route.js)
// may import it.
{
  let out = "";
  try { out = execSync(`grep -rln "from \\"sharp\\"" app lib --include="*.js"`, { cwd: root, encoding: "utf8" }); } catch { out = ""; }
  const hits = out.split("\n").filter(Boolean);
  const allowed = new Set(["lib/posterImageFit.js"]);
  const bad_ones = hits.filter((f) => !allowed.has(f) && !f.startsWith("app/api/"));
  if (bad_ones.length === 0) {
    ok(`sharp is only imported server-side (${hits.join(", ") || "none found"})`);
  } else {
    bad("sharp imported outside a server-only file", bad_ones.join(", "));
  }
  // An IMPORT, not a mention. A client component may name posterImageFit.js
  // in a comment explaining where the fitting happens (DaypartRail.js does);
  // what must never happen is a client bundle actually pulling it in, because
  // it imports sharp.
  const clientFiles = globSync("app/components/**/*.js", { cwd: root });
  const leaks = [];
  for (const f of clientFiles) {
    const text = readFileSync(f, "utf8");
    if (!/^"use client"/.test(text)) continue;
    const code = text.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*")).join("\n");
    if (/(?:import[^;]*from\s*["'][^"']*posterImageFit\.js["']|require\(\s*["'][^"']*posterImageFit\.js["']\s*\))/.test(code)) leaks.push(f);
  }
  if (leaks.length) bad("a client component imports lib/posterImageFit.js directly", leaks.join(", "));
}

// 4. No new event/poster database table. Any new file under
// supabase/migrations/ must be flagged, unapplied, and explained -- never
// silently created.
{
  const untracked = git("status --porcelain -- supabase/migrations")
    .split("\n").filter((l) => l.trim().startsWith("??"));
  if (untracked.length === 0) {
    ok("no new Supabase migration file was created");
  } else {
    bad("an unexpected new migration file exists", untracked.join(", "));
  }
}

// 5. The type-to-bucket mapping (lib/liveEventPosterTypes.js) must be
// exactly sports (concerts removed 2026-10-06, locked), mapped onto the real, pre-existing
// event bucket this whole feature depends on -- nothing invented, nothing
// silently added later without this guard catching it.
{
  const cfgPath = "lib/liveEventPosterTypes.js";
  if (existsSync(cfgPath)) {
    const text = readFileSync(cfgPath, "utf8");
    const types = [...text.matchAll(/^\s*(\w+):\s*Object\.freeze/gm)].map((x) => x[1]).sort();
    const modes = [...text.matchAll(/mode:\s*"([\w-]+)"/g)].map((x) => x[1]).sort();
    const bucketKeys = [...text.matchAll(/bucketKey:\s*"([\w-]+)"/g)].map((x) => x[1]).sort();
    const typesOk = JSON.stringify(types) === JSON.stringify(["sports"]);
    const modesOk = JSON.stringify(modes) === JSON.stringify(["summer-sports"]);
    const bucketsOk = JSON.stringify(bucketKeys) === JSON.stringify(["sports"]);
    if (typesOk && modesOk && bucketsOk) {
      ok("exactly one live-poster type exists (sports); no concert live poster");
    } else {
      bad("live-poster type/mode/bucket mapping does not match the approved shape", `types=${types} modes=${modes} buckets=${bucketKeys}`);
    }
  } else {
    bad("lib/liveEventPosterTypes.js is missing");
  }
}

// 6. Metadata passthrough discipline: lib/eventPoster.js must not CALL
// anything that could let it re-derive a destination URL. Comment-only
// mentions (documenting WHY the passthrough matters) don't count -- only
// actual code lines are scanned here.
{
  const codeLines = readFileSync("lib/eventPoster.js", "utf8")
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  const bans = [/resolveDestination\s*\(/, /affiliates\.js/, /fetch\s*\(\s*["'`]https?:\/\/[^"'`]*ticketmaster/i];
  const hit = bans.find((rx) => rx.test(codeLines));
  if (!hit) ok("lib/eventPoster.js never re-derives a destination, it only passes through what it was given");
  else bad("lib/eventPoster.js appears to re-derive event metadata instead of passing it through", String(hit));
}

// 7. Neither poster type may run its own location lookup. center/city must
// be the only source of location -- no navigator.geolocation, no internal
// default, nothing that could quietly diverge from Wayfind's own location
// selector (app/home.js: center + locName).
{
  const files = ["app/components/LiveEventPoster.js", "lib/liveEventPosterTypes.js", "app/components/usePosterEvents.js", "app/components/useLivePosterTiles.js"];
  const offenders = [];
  for (const f of files) {
    if (!existsSync(f)) continue;
    const text = readFileSync(f, "utf8");
    if (/navigator\.geolocation|getCurrentPosition/.test(text)) offenders.push(f);
  }
  if (offenders.length === 0) {
    ok("no live-poster file performs its own geolocation lookup");
  } else {
    bad("a live-poster file runs its own location lookup instead of using the canonical center/city", offenders.join(", "));
  }
}

console.log("");
if (fail.length) {
  console.log(`check-live-event-poster-laws: ${fail.length} law(s) broken`);
  process.exit(1);
}
console.log("check-live-event-poster-laws: all laws hold");

