# Meta attribution reporting (PostHog + Supabase)

How to answer "what did a dated Meta ad cohort actually do?" without overclaiming. Companion to `docs/META_PIXEL.md`.
All queries are read only. Replace the date window in each query (`:from`, `:to` below are literal timestamps, UTC).

## What each stage proves (and does not)

| stage | event | proves | does NOT prove |
|---|---|---|---|
| landing visit | `$pageview` with `wf_sess_utm_*` super properties | a browser loaded a Wayfind page from that ad | the visitor is human or unique |
| partner tap | `commerce_cta_clicked` (client) | a button press (may die with the same-tab navigation, so it undercounts) | that anything was resolved |
| valid redirect | `provider_redirect_started`, `traffic_class = 'human'`, not test | Wayfind resolved a partner destination and issued a redirect | the partner page loaded, a booking, a commission |
| consent-eligible CAPI attempt | `meta_capi_result` with `outcome` in (`accepted`, `failed`) | the consent gate allowed a send and an attempt ran | Meta accepted it |
| Meta-accepted event | `meta_capi_result` with `outcome = 'accepted'` | Graph returned `events_received >= 1` | that Meta matched it to a user or used it |

`meta_capi_result` is personless and carries only safe fields (`outcome`, `reason`, `lane`, `provider`, `surface`, `http_status`,
`events_received`, `fbtrace_id`, `attempts`, `consent_basis`, `ldu`). It has NO campaign / ad set / ad labels, so the last two stages
split by `provider` and `consent_basis`, not by campaign. `outcome = 'skipped'` rows (consent basis `policy_blocked`, `gpc_opt_out`,
`consent_denied`, `unknown_region`, `non_us`) exist only when a Meta token is configured. With the default `blocked` policy the expected
result is zero `accepted` rows. Test lane rows have `lane = 'qa'`: always exclude them from business numbers.

## 1. Dated cohort funnel (PostHog HogQL)

Replace the timestamps. Meta ads carry `utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}`.
The landing events read them from the session super properties (`wf_sess_utm_*`); the server redirect and the client tap read them as `landing_*`.

```sql
-- Stage counts for the cohort, split by campaign / ad set / ad where present.
WITH
  toDateTime('2026-11-16 00:00:00') AS t_from,
  toDateTime('2026-11-23 00:00:00') AS t_to
SELECT stage, campaign_id, adset_id, ad_id, events, uniq_clicks_or_people FROM (
  SELECT '1_landing_visits' AS stage,
         properties.wf_sess_utm_campaign AS campaign_id,
         properties.wf_sess_utm_term     AS adset_id,
         properties.wf_sess_utm_content  AS ad_id,
         count() AS events,
         uniq(distinct_id) AS uniq_clicks_or_people
  FROM events
  WHERE event = '$pageview' AND timestamp >= t_from AND timestamp < t_to
    AND (properties.wf_sess_utm_source IN ('meta','facebook','fb','instagram','ig') OR properties.wf_sess_utm_medium = 'paid_social')
    AND coalesce(toString(properties.is_test), '') != 'true'
  GROUP BY campaign_id, adset_id, ad_id
  UNION ALL
  SELECT '2_partner_taps', properties.landing_campaign, properties.landing_term, properties.landing_content,
         count(), uniq(properties.click_id)
  FROM events
  WHERE event = 'commerce_cta_clicked' AND timestamp >= t_from AND timestamp < t_to
    AND (properties.landing_click_type = 'fbclid' OR properties.landing_source IN ('meta','facebook','fb','instagram','ig'))
    AND coalesce(toString(properties.is_test), '') != 'true'
  GROUP BY properties.landing_campaign, properties.landing_term, properties.landing_content
  UNION ALL
  SELECT '3_valid_redirects', properties.landing_campaign, properties.landing_term, properties.landing_content,
         count(), uniq(properties.click_id)
  FROM events
  WHERE event = 'provider_redirect_started' AND timestamp >= t_from AND timestamp < t_to
    AND properties.traffic_class = 'human'
    AND coalesce(toString(properties.is_test), '') != 'true'
    AND coalesce(toString(properties.wf_test), '') = ''
    AND (properties.landing_click_type = 'fbclid' OR properties.landing_source IN ('meta','facebook','fb','instagram','ig'))
  GROUP BY properties.landing_campaign, properties.landing_term, properties.landing_content
)
ORDER BY stage, events DESC
```

Consent-eligible attempts and Meta-accepted events (cohort total, split by provider; no campaign labels exist on these rows):

