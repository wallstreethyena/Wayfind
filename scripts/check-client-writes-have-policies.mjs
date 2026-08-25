#!/usr/bin/env node
/**
 * scripts/check-client-writes-have-policies.mjs — A WRITE THE POLICY FORBIDS
 * DOES NOT THROW. IT SUCCEEDS QUIETLY AND CHANGES NOTHING.
 *
 * THE TWO BUGS THIS COMES FROM (both found 2026-08-25, both live for weeks):
 *
 *   1. NOBODY COULD DELETE THEIR OWN COMMENT. Detail.js fires
 *        supabase.from("comments").delete().eq("user_id", user.id)...
 *      and `comments` had SELECT, INSERT and UPDATE policies — and no DELETE
 *      policy. RLS removed zero rows, PostgREST answered 204 OK, and the
 *      `.then(() => {}, () => {})` handler saw nothing wrong. Every user who
 *      tried to remove a comment watched it stay.
 *
 *   2. SIGNED-IN USERS COULD NOT JOIN THE WAITLIST. wf_waitlist_insert was
 *      scoped to {anon}, but CityGate.notify() and home.js both run in the
 *      browser for signed-in visitors too. CityGate catches the refusal and
 *      sets phase "listed" anyway — the visitor is told *you're on the list*
 *      while the row is rejected. wf_waitlist is the demand signal behind
 *      wf_expansion_demand, so each refusal was a lost email AND a lost vote on
 *      which metro gets built next.
 *
 * NEITHER IS A SECURITY FINDING. Supabase's advisor will never report them, and
 * it should not — the database is behaving exactly as configured. The defect is
 * that the CODE and the POLICY disagree, and nothing in this repo compared them.
 *
 * THE RULE. For every write the browser client attempts, a policy must permit
 * that command for the role that will actually be executing it:
 *
 *   - the call carries the caller's identity (user.id / auth.uid / user_id:)
 *       -> it can only run signed in            -> require `authenticated`
 *   - the call carries no identity
 *       -> it runs for whoever is looking       -> require BOTH anon AND authenticated
 *
 * Rule 2 is the one that catches wf_waitlist: an anon-only policy is not enough
 * for a form that signed-in people can also fill in.
 *
 * THE CONTRACT is lib/policySnapshot.json — effective client permissions pulled
 * from production (grant AND policy), refreshed by scripts/sync-policy-snapshot.mjs.
 * This guard stays hermetic: it reads a committed file, never a live credential,
 * so its verdict is a function of the repo and not of the shell it ran in.
 *
 * KNOWN LIMIT, stated rather than hidden: the snapshot models role x command,
 * not the policy PREDICATE. A policy naming `public` whose WITH CHECK requires
 * auth.uid() shows here as anon-permitted even though anon can never satisfy it.
 * That direction is a false PASS, never a false fail — the predicate half is
 * checked against the live database by wf_schema_audit() and /api/cron/schema-watch.
 *
 * If you are here because this guard failed: the fix is a policy migration, or
 * gating the call behind a signed-in user. Do not delete the assertion — the
 * write it names is already failing silently in production.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const fails = [];
const fail = (m) => fails.push(m);

const snap = JSON.parse(readFileSync(path.join(ROOT, "lib/policySnapshot.json"), "utf8"));
const TABLES = snap.tables || {};

// The browser client is bound to the identifier `supabase` (lib/supabase.js).
// Server paths use sbEnv()/service-role fetches and a different identifier, so
// this pattern selects exactly the calls that run with the publishable key.
const CALL = /\bsupabase\s*\.\s*from\(\s*["']([a-z0-9_]+)["']\s*\)/g;
const WRITE_OPS = { insert: ["INSERT"], upsert: ["INSERT", "UPDATE"], update: ["UPDATE"], delete: ["DELETE"] };

// How far past the .from() line to look for the operation and the identity
// signal. Long enough to cover a multi-line argument object, short enough that
// it cannot reach an unrelated statement below.
const WINDOW = 8;
// Every form this codebase actually uses to carry the caller's identity into a
// write. Kept EXPLICIT rather than a loose /user/ — a broad match would mark the
// wf_waitlist class of bug as "gated" and stop catching it, which is the one
// thing this guard exists to do.
const IDENTITY = /\buser\s*&&|&&\s*user\b|\buser\.id\b|\buser\.email\b|\buserId\b|["']user_id["']|user_id\s*:|auth\.uid\(\)/;

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e === ".git" || e === ".worktrees") continue;
    const p = path.join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(js|jsx|mjs)$/.test(e)) out.push(p);
  }
  return out;
}

const files = [
  ...walk(path.join(ROOT, "app")),
  ...walk(path.join(ROOT, "lib")),
];

let checked = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  if (!src.includes("supabase.from(")) continue;
  const lines = src.split("\n");

  for (let i = 0; i < lines.length; i++) {
    CALL.lastIndex = 0;
    let m;
    while ((m = CALL.exec(lines[i]))) {
      const table = m[1];
      const stmt = lines.slice(i, i + WINDOW).join("\n");
      // Everything after .from(...) on this line, plus the window — the op has
      // to appear in the chain, not in a later unrelated statement.
      const chain = lines[i].slice(m.index + m[0].length) + "\n" + lines.slice(i + 1, i + WINDOW).join("\n");

      for (const [op, cmds] of Object.entries(WRITE_OPS)) {
        if (!new RegExp(`^[^\\n]*\\.\\s*${op}\\s*\\(`).test(chain.split("\n")[0]) &&
            !new RegExp(`\\.\\s*${op}\\s*\\(`).test(chain.split("\n")[0])) continue;
        checked++;

        const gated = IDENTITY.test(stmt);
        const required = gated ? ["authenticated"] : ["anon", "authenticated"];
        const where = `${path.relative(ROOT, file)}:${i + 1}`;

        const perms = TABLES[table];
        if (!perms) {
          fail(`${where} — the browser writes ${op}() to \`${table}\`, which lib/policySnapshot.json does not know about. Either the table is new (refresh the snapshot with scripts/sync-policy-snapshot.mjs) or the write goes nowhere.`);
          continue;
        }
        for (const role of required) {
          const held = perms[role] || [];
          const missing = cmds.filter((c) => !held.includes(c));
          if (missing.length) {
            fail(
              `${where} — the browser calls .${op}() on \`${table}\`, but no policy grants ${role} ${missing.join(" + ")}.` +
              (gated
                ? " The call carries the caller's identity, so it runs as `authenticated`."
                : " The call carries no identity, so it runs for signed-out AND signed-in visitors — an anon-only policy is not enough (this is the exact shape of the wf_waitlist bug).") +
              " RLS will refuse it silently: 0 rows, no error."
            );
          }
        }
      }
    }
  }
}

if (!checked) {
  fail("found ZERO client writes to check — the detection pattern has stopped matching the codebase, so this guard is passing by looking at nothing");
}

if (fails.length) {
  console.error("check-client-writes-have-policies: FAIL");
  for (const f of fails) console.error("  - " + f);
  process.exit(1);
}
console.log(`check-client-writes-have-policies: OK — all ${checked} browser writes have a policy that permits them for the role that will run them`);
