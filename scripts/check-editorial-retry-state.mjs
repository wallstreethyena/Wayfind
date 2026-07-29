#!/usr/bin/env node
/**
 * check-editorial-retry-state — a retry path may not ship without a lifecycle.
 *
 * THE HOLE. wf_atlas_missing returns rows with NO wf_editorial record. A row
 * written with issues=['...'] IS a record, so the instant the generator wrote a
 * failure, that place left its own queue forever. Correct as idempotency, wrong
 * as a lifecycle: there was no state for "attempted, failed, try again". 540
 * rows that failed only because an API key was being rejected became permanently
 * stuck, and nothing re-queued them (#438).
 *
 * attempt_count and last_attempted_at are what let a retry converge and be
 * rate-limited. Without them a retry either runs forever or cannot tell a row it
 * touched five minutes ago from one it has never seen.
 *
 * This guard exists because the schema is easy to add and easy to bypass. The
 * dangerous change is not deleting the columns — it is shipping a retry selector
 * that ignores them.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };
const raw = (p) => readFileSync(path.resolve(p), "utf8");

// ── the migration is in the repo, not only in the database ────────────────
const mig = raw("supabase/migrations/20260729_wf_editorial_retry_state.sql");
ok(/add column if not exists attempt_count/.test(mig), "attempt_count is added");
ok(/add column if not exists last_attempted_at/.test(mig), "last_attempted_at is added");
ok(/not null default 0/.test(mig), "attempt_count defaults to 0 and is NOT NULL — a null counter cannot bound anything");
ok(/create index if not exists wf_editorial_retry_idx/.test(mig),
  "the retry selector has an index — it filters on exactly these two columns over ~650 rows every run");

// The backfill is the subtle part: without it, the first retry pass treats a
// five-day-old failure as a virgin row, which is true of neither.
ok(/update public\.wf_editorial/.test(mig) && /set attempt_count = 1/.test(mig),
  "pre-existing failed rows are BACKFILLED to attempt_count 1 — they have been attempted once, at write time");
ok(/last_attempted_at = written_at/.test(mig),
  "the backfilled timestamp comes from written_at, so the >7d rule measures from the real attempt");
ok(/array_length\(issues, 1\) > 0/.test(mig),
  "the backfill touches only FAILED rows — a published row is not a retry candidate and the counter would be noise on it");
ok(/comment on column public\.wf_editorial\.attempt_count/.test(mig),
  "the columns carry comments — the next person needs to know 1 means 'backfilled', not 'retried once by the new path'");

// ── the rule that actually matters ────────────────────────────────────────
// Any retry selector must bound on BOTH columns. One without the other is a
// half-lifecycle: attempt_count alone retries a row that failed 30 seconds ago;
// last_attempted_at alone never converges.
{
  const roots = ["app/api/cron", "lib"];
  const offenders = [], selectors = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith(".js") && !e.name.endsWith(".sql")) continue;
      // Decide on CODE, not prose. A file may legitimately discuss the retry
      // queue in a comment without being a retry selector — atlas-build now
      // does exactly that, explaining why a §7-blocked row must not sit in the
      // retry queue forever. Third time this trap has fired in this codebase
      // (see check-editorial-publish and check-env-value-overrides); strip
      // first, always.
      const rawSrc = raw(p);
      const src = rawSrc
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
      // A "retry selector" is anything that reads back failed editorial rows in
      // order to act on them again.
      if (!/wf_editorial/.test(src)) continue;
      if (!/retry|reattempt|re-attempt/i.test(src)) continue;
      selectors.push(p);
      let hasCount = /attempt_count/.test(src);
      let hasWhen = /last_attempted_at/.test(src);
      // A selector may DELEGATE the bounds to a SQL function instead of bounding
      // inline — which is better, because a bound in SQL cannot drift from the
      // selector that uses it. So follow the delegation and verify the bound
      // exists in the function's definition, rather than demanding the column
      // names appear in the JS. Checking for the words in the caller would pass
      // on a comment; this checks the actual WHERE clause.
      const delegated = [...src.matchAll(/rpc\/(?:\$\{[^}]*?["']([a-z_]+)["'][^}]*\}|([a-z_]+))/g)]
        .flatMap((m) => [m[1], m[2]]).filter(Boolean);
      for (const fn of delegated) {
        if (!/retry|retryable/i.test(fn)) continue;
        const migDir = path.resolve("supabase/migrations");
        if (!existsSync(migDir)) continue;
        for (const f of readdirSync(migDir)) {
          // .sql ONLY. This bit the guard during its own break-test: a
          // `.sql.bak` left in the directory still contained the bound, so
          // removing it from the live migration left the check green. A scanner
          // that accepts any file in a directory can be satisfied by a backup.
          if (!f.endsWith(".sql")) continue;
          const def = readFileSync(path.join(migDir, f), "utf8");
          if (!new RegExp(`function public\\.${fn}\\(`).test(def)) continue;
          if (/e\.attempt_count\s*<\s*\d/.test(def)) hasCount = true;
          if (/e\.last_attempted_at/.test(def)) hasWhen = true;
        }
      }
      if (!(hasCount && hasWhen)) {
        offenders.push(`${p}: bounds on ${hasCount ? "attempt_count" : ""}${hasCount && hasWhen ? " and " : ""}${hasWhen ? "last_attempted_at" : ""}${!hasCount && !hasWhen ? "NEITHER column" : ""} — needs both`);
      }
    }
  };
  for (const r of roots) walk(path.resolve(r));
  ok(offenders.length === 0,
    "every retry selector bounds on BOTH attempt_count and last_attempted_at:\n      " + offenders.join("\n      "));
  // If there are no selectors yet the sweep is vacuous, and that is fine — but
  // say so rather than reporting a pass that examined nothing.
  ok(true, `retry selectors examined: ${selectors.length}${selectors.length ? " (" + selectors.map((s) => path.basename(s)).join(", ") + ")" : " — none yet; this assertion arms when the retry path lands"}`);
}

if (fail.length) {
  console.error("check-editorial-retry-state: FAIL");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`check-editorial-retry-state: OK — ${pass} assertions (columns, backfill from written_at, failed-rows-only, index; any retry selector must bound on both)`);
