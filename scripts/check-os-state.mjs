// scripts/check-os-state.mjs — THE OS DOCS CANNOT QUIETLY GO STALE.
//
// WHAT HAPPENED (2026-08-25). The OS docs stated live figures as prose:
// "12,664 places", "240 editorials written", "407 CI guards". By the time a
// human read them the real numbers were 12,717 / 2,469 / 419, and there was no
// way to tell fresh from rotten — the doc looked exactly as confident either
// way. The same day, an agent DESCRIBED an OS doc it had never written, and a
// whole standup blocked on a file that did not exist. One family of bug: a
// claim with no link back to the thing that makes it true.
//
// THE CONTRACT ENFORCED HERE:
//   1. The number-bearing OS docs carry a GENERATED live block, not typed prose.
//   2. That block is well-formed and stamped with the instant it was read.
//   3. The metrics the generator owns NEVER appear as prose outside the block —
//      otherwise the two copies drift and the reader cannot tell which is real.
//
// WHY STRUCTURE FAILS BUT AGE ONLY WARNS. On 2026-08-25 a red prebuild blocked
// every deploy — including a live outage fix — for an unrelated reason. A doc
// growing old must never be able to do that. So: malformed / missing / typed
// numbers are DETERMINISTIC violations and fail the build; mere age warns loudly
// and only fails once the doc is abandoned (45d), which is never an emergency.
//
// HERMETIC BY CONSTRUCTION: reads files under docs/os/ and nothing else. No
// network, no ambient env, no credentials — see check-guard-hermeticity for why
// a guard that reads the shell answers differently in a clean terminal.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const OS_DIR = join(ROOT, "docs", "os");
const BEGIN = "<!-- WF-LIVE-STATE:BEGIN";
const END = "<!-- WF-LIVE-STATE:END -->";
const WARN_DAYS = 21;
const FAIL_DAYS = 45;
// The docs that MUST carry the block, because they state live state.
const MUST_HAVE = ["wayfind-OS-START-HERE.md", "wayfind-OS-1-EXECUTIVE-STATE.md"];

let pass = 0;
const fail = (m) => { console.error("check-os-state: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const warns = [];

ok(existsSync(OS_DIR), "docs/os/ is missing — the OS docs must live in the repo so CI can guard them (they were loose in ~/Projects and unguardable)");
const files = readdirSync(OS_DIR).filter((f) => f.endsWith(".md"));
ok(files.length > 0, "docs/os/ contains no markdown");

for (const m of MUST_HAVE) {
  ok(files.includes(m), `docs/os/${m} is missing — it is the front door and must exist IN THE REPO, not only in a chat or a project doc`);
}

// The metrics scripts/os-state.mjs owns. Stating any of these as prose is the
// exact decay this guard exists to stop, so the pattern is refused OUTSIDE the
// generated block. Point at the block instead of restating its numbers.
const OWNED_METRIC_PROSE = [
  [/\b\d{1,3},\d{3}\s*(?:\+\s*)?(?:owned\s+)?(?:rows|places|inventory\s+rows)\b/i, "an inventory row/place count"],
  [/\b\d{2,4}\s*(?:CI\s+)?guards\b/i, "a CI guard count"],
  [/\b\d{1,3},?\d{0,3}\s*(?:owned\s+)?(?:editorials?|descriptions)\b/i, "an owned-editorial count"],
  [/\b(?:photos|text_pro|details_enterprise|details_pro|nearby_pro)\b[^\n]{0,40}?\d+\s*\/\s*\d+/i, "a spend-ledger fraction"],
];

for (const f of files) {
  const src = readFileSync(join(OS_DIR, f), "utf8");
  const b = src.indexOf(BEGIN);
  const e = src.indexOf(END);

  if (MUST_HAVE.includes(f)) {
    ok(b !== -1, `docs/os/${f} has no live-state block — run: node scripts/os-state.mjs --write --mirror`);
    ok(e !== -1 && e > b, `docs/os/${f} has a malformed live-state block (BEGIN without a matching END)`);
    const header = src.slice(b, src.indexOf("-->", b));
    const stamp = (header.match(/generated=(\S+)/) || [])[1];
    ok(!!stamp, `docs/os/${f} live block carries no generated= timestamp — an unstamped number is indistinguishable from a stale one`);
    const t = Date.parse(stamp);
    ok(Number.isFinite(t), `docs/os/${f} generated= is not a parsable ISO timestamp (got "${stamp}")`);
    const ageDays = (Date.now() - t) / 86400000;
    ok(ageDays > -1, `docs/os/${f} is stamped in the FUTURE (${stamp}) — a clock or a hand-edit is wrong`);
    if (ageDays > FAIL_DAYS) {
      fail(`docs/os/${f} live state is ${Math.round(ageDays)} days old (abandoned past ${FAIL_DAYS}d). Run: node scripts/os-state.mjs --write --mirror`);
    } else if (ageDays > WARN_DAYS) {
      warns.push(`${f} live state is ${Math.round(ageDays)} days old — regenerate soon (node scripts/os-state.mjs --write --mirror)`);
    }
  }

  // Outside-the-block prose check, on every OS doc.
  const outside = (b === -1 ? src : src.slice(0, b) + src.slice(e === -1 ? src.length : e + END.length));
  for (const line of outside.split("\n")) {
    const l = line.trim();
    if (!l || l.startsWith(">") || l.startsWith("<!--")) continue; // provenance notes and comments may quote history
    if (/\b(?:was|were|is now|drifted|said|stale|corrected|historical|20\d\d-\d\d-\d\d)\b/i.test(l)) continue; // an incident record may cite the old number on purpose
    for (const [rx, what] of OWNED_METRIC_PROSE) {
      if (rx.test(l)) {
        fail(`docs/os/${f} states ${what} as prose outside the generated block:\n    ${l.slice(0, 160)}\n  Numbers the generator owns must not be typed twice — they drift. Point at the LIVE STATE block instead.`);
      }
    }
  }
  pass++;
}

// The generator must exist and must not be able to spend money.
const gen = join(ROOT, "scripts", "os-state.mjs");
ok(existsSync(gen), "scripts/os-state.mjs is missing — the block has no generator and would have to be hand-typed again");
const gsrc = readFileSync(gen, "utf8");
ok(!/googleapis\.com|places:searchText|GOOGLE_MAPS_SERVER_KEY/.test(gsrc),
  "scripts/os-state.mjs must never touch a metered Google endpoint — it reads Supabase and local files only");
ok(/WF-LIVE-STATE:BEGIN/.test(gsrc), "scripts/os-state.mjs no longer emits the block delimiter this guard reads");

for (const w of warns) console.warn(`check-os-state: WARN — ${w}`);
console.log(`check-os-state: OK — ${pass} assertions (${files.length} OS docs in-repo; live numbers generated + stamped, never typed)`);
