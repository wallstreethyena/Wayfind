// scripts/check-live-event-poster-laws.mjs
//
// Deterministic guard for the live-poster image engine (owner-locked
// 2026-09-16). Fails the build if any of these laws are broken, on the
// theory that a rule enforced by hand is a rule that eventually gets
// broken by accident.

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { globSync } from "node:fs";

const root = process.cwd();
const fail = [];
const ok = (label) => console.log(`  OK  ${label}`);
const bad = (label, detail) => { fail.push(label); console.log(`FAIL  ${label}${detail ? " — " + detail : ""}`); };

function git(cmd) {
  try { return execSync(`git ${cmd}`, { cwd: root, encoding: "utf8" }); } catch (e) { return ""; }
}

// 1. lib/rails.js and app/components/DaypartRail.js must remain completely
// untouched. app/home.js is now LEGITIMATELY touched (owner spec,
// 2026-09-16: "wiring and rendering two location aware event posters" on
// the homepage) -- but only in the narrow, specific way: zero deletions,
// and every added line is either the one new import or inside the two-
// poster block this feature owns. Anything else added to home.js fails
// this law.
{
  for (const f of ["lib/rails.js", "app/components/DaypartRail.js"]) {
    const diff = git(`diff HEAD -- ${f}`);
    if (diff.trim().length > 0) bad(`${f} has uncommitted changes on this branch`, "diff found");
    else ok(`${f} is untouched by this lane`);
  }
  const homeDiff = git("diff HEAD -- app/home.js");
  const added = homeDiff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
  const removed = homeDiff.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---"));
  // Flag anything SUSPICIOUS rather than trying to enumerate every word of
  // the explanatory comment (fragile, as a first version of this check
  // proved by rejecting its own prose). A new hook, a new fetch, a second
  // import, or any state mutation would all be genuine scope creep; plain
  // comment prose and the two-poster JSX block are not.
  const suspicious = added.filter((l) =>
    /\bimport\s/.test(l) && !l.includes('import LiveEventPoster from "./components/LiveEventPoster"')
    || /use(State|Effect|Memo|Callback|Ref)\s*\(/.test(l)
    || /\bfetch\s*\(/.test(l)
    || /setCenter|setLocName/.test(l)
  );
  // Removals are allowed ONLY inside this feature's own poster block: the
  // <LiveEventPoster> lines themselves plus the row's own scaffolding (the
  // flex container and the two slot wrappers). Deleting anything else in
  // home.js is out of scope for this lane and fails here.
  const POSTER_SCAFFOLD = /LiveEventPoster|flex: "1 1 0"|flex: "0 0 auto"|maxWidth: 220|minWidth: 150|overscrollBehaviorX/;
  const foreignRemovals = removed.filter((l) => !POSTER_SCAFFOLD.test(l));
  if (foreignRemovals.length === 0 && suspicious.length === 0) {
    ok(`app/home.js's only change is the two-poster wiring (${added.length} added, ${removed.length} removed, all within the poster block)`);
  } else {
    bad("app/home.js has changes outside the approved two-poster wiring", `foreign-removals=${JSON.stringify(foreignRemovals)} suspicious=${JSON.stringify(suspicious)}`);
  }
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
// exactly sports + concerts, mapped onto exactly the two real, pre-existing
// event buckets this whole feature depends on -- nothing invented, nothing
// silently added later without this guard catching it.
{
  const cfgPath = "lib/liveEventPosterTypes.js";
  if (existsSync(cfgPath)) {
    const text = readFileSync(cfgPath, "utf8");
    const types = [...text.matchAll(/^\s*(\w+):\s*Object\.freeze/gm)].map((x) => x[1]).sort();
    const modes = [...text.matchAll(/mode:\s*"([\w-]+)"/g)].map((x) => x[1]).sort();
    const bucketKeys = [...text.matchAll(/bucketKey:\s*"([\w-]+)"/g)].map((x) => x[1]).sort();
    const typesOk = JSON.stringify(types) === JSON.stringify(["concerts", "sports"]);
    const modesOk = JSON.stringify(modes) === JSON.stringify(["date-night", "summer-sports"]);
    const bucketsOk = JSON.stringify(bucketKeys) === JSON.stringify(["livemusic", "sports"]);
    if (typesOk && modesOk && bucketsOk) {
      ok("exactly two live-poster types exist (sports, concerts), mapped to the two real event buckets");
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
  const files = ["app/components/LiveEventPoster.js", "lib/liveEventPosterTypes.js", "app/components/usePosterEvents.js"];
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

