# Postmortem — the revenue-path audit of 2026-08-25

Five findings from one audit (PostHog + Vercel errors + Supabase + code on
`origin/main`), each with the lesson that makes it a class, not an incident.
The condensed rules live in CLAUDE.md ("Lessons — 2026-08-25 revenue audit");
this file is the evidence and reasoning behind them.

## 1. The env-gated crash: code CI can never execute

**What happened.** The FREE MODE spend-gate added
`return NextResponse.json({ skipped: ... })` to five routes that never import
`NextResponse`. Nothing failed — the gate branch was dead code until
`WAYFIND_GATE` flipped. The moment free mode went live (deploy of 14:12 UTC,
2026-08-25), every fire of atlas-build, scout, inventory-refresh and
promote-index threw `ReferenceError` and the whole content pipeline was down
behind a fresh, green deploy. `city/unlock` carried the same latent bug.

**Why every layer missed it.** The build compiles the file but does not
execute the branch; the guard suite tests behavior, and the behavior only
exists under an env value CI never sets. A crash that lives on one side of an
env flag is invisible to every dynamic check.

**The fix class.** Check the SOURCE, not the behavior:
`scripts/check-response-imports.mjs` fails any build where a route references
`NextResponse` without importing it (81 routes scanned). The routes themselves
now use plain `Response.json`, the file-local convention.

**Lesson.** When a change adds a new branch behind an env flag, either CI
exercises both sides of the flag or a static guard proves the branch can
execute. "It builds" proves nothing about a branch that didn't run.

## 2. The 579-call billing failure: deterministic errors must not retry

**What happened.** Anthropic credits ran out on 2026-08-14. atlas-build called
the API 579 more times over 8 days, every call returning the same 400
("credit balance is too low"), each one also burning a paid Places Details
call and a page fetch to feed a model that could not answer. job-watch existed
(built after the *previous* 5-day silent outage) but treats all dead runs the
same, so detection waited on the generic threshold while the failure was
knowable from call #1.

**The fix class.** `lib/providerHealth.js`: classify billing/quota refusals
(and deliberately NOT transient rate limits), halt the batch on the first one,
trip a 30-minute cross-run breaker, and stamp the pulse note with a
`billing:`/`quota:` prefix that `classifyHealth` escalates to an incident
after ONE dead run.

**Lessons.**
- Distinguish deterministic failures (billing, quota, revoked key — retrying
  cannot help; a human must act) from transient ones (rate limit, timeout —
  retrying is correct). They need opposite handling, and any pipeline that
  treats them the same either hammers a dead provider or pages on blips.
- A provider account that can run dry needs auto-reload or a balance alarm.
  The code-side breaker limits the blast radius; only billing hygiene prevents
  the outage.

## 3. The unattributed fallback: a degraded redirect must still be paid

**What happened.** `/api/viator/go` with a missing query 302'd users to bare
`https://www.viator.com` — a click a user already made, handed to the partner
with no pid. Separately, `/api/eats/go` reported its attributed search
fallback as `provider_redirect_failed`, which made the "failure rate" read
47% in a week when almost every one of those clicks landed attributed — a
number no alert threshold could ever be set against.

**The fix class.** Every fallback rung keeps attribution (city search → 
pid-carrying homepage; store → attributed search), and redirect events carry
`resolver_path` so degraded-but-attributed is measurable separately from
failed. `provider_redirect_failed` now means exactly "this handoff could not
be attributed."

**Lessons.**
- In a redirect ladder, every rung down still carries the affiliate ID. An
  unattributed destination is never an acceptable fallback — hide the CTA
  before shipping a free click.
- Metrics must separate "degraded" from "failed," or the failure alert is
  permanently mistuned and gets ignored (the boy-who-cried-wolf failure mode).

## 4. The build-time env inlining trap (second occurrence)

**What happened.** The Detail sheet's "Order delivery" rung built its link
from `NEXT_PUBLIC_UBEREATS_TEMPLATE` — inlined at build. Unset at build time →
`uberEatsUrl()` returned null → the primary CTA silently degraded to an
unmonetized "See menu." (restaurant, menu) 37 + (restaurant, delivery) 33
were August's two largest `primary_cta_null` buckets. The codebase had already
learned this lesson once — `/api/viator/go` and `/api/eats/go` read env via
bracket access at runtime for exactly this reason — but the CLIENT-side
builder didn't.

**The fix class.** Commercial links route through our own `/api/*/go`
resolver routes (new `Aff.uberEatsGoUrl`), where the template is read at
runtime, the destination is resolved server-side, and the click emits
`provider_redirect_*`. The client only ever links to our own route.

**Lessons.**
- A monetized href built client-side from a `NEXT_PUBLIC_*` template is a
  latent leak twice over: it bakes out if the env lands after the build, and
  it emits no server-side event. Prefer the `/api/*/go` pattern for every
  commercial destination.
- When a bug is fixed in one place, grep for the pattern's siblings — the
  runtime-vs-bake-time lesson was already written down in two route files
  while the client builder still had the bug.

## 5. The invisible SEO layer + the open backup tables

**What happened (SEO).** The curated events layer (`wf_events`, ~83 rows, the
highest-intent seasonal pages the site has) was never added to
`app/sitemap.js`. Organic search was 4.6% of traffic while 70% rode paid
social. Content that isn't in the sitemap might as well not exist.

**What happened (security).** Three `*_backup_20260820` tables were created
during an August cleanup with RLS disabled — readable and writable by anyone
holding the public anon key. Fixed live on 2026-08-25 (`ENABLE ROW LEVEL
SECURITY`, verified). They should still be dropped once confirmed unreferenced.

**Lessons.**
- New public content surface → sitemap + schema in the SAME change, or it
  ships invisible. (Follow-up: `isEventIndexable()` + Event JSON-LD.)
- Ad-hoc backup tables inherit NO RLS. Create them with
  `enable row level security` in the same statement, or make them, use them,
  and drop them inside one session. The Supabase advisor list is the check;
  it only helps if something reads it — which the audit did, six days late.

## The meta-lesson

Every one of these was invisible from inside the site and obvious from the
telemetry: the crash was in Vercel's error groups, the billing 400s were 579
rows deep, the failed redirects and null CTAs were PostHog events, the open
tables were in the advisor output. The audit found them in one afternoon
because it started from the instruments, not the code. Run the instrument
sweep (errors → money events → advisors) on a schedule, not after the revenue
dips.
