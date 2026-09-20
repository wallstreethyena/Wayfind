# Wayfind native trend research v1

Owner-authorized first release: self-generated research, not a paid-provider clone.
The existing daily `/api/cron/trend-signals` schedule remains in `vercel.json`.
It now creates its own private snapshots without an Exploding Topics CSV.

## Inputs and limits

* Google Trending Now US RSS. Controlled concept aliases only; real publication
  timestamps; at most 48 hours old. Bucketed traffic is a level, NOT a growth rate.
* Wikipedia: Pickleball, Matcha, Food hall, Pilates, Ramen and Sauna. Six broad
  research proxies, not proof of a specific venue's offerings or local demand.
  Fourteen complete daily pageview observations, two days of publication lag,
  two equal seven-day windows, minimum 100 views in each window for growth.
  Requests are spaced one second apart; a 403/429 stops the remaining requests.
* First-party activity: distinct confirmed accounts per known venue and window.
  Scope is the existing APPROVED_METROS registry. Owners/internal users and known
  internal devices, anonymous/unconfirmed users, flagged bots/tests/previews are
  excluded. This is NOT all visitor traffic or a measurement of local residents.
  Only fresh, operational, reviewed Florida inventory is eligible for research.
  At least five distinct accounts in both windows are required for a growth rate.
  Missing metadata is not evidence that every bot has been identified.

All public requests are keyless and host-pinned. No provider subscriptions,
Places searches, proxy services, model calls or billing setup are added. Existing
hosting/database resources are used; their plan capacity is not unlimited.
Each request times out after at most five seconds; the run has a 50-second
transport deadline. A capped source is explicitly degraded, not a complete sample.

## Persistence and scoring

The existing `trendMomentumScore`, configuration and taxonomy are reused.
Native records use `source_mode=wayfind_native_v1` in `wf_trend_snapshots` and
`wf_trend_topics`. No new tables, migrations or public grants are required.
Every native topic is `eligible=false`: research does not publish, change venue
scores, create place matches, reorder rails or trigger metered discovery.
Provider evidence and counts remain private; raw account identifiers, emails,
raw search text and credentials are not persisted in research records.

The evidence gate caps level-only, flat or falling data below Getting noticed.
A single measured growing source cannot become On the rise or Taking off.
Missing histories and tiny/zero baselines never manufacture percentage growth.
Source geography remains attached. National search and global article readership
are not relabeled as a city trend.

Snapshots are content-addressed by source facts/configuration/day, not the moving
freshness clock. Validating snapshots are finalized only after topic read-back.
A failed write stays failed. Repeated identical evidence is reused; a five-minute
expired write lease can be reclaimed by compare-and-swap. Research observations
expire after three days. Existing place refresh and photo clocks are untouched.
`trend-maintenance` checks the native collector; explicitly configured legacy CSV
installations retain the original maintenance implementation until a native
snapshot exists. That legacy file is copied byte-for-byte, not rewritten.

## Operations and acceptance

Use the owner-only **Native trends collection** workflow on main to run the same
engine once with the repository's existing database secrets. It prints aggregate
source outcomes and snapshot ID, never keys. Missing credentials are a red run.
This operator run is not represented as a Vercel cron invocation. Daily collection
is performed by the existing authenticated Vercel schedule. Unauthorized requests
must return 401 without touching a data source.

The registered `check-trend-sources` guard runs the native pure/fault tests, then
production binding tests, then every unchanged assertion in the original source
contract. Full repository guards and Vercel builds remain release gates.

After release verify: exact merged/deployed revision; collector source outcomes;
real non-synthetic native rows; topic count/readback; eligible=false for every row;
no credential/user identifiers in raw evidence; repeat-run deduplication. A ready
build alone is not proof of a successful collection.

## Not part of v1

Google BigQuery DMA authentication, GDELT, unrestricted keyword discovery, public
trend dashboards, place boosts, publishing and revenue attribution are not wired.
The private dataset can support a later reviewed interface. Do not advertise a
local trend, predictor, paid-provider equivalent or complete source coverage.

Primary source documentation:
https://support.google.com/trends/answer/3076011
https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/reference/page-views.html
https://supabase.com/docs/reference/javascript/auth-admin-listusers
