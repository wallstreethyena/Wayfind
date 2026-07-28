// scripts/check-no-disney-sources.mjs — enforces AGENTS.md §7 in the build.
//
// §7: "No scraping, polling, or automated requests against
// disneyworld.disney.go.com, the My Disney Experience app, or any Disney
// reservation endpoint. Google Places is the only source of identifiers."
//
// Why this file exists: on 2026-07-28 an agent rendered five Disney park pages
// in a browser and wrote five Atlas editorial cards from the returned DOM, then
// pushed them. Nothing caught it — §7 was enforced only by an agent remembering
// to read AGENTS.md, and that agent had not read it. The cards never merged, but
// the failure mode is the point: a standing product constraint that lives only
// in a document is enforced by memory, which is not enforcement.
//
// THE DISTINCTION THIS GUARD ENCODES — read before "fixing" a failure here.
//
//   PROHIBITED: taking CONTENT from a Disney reservation domain. Two shapes:
//     (a) an editorial card / fixture whose sourceUrls cites one, i.e. the prose
//         was written from what that domain returned;
//     (b) code that fetches or navigates one — fetch(), axios, page.goto(),
//         navigate(), a cron hitting it on a schedule.
//
//   ALLOWED: handing the USER an outbound link to it. app/components/curatedData.js
//     links to disneyworld.disney.go.com/calendars/ so a visitor can check today's
//     showtimes at the official source. That is a hyperlink, not an automated
//     request — it is good product behaviour and §7 does not touch it.
//
// If this guard fails, the fix is to remove the SOURCING, never to delete a
// curated outbound link to get green (AGENTS.md §5).
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = "scripts/check-no-disney-sources.mjs";

let pass = 0;
const problems = [];
const ok = () => pass++;

// Disney-owned reservation / planning surfaces named or implied by §7.
const DISNEY_HOST =
  /(disneyworld\.disney\.go\.com|disneyland\.disney\.go\.com|disney\.go\.com|mydisneyexperience|my\s?disney\s?experience|disneysprings\.com)/i;

// Files that legitimately DESCRIBE the constraint rather than violate it.
const DESCRIBES_RULE = new Set([SELF, "AGENTS.md", "CLAUDE.md", "docs/editorial-standard.md"]);

const SKIP_DIR = new Set(["node_modules", ".git", ".next", "out", "coverage", ".vercel", ".worktrees", "tmp"]);
function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    if (SKIP_DIR.has(e)) continue;
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(js|mjs|jsx|ts|tsx|json)$/.test(e)) acc.push(p);
  }
  return acc;
}

const files = walk(ROOT);
ok();

// ── (a) editorial content SOURCED from a Disney domain ────────────────────
// Any JSON carrying sourceUrls (the Atlas card set, and any fixture shaped like
// it) must not cite one. sourceUrls means "this prose was written from here".
for (const p of files.filter((f) => f.endsWith(".json"))) {
  const rel = relative(ROOT, p);
  if (DESCRIBES_RULE.has(rel)) continue;
  let data;
  try { data = JSON.parse(readFileSync(p, "utf8")); } catch { continue; }
  const rows = Array.isArray(data) ? data : [data];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const urls = row.sourceUrls || row.source_urls;
    if (!Array.isArray(urls)) continue;
    for (const u of urls) {
      if (DISNEY_HOST.test(String(u))) {
        problems.push(`${rel}: "${row.name || row.placeId || "?"}" is sourced from a Disney reservation domain (${u})`);
      }
    }
  }
}
ok();

// Same rule for a fact cited inside an editorial row.
for (const p of files.filter((f) => f.endsWith(".json"))) {
  const rel = relative(ROOT, p);
  if (DESCRIBES_RULE.has(rel)) continue;
  let data;
  try { data = JSON.parse(readFileSync(p, "utf8")); } catch { continue; }
  for (const row of (Array.isArray(data) ? data : [data])) {
    if (!row || typeof row !== "object" || !Array.isArray(row.facts)) continue;
    for (const f of row.facts) {
      if (f && typeof f.source === "string" && DISNEY_HOST.test(f.source)) {
        problems.push(`${rel}: "${row.name || "?"}" cites a Disney reservation domain as a fact source (${f.source})`);
      }
    }
  }
}
ok();

