// scripts/test-atlas-retry.mjs — locks the retry path's four rules.
//
// 515 rows failed for a cause that no longer exists (an Anthropic key whose
// value in Vercel never matched any live key). They are legitimate retry
// candidates. What makes a retry SAFE rather than a money furnace is that it
// bounds, converges, and does not re-derive answers the classifier gives free.
import { readFileSync } from "fs";
let pass = 0;
const fail = (m) => { console.error("test-atlas-retry: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const mig = read("supabase/migrations/20260729_wf_atlas_retryable.sql");
const route = read("app/api/cron/atlas-build/route.js");

// ── rule 1+2: only rows that survived reclassification ────────────────────
ok(/e\.issues\[1\] = 'PENDING SOURCE'/.test(mig),
  "only PENDING SOURCE is eligible — RIDE-LEVEL, BLOCKED §7, chain-generic, category-mismatch and possible-duplicate are excluded BY LABEL");
for (const excluded of ["RIDE-LEVEL", "BLOCKED", "chain-generic", "category-mismatch"])
  ok(!new RegExp(`issues\\[1\\] = '${excluded}`).test(mig), `${excluded} can never enter the retry set`);
ok(/i\.status = 'OPERATIONAL'/.test(mig), "rule 4: closed places are not retried");

// ── rule 3: it must BOUND and CONVERGE ────────────────────────────────────
ok(/e\.attempt_count < 2/.test(mig), "rule 3a: attempt_count < 2");
ok(/last_attempted_at is null/.test(mig) && /interval '7 days'/.test(mig), "rule 3b: the 7-day cooldown");
// The waiver is the one judgement call here and it must be a FIXED timestamp,
// never a flag — a flag gets reused for the next incident without anyone
// deciding to.
ok(/timestamptz '2026-07-29 18:00:00\+00'/.test(mig),
  "the cooldown waiver is a fixed timestamp dated to the confirmed fix, not a reusable flag");
ok(/cause-fixed waiver/i.test(mig), "the waiver says what it is for");

// ── rule 4: value first ───────────────────────────────────────────────────
ok(/order by coalesce\(nullif\(i\.signals->>'reviews',''\)::int, 0\) desc/.test(mig),
  "rule 4: ordered by reviews desc — the 1,000+ review rows are where the value is");
ok(/least\(coalesce\(p_limit, 10\), 50\)/.test(mig), "the selector is capped server-side regardless of what the caller asks for");

// ── the write must actually WRITE ─────────────────────────────────────────
// This is the trap: the existing path posts with resolution=ignore-duplicates,
// which against an already-existing row is a silent no-op. A retry built on it
// would report success and change nothing — the same shape as the outage.
ok(/if \(retryMode\)/.test(route), "the route branches its write path on retry mode");
ok(/wf_editorial_record_attempt/.test(route), "retry mode UPDATEs via the RPC rather than inserting");
ok(/ignore-duplicates[\s\S]{0,400}?\} else \{|\} else \{[\s\S]{0,400}?ignore-duplicates/.test(route),
  "the insert-with-ignore-duplicates path is the NON-retry branch — using it for retry would be a silent no-op");
ok(/attempt_count     = attempt_count \+ 1/.test(read("supabase/migrations/20260729_wf_atlas_retryable.sql")),
  "every retry increments attempt_count — a retry that failed is still an attempt, and not counting it makes a bounded retry unbounded");
ok(/last_attempted_at = now\(\)/.test(mig), "every retry stamps last_attempted_at, so the cooldown means something");

// ── the two jobs must be separately visible ───────────────────────────────
ok(/recordPulse\(retryMode \? "atlas-retry" : "atlas-build"/.test(route),
  "retry pulses under its OWN job name — a healthy atlas-build must not mask a dead atlas-retry in the spend-watch");
ok((route.match(/recordPulse\(retryMode/g) || []).length >= 2, "both the completion and idle paths distinguish the job");
ok(/mode: retryMode \? "retry" : "build"/.test(route), "the response says which mode ran");

// ── it reuses the machinery, it does not fork it ──────────────────────────
ok(/isDeniedHost\(hostOfUrl\(d\.websiteUri\)\)/.test(route), "the §7 gate is shared with the build path, not duplicated");
ok(/verifyAtlasEditorial/.test(route), "the honesty verifier is shared");
ok(/isInsidePark/.test(route), "the in-park geofence is shared");

console.log(`test-atlas-retry: OK — ${pass} assertions (four rules, fixed-timestamp waiver, the write is an UPDATE not a silent no-op, retry is separately visible to the spend-watch)`);
