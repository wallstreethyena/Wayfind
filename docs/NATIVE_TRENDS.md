# Wayfind native trend research v1

This release fills the existing private research engine without an Exploding Topics
CSV or paid provider. It is a self-feeding backend, not a public trends dashboard.

## Source scope

Google Trending Now US RSS is a broad-interest lead. Its bucketed traffic is a
level, not a measured growth rate. Controlled aliases and real publication dates
are required. Missing, future or older-than-two-day dates are rejected.

Wikipedia pageviews cover six declared research proxies: Pickleball, Matcha,
Food hall, Pilates, Ramen and Sauna. Each requires fourteen complete daily values,
with two days of publication lag and two equal seven-day windows. At least 100
views in both windows are required for growth. An article is not a specific
venue and its readership is global, not evidence of local search demand.

Wayfind activity counts distinct confirmed accounts per known venue, not raw
clicks or all visitors. Existing approved metros are reused. Internal accounts,
known internal devices, anonymous/unconfirmed accounts, and flagged bots, tests
and previews are excluded. Only fresh, operational, reviewed Florida inventory
is considered. Growth needs at least five distinct accounts in each window.
Missing telemetry metadata does not prove every bot or preview was excluded.
A venue's metro is not the visitor's location. No raw search text is collected.

## Safety and integrity

Public hosts are allowlisted and receive no credentials. Requests have five-second
timeouts, a 50-second run transport deadline and a streaming two-MiB body cap.
Six encyclopedia requests are spaced one second apart. A 403/429 stops that
source with no retries. Source caps produce explicit degradation, not misleading
complete coverage: 200 identities, 1,000 activity rows and 200 venue candidates.

The existing Trend Momentum Score and configuration are reused. A separate
evidence ceiling prevents level-only, flat or falling data from becoming growth.
One measured growing source cannot receive On the rise or Taking off. Duplicate
keywords from one provider are not independent corroboration. Missing data stays
absent and zero/tiny baselines never manufacture percentage growth.

Native snapshots use source_mode=wayfind_native_v1. Every native topic has
eligible=false. Nothing changes venue scores, rail ordering, public labels,
place matches, publication, affiliate routing or metered discovery. Raw source
geography and evidence stay attached privately. No account identifiers, device
identifiers, emails or credentials are stored in topic evidence or logs.

Snapshots are content-addressed by evidence/configuration/UTC day, not the moving
freshness clock. Topic writes are read back before finalization. Repeated identical
evidence is reused. Failed writes remain failed; expired validating leases can
be reclaimed by compare-and-swap. A different evidence set is a different snapshot.
Private observations expire after three days. Maintenance deletes only expired
rows carrying this native version marker, including copied venue names. Existing
inventory refresh, photo clocks, legacy source records and public content remain
untouched. No schema changes or public table grants are introduced.

## Operations

The existing daily Vercel trend-signals and trend-maintenance schedules are reused.
Both require a Bearer CRON_SECRET and reject unauthorized requests before work.
Native operation needs the existing database service configuration and one active
score configuration. Installations explicitly setting EXPLODING_TOPICS_IMPORT_CADENCE
retain their original CSV handlers. Legacy cadence and search-budget validation
still occur before the legacy maintenance dispatcher is invoked.

The owner-only Native trends collection workflow can execute the same production
engine once on main using the repository's existing database secrets. Its output
identifies execution=operator and the exact revision. This is not represented as
a Vercel cron invocation. No new recurring workflow or provider subscription is
added. Existing hosting and database resources remain subject to plan limits.

The registered check-trend-sources guard runs native fault/privacy/persistence
checks, a real production-binding integration check and every unchanged original
source assertion. Repository-wide guards and the hosted build are release gates.
After release verify actual source outcomes, native database rows, the deployed
revision, non-public eligibility, and repeat-run behavior. A green build alone
does not establish that collection succeeded.

## Not implemented in v1

Google BigQuery DMA authentication, GDELT, unrestricted keyword discovery,
public trend dashboards, local trend claims, forecasting, rail boosts and
automatic publication are not part of this release.

Primary documentation:
https://support.google.com/trends/answer/3076011
https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/reference/page-views.html
https://supabase.com/docs/reference/javascript/auth-admin-listusers