// ── (b) code that REQUESTS a Disney domain ────────────────────────────────
// A hyperlink handed to the user is fine; a request our code makes is not.
// Match the request verbs, not the bare hostname.
const REQUESTS = [
  /\bfetch\s*\(\s*[`"'][^`"']*DISNEY/i,
  /\baxios[.\w]*\s*\(\s*[`"'][^`"']*DISNEY/i,
  /\b(?:page|browser|tab)\s*\.\s*goto\s*\(\s*[`"'][^`"']*DISNEY/i,
  /\bnavigate\s*\(\s*\{[^}]*url\s*:\s*[`"'][^`"']*DISNEY/i,
  /\brequest\s*\(\s*[`"'][^`"']*DISNEY/i,
];
for (const p of files.filter((f) => /\.(js|mjs|jsx|ts|tsx)$/.test(f))) {
  const rel = relative(ROOT, p);
  if (DESCRIBES_RULE.has(rel)) continue;
  const src = readFileSync(p, "utf8");
  if (!DISNEY_HOST.test(src)) continue;
  for (const rx of REQUESTS) {
    // Keep the alternation GROUPED. Splicing in the bare `a|b|c` makes the whole
    // pattern a top-level alternation, so it matches a bare hostname anywhere —
    // which flagged curatedData.js's user-facing calendar links on the first run.
    const probe = new RegExp(rx.source.replace("DISNEY", `(?:${DISNEY_HOST.source.slice(1, -1)})`), "i");
    const m = src.match(probe);
    if (m) problems.push(`${rel}: code makes an automated request to a Disney reservation domain — ${m[0].slice(0, 90)}`);
  }
}
ok();

// ── self-test: the guard must actually catch the shape it exists for ──────
// A guard that cannot fail is decoration. Prove both directions in-process.
{
  const violating = { name: "Magic Kingdom Park", sourceUrls: ["https://disneyworld.disney.go.com/destinations/magic-kingdom/"] };
  const allowed = { name: "Fireworks note", url: "https://disneyworld.disney.go.com/calendars/", label: "Today's park schedule" };
  const hits = (row) => Array.isArray(row.sourceUrls) && row.sourceUrls.some((u) => DISNEY_HOST.test(u));
  if (!hits(violating)) { console.error("check-no-disney-sources: FAIL — self-test: a Disney-sourced card was NOT detected"); process.exit(1); }
  if (hits(allowed)) { console.error("check-no-disney-sources: FAIL — self-test: a curated outbound link was wrongly flagged"); process.exit(1); }
  pass += 2;

  // The request-detection probes must fire on a real fetch and stay silent on a
  // curated link. The first version of this guard failed that second half.
  const build = (rx) => new RegExp(rx.source.replace("DISNEY", `(?:${DISNEY_HOST.source.slice(1, -1)})`), "i");
  const FETCHES = `await fetch("https://disneyworld.disney.go.com/destinations/epcot/")`;
  const LINKS = `{ text: "check the calendar", url: "https://disneyworld.disney.go.com/calendars/", label: "Park schedule" }`;
  if (!REQUESTS.some((rx) => build(rx).test(FETCHES))) {
    console.error("check-no-disney-sources: FAIL — self-test: an actual fetch() was NOT detected"); process.exit(1);
  }
  if (REQUESTS.some((rx) => build(rx).test(LINKS))) {
    console.error("check-no-disney-sources: FAIL — self-test: a curated `url:` link was misread as a request"); process.exit(1);
  }
  pass += 2;
}

if (problems.length) {
  console.error("check-no-disney-sources: FAIL — AGENTS.md §7 (no automated requests to Disney reservation domains)\n");
  for (const p of problems) console.error("  " + p);
  console.error("\n  Remove the SOURCING. Do NOT delete a curated outbound link to get green (AGENTS.md §5).");
  console.error("  Disney parks have no lawful automated source: their own domain is prohibited here, and");
  console.error("  Google Places supplies identifiers, not editorial detail. Those cards are hand-written or absent.");
  process.exit(1);
}

console.log(`check-no-disney-sources: OK — ${pass} checks, ${files.length} files scanned (sourcing blocked, curated outbound links preserved)`);
