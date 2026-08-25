#!/usr/bin/env node
/**
 * scripts/check-writes-fail-loudly.mjs — A REFUSED WRITE MUST NOT RENDER AS SUCCESS.
 *
 * THE LINE THIS COMES FROM (app/components/CityGate.js, live for weeks):
 *
 *     try {
 *       await supabase.from("wf_waitlist").insert({ email: em, ... });
 *       setPhase("listed");
 *     } catch (e) { setPhase("listed"); }        // <- both paths say "listed"
 *
 * Two independent defects in three lines, and they compound:
 *
 *   1. BOTH PATHS CLAIM SUCCESS. Whatever happened, the visitor is shown
 *      "You're on the list".
 *   2. THE CATCH NEVER FIRES ANYWAY. supabase-js does not THROW on a refused
 *      write — an RLS or permission failure comes back as `{ error }` on a
 *      RESOLVED promise. So try/catch is not merely wrong here, it is inert:
 *      the success path runs for a row that was rejected.
 *
 * While wf_waitlist_insert was scoped to {anon}, every signed-in visitor in an
 * uncovered city typed their email, read "You're on the list", and was never on
 * the list. wf_waitlist is the demand signal behind wf_expansion_demand — so
 * each one cost an email address AND a vote on which metro gets built next.
 *
 * THE RULE, kept deliberately narrow: a catch block may not set the SAME state
 * its try block sets on success. Silence is allowed — this repo has 15
 * fire-and-forget telemetry writes and they are fine, because losing an
 * analytics row misleads nobody. What is forbidden is TELLING THE USER IT
 * WORKED when the code has no idea whether it did.
 *
 * Deliberately NOT "every write must read its error": that would flag those 15
 * legitimate fire-and-forget calls, and a guard that cries wolf on correct code
 * gets weakened until it protects nothing. This one only fires on a false
 * promise to a human.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const fails = [];
const fail = (m) => fails.push(m);

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e === ".git" || e === ".worktrees") continue;
    const p = path.join(dir, e);
    statSync(p).isDirectory() ? walk(p, out) : /\.(js|jsx|mjs)$/.test(e) && out.push(p);
  }
  return out;
}

// A state assignment that makes a claim to the user: setSomething("literal").
const SETTER = /\bset[A-Z][A-Za-z0-9_]*\(\s*["'][^"']+["']\s*\)/g;
const WRITE = /supabase\s*\.\s*(from\([^)]*\)\s*)?[\s\S]{0,80}?\.\s*(insert|upsert|update|delete)\s*\(|supabase\s*\.\s*rpc\s*\(/;
// How far back the enclosing `try {` can reasonably be.
const TRY_LOOKBACK = 30;

let scanned = 0;
for (const file of [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "lib"))]) {
  const src = readFileSync(file, "utf8");
  if (!src.includes("supabase.from(") && !src.includes("supabase.rpc(")) continue;
  const lines = src.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const c = /catch\s*\([^)]*\)\s*\{(.*)$/.exec(lines[i]);
    if (!c) continue;
    const catchBody = c[1] + "\n" + lines.slice(i + 1, i + 3).join("\n");
    const inCatch = catchBody.match(SETTER) || [];
    if (!inCatch.length) continue;

    // The try this catch belongs to: nearest preceding `try {`.
    let tryAt = -1;
    for (let j = i; j >= Math.max(0, i - TRY_LOOKBACK); j--) {
      if (/(^|[^\w])try\s*\{/.test(lines[j])) { tryAt = j; break; }
    }
    if (tryAt < 0) continue;

    // Only the try's SUCCESS CONTINUATION counts: what runs after the write
    // when nothing went wrong. A setter BEFORE the write (or on an else branch)
    // is not a success claim — `setPhase("failed")` in both places is honest
    // code, and flagging it would train everyone to weaken this guard.
    const body = lines.slice(tryAt, i);
    const writeAt = body.findIndex((l) => WRITE.test(l));
    if (writeAt < 0) continue;
    scanned++;
    const successPath = body.slice(writeAt).join("\n");
    const claimed = new Set(successPath.match(SETTER) || []);

    for (const setter of inCatch) {
      if (claimed.has(setter)) {
        fail(
          `${path.relative(ROOT, file)}:${i + 1} — the catch sets \`${setter}\`, and so does the success path after the write. ` +
          `Both outcomes tell the user the same thing, so a refused write reads as success. ` +
          `(And supabase-js does not throw on a refused write — read \`{ error }\` from the result instead.)`
        );
      }
    }
  }
}

// The specific line this guard was built around, pinned so it cannot regress
// quietly back to the shape that shipped.
{
  const gate = readFileSync(path.join(ROOT, "app/components/CityGate.js"), "utf8");
  const ok = (c, m) => { if (!c) fail(m); };
  ok(/const \{ error \} = await supabase\.from\("wf_waitlist"\)\.insert/.test(gate),
    "CityGate.notify() no longer reads `{ error }` from the waitlist insert — supabase-js resolves on a refused write, so without it the success path runs for a row that never landed");
  ok(/setPhase\(error \? "listfailed" : "listed"\)/.test(gate),
    "CityGate.notify() no longer branches on the error — 'You're on the list' must be conditional on the row actually landing");
  ok(/phase === "listfailed"/.test(gate),
    "CityGate has no 'listfailed' branch — a failure state nothing renders is the same as not having one, and the visitor is back to being told it worked");
  ok(/const \{ error \} = await supabase\.from\("wf_city_requests"\)\.insert/.test(gate),
    "CityGate.unlock() no longer reads `{ error }` from the city-request insert — that row is the demand signal, and losing it silently makes a wanted city look unwanted");
}

if (fails.length) {
  console.error("check-writes-fail-loudly: FAIL");
  for (const f of fails) console.error("  - " + f);
  process.exit(1);
}
console.log(`check-writes-fail-loudly: OK — ${scanned} catch blocks around supabase writes, none claims the success the try claims; CityGate reads its errors and can say so`);