```sql
SELECT properties.provider AS provider,
       properties.consent_basis AS consent_basis,
       countIf(properties.outcome IN ('accepted','failed'))                      AS attempts,
       countIf(properties.outcome = 'accepted')                                   AS meta_accepted,
       countIf(properties.outcome = 'failed')                                     AS failed,
       countIf(properties.outcome = 'skipped')                                    AS consent_skipped
FROM events
WHERE event = 'meta_capi_result'
  AND timestamp >= toDateTime('2026-11-16 00:00:00') AND timestamp < toDateTime('2026-11-23 00:00:00')
  AND properties.lane = 'live'
GROUP BY provider, consent_basis
ORDER BY attempts DESC
```

Failure reasons (`timeout`, `network`, `http_<status>`, `graph_error_<code>`, `zero_received`, `bad_json`):

```sql
SELECT properties.reason AS reason, count() AS n, any(properties.fbtrace_id) AS sample_fbtrace_id
FROM events
WHERE event = 'meta_capi_result' AND properties.outcome = 'failed' AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY reason ORDER BY n DESC
```

Reading it: stage 3 divided by stage 2 is NOT a conversion rate (taps undercount; redirects always fire). Compare stages 1 and 3 for
reach. Redirect-event ad labels are present only when the visitor landed with the `wf_attr` session cookie; a blank `ad_id` is "unknown",
not "organic".

## 2. Viator bookings by ad (Supabase SQL, read only)

Real tables: `wf_viator_clicks` (one row per outbound click; `session_attribution` jsonb keeps `utm_campaign`, `utm_term`, `utm_content`,
never the fbclid value) and `wf_viator_bookings` (ONE row per `booking_ref`, latest state, maintained from the immutable
`wf_viator_booking_events` history; `matched_click_token` links to the click). Use `wf_viator_bookings`, not the events table: the events
table holds one row per confirmation, amendment and cancellation, so joining it double counts a booking.

```sql
SELECT
  c.session_attribution->>'utm_campaign' AS campaign_id,
  c.session_attribution->>'utm_term'     AS adset_id,
  c.session_attribution->>'utm_content'  AS ad_id,
  count(*)                               AS bookings,                 -- one row per booking, cancelled excluded
  count(b.estimated_commission)          AS bookings_with_estimate,
  count(b.confirmed_commission)          AS bookings_with_confirmed,
  count(b.paid_commission)               AS bookings_with_paid,
  sum(b.estimated_commission)            AS estimated_commission,     -- NULL stays NULL: sum ignores unknowns, see the counts above
  sum(b.confirmed_commission)            AS confirmed_commission,
  sum(b.paid_commission)                 AS paid_commission,
  count(*) FILTER (WHERE b.estimated_commission IS NULL AND b.confirmed_commission IS NULL AND b.paid_commission IS NULL) AS commission_unknown,
  min(b.currency) AS currency_min, max(b.currency) AS currency_max       -- if these differ, do not add across currencies
FROM public.wf_viator_bookings b
JOIN public.wf_viator_clicks c ON c.click_token = b.matched_click_token
WHERE b.attribution_status = 'matched'
  AND b.status NOT IN ('cancelled', 'rejected')
  AND c.clicked_at >= timestamptz '2026-11-16 00:00:00+00' AND c.clicked_at < timestamptz '2026-11-23 00:00:00+00'
  AND (lower(c.session_attribution->>'utm_source') IN ('meta','facebook','fb','instagram','ig')
       OR lower(c.session_attribution->>'utm_medium') = 'paid_social')
GROUP BY 1, 2, 3
ORDER BY confirmed_commission DESC NULLS LAST, estimated_commission DESC NULLS LAST;
```

Rules this query keeps:

- One row per booking and the latest state (`wf_viator_bookings`), so amendments are not extra bookings. Cancelled and rejected bookings are excluded.
- Estimated, confirmed and paid commission are three separate columns. Never merge them into one revenue number, and never use
  `gross_booking_value` as commission (it is customer spend).
- An unknown commission stays `NULL`. Do not `coalesce(..., 0)`: that turns "not reported yet" into "earned nothing". The `commission_unknown`
  column counts those bookings explicitly.
- Rows redacted after the retention window (`redacted_at`, `redact_after` 90 days) lose their click link, so old cohorts under-attribute.
- A booking with `attribution_status <> 'matched'` has no ad link and is not in this result by design.

## 3. Other providers

Only Viator has a per-click token that is joined to booking events. Ticketmaster, StubHub, hotels, OpenTable and the other commerce
partners have no per-ad revenue attribution in Wayfind: for them the funnel ends at the valid redirect (`provider_redirect_started`).
Do not infer revenue for them from Meta data, and report their ad performance as handoffs only.
