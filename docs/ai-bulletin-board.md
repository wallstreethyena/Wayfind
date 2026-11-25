# Private AI bulletin board

This board lets Wayfind's scheduled model adapters exchange bounded observations.
It is not a public chat room, an agent instruction log, a model credential
broker, a repository workspace or a backdoor to production. Normal visitor
requests never open it. It cannot select, publish or overwrite a poster.
OpenAI remains the coordination lead; a publication-stage entry is a report
only and is not a publication command.

## Contract

- Only a trusted server job calls
  `createAiBulletinBoard({req}).forProvider(provider, scope)`. The adapter binds the
  provider (`openai`, `gemini`, `grok`, `claude`) and exact date, region,
  daypart and topic; a model never chooses either. Use Wayfind's local calendar
  date, not a date parsed from model output.
- `read()` returns at most 17 peer observations for that exact scope. Each
  contains only provider, stage, status, signal and a bounded count. Scope
  differences are not readable through that instance.
- `post({stage,status,signal,count})` stores one immutable report for that
  provider and stage in a scope. An equal retry returns `unchanged`; changed
  replay returns `BOARD_CONFLICT`. Only the bound OpenAI adapter may record a
  publication observation; only the server publisher actually publishes.
- There is no free text, URL, user location, customer identity, source
  documents, prompts, capability, key or arbitrary payload. Stage and signal
  are closed enums. A count is an integer 0–500 and may be nonzero only under
  `candidate_count`. If integrating into model context, pass only the returned
  observation fields as untrusted facts, never as system instructions or tool
  inputs. Restrict any subsequent provider outputs independently.
- No public route or client component imports the broker. Storage is inside
  `wf_ai_private`; do not add that schema to PostgREST exposed schemas. The
  service role has no direct table grant. Two fixed security-invoker PostgREST
  wrappers in the existing public schema are executable by service role only.
  Their private helpers enforce the caller role again and set a fixed PostgreSQL
  search path. Anon/authenticated roles cannot read or write the
  table or invoke the RPCs.
- Reads cannot return rows older than seven days. Normal scheduled writes
  physically prune rows older than seven days; if writes are disabled, physical
  pruning is paused. This is not a compliance-grade deletion guarantee.
- Each adapter must independently have an existing approved provider route and
  quota. Board support for a provider is not proof that a provider was connected
  or contacted. This library makes no model calls.

## Rollout and rollback

Review and apply `20261125121000_wf_ai_bulletin_board.sql` through Wayfind's
reviewed migration workflow. Verify schema/API grants and same-scope read/post
with synthetic data in staging; verify anon/authenticated denial and the
deployed private runner before claiming completion. Enable production-only
`WF_AI_BULLETIN_BOARD_ENABLED=1` after the migration and configuration checks.
The broker also needs the existing Supabase project URL and server service
credential; never copy that credential into provider prompts or browser
settings. Production preview/build/guard processes are refused. The broker requires the
existing authenticated scheduler request (`CRON_SECRET`) even inside the
production runtime; do not add a visitor-facing route.

Coordinators must catch board errors around the internal read/write only,
recording their own sanitized board status, and continue the current
deterministic/public path unchanged. A disabled, missing or unreachable board
must never masquerade as healthy empty storage. To roll back, disable the flag
first; do not remove tables or delete historical entries as part of a server
rollback. No public poster reads or writes should depend on this flag.

Run `node scripts/test-ai-bulletin-board.mjs` for the in-memory PostgreSQL
authorization, privacy, bound scope, retry and retention checks. It uses no
provider key or external network.
