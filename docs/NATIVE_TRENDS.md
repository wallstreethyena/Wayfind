# Wayfind native trend research v1

Self-generated private research, not a paid-provider clone. The existing daily
`/api/cron/trend-signals` schedule is unchanged. It creates native snapshots
without a manually imported Exploding Topics CSV.

## Sources and honest limits

Google Trending Now US RSS uses the existing controlled aliases and actual
publication timestamps. Items older than 48 hours are excluded. Bucketed traffic
is a level, not a measured growth rate and not city-level demand.

Wikipedia checks six explicit proxies: Pickleball, Matcha, Food hall, Pilates,
Ramen and Sauna. Each requires 14 complete daily records, with two days of
publication lag, comparing equal seven-day windows. At least 100 views in each
window are required for a growth percentage. These are global English-language
article views, not proof of a Florida venue's offerings or local popularity.
Requests are spaced one second apart; a 403 or 429 stops remaining requests.

First-party research compares distinct confirmed accounts interacting with a
known venue. It excludes anonymous/unconfirmed accounts, owners/internal users,
known internal devices, and flagged tests/bots/previews. The existing approved
metro registry, fresh operational Florida inventory and review gates are reused.
At least five distinct accounts in both windows are required for a growth rate.
This limited sample is not all traffic, visitor residency, or proof that every
bot has been identified. Raw identifiers and account details are not persisted.

## Scoring and persistence

Reuse the existing Trend Momentum Score, active configuration and taxonomy.
Use `source_mode=wayfind_native_v1` in `wf_trend_snapshots` and `wf_trend_topics`.
No schema or access-policy changes are introduced. Every native topic is
`eligible=false`: no public publication, venue scores, place matches, ranking
boosts, rail changes, metered discovery or booking modifications.

Level-only, flat, falling or insufficient-history evidence is capped below
Getting noticed. One measured growing source cannot produce On the rise or
Taking off. Multiple keywords from one provider count as one source. Zero/tiny
baselines never produce infinite growth. Source geography stays explicit.

Snapshots hash source facts, score configuration and UTC day, not a moving
freshness factor. A validating snapshot finalizes only after topic keys/counts
are read back. Failed writes remain failed. Repeated identical evidence reuses
the snapshot; abandoned write leases use compare-and-swap recovery. Topics have
a three-day expires_at. Existing place refresh and photo clocks are untouched.

Private API requests carry credentials only in headers to the configured
Supabase origin. Public requests are keyless and host-pinned. Requests have
five-second limits, a 50-second transport deadline and payload caps. Capped
sources are reported as degraded, never as complete samples. No subscriptions,
Places searches, model calls, proxy services or billing setup are added. Existing
hosting/database capacity is used and is not claimed to be unlimited.

`trend-maintenance` checks native collection freshness when no CSV cadence is
configured. An explicitly configured CSV installation keeps its original cadence,
spending validation, expiry and disabled discovery behavior in the same handler.
Its snapshot selector excludes native rows, so private research cannot displace
a licensed import. Production had no native or imported trend data when prepared.

## Verification and operations

`check-trend-sources.mjs` keeps all its original assertions and token-fixture
lifecycle in the registered file. Native fault/privacy/authentication tests and
real production-binding tests execute before that original contract. No guard
exemption or assertion is removed. The new workflow also runs this focused
contract plus trend-integrity checks on relevant pull requests without database
credentials. Full repo guards and the Vercel build remain release gates.

The Native trends collection workflow runs on relevant main-branch releases,
or by owner-only manual dispatch on main, using existing repository database
secrets. It executes the same runtime as the Vercel cron and immediately proves
that replaying identical real evidence reuses its snapshot. It prints only
aggregate source outcomes and snapshot ID. Missing credentials fail loudly.
This release/operator execution is not a claim that the Vercel cron has run.
The existing Vercel schedule performs daily collection with CRON_SECRET auth.

After release verify the exact merged/deployed revision, real source outcomes,
non-synthetic native rows, eligible=false, absence of raw user identifiers,
source geography, source-count ceilings and repeat-run deduplication. A ready
build alone does not prove that the collector ran.

## Not included in v1

BigQuery DMA authentication, GDELT, unrestricted topic discovery, public trend
dashboards, venue boosts, publishing and revenue attribution are not wired.
This is a bounded private research foundation, not a local trend predictor or a
feature-equivalent replacement for Exploding Topics.

## Primary source documentation

https://support.google.com/trends/answer/3076011
https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/reference/page-views.html
https://supabase.com/docs/reference/javascript/auth-admin-listusers
