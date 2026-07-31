# Wayfind Money Funnel Dashboard

**Owner:** Kim (money funnel lane)  
**Purpose:** One place to see whether revenue changes actually moved the number.

---

## The four panels

1. **Clicks by provider** — `commerce_cta_clicked` grouped by `provider`
2. **Redirects started** — `provider_redirect_started` grouped by `provider`
3. **Redirects failed** — `provider_redirect_failed` grouped by `provider` and `failure_reason`
4. **Revenue attributed** — `provider_postback_received` / `booking_confirmed` (future, gated on postback infra)

---

## Panel 1: Clicks by provider

**Event:** `commerce_cta_clicked`  
**Breakdown:** `provider`  
**Why:** Tells us which partner CTAs users tap before they leave our origin.

**SQL:**
```sql
SELECT
  properties.provider,
  count(DISTINCT person_id) as users,
  count(*) as clicks
FROM events
WHERE timestamp >= now() - INTERVAL 14 DAY
  AND event = 'commerce_cta_clicked'
  AND person_id != '688c2392-cba4-5693-9453-0294627a05e3'
GROUP BY properties.provider
ORDER BY clicks DESC
```

---

## Panel 2: Redirects started

**Event:** `provider_redirect_started`  
**Breakdown:** `provider`  
**Why:** Proves the server handoff happened. A click without a started redirect is a dead link.

**SQL:**
```sql
SELECT
  properties.provider,
  count(DISTINCT distinct_id) as users,
  count(*) as redirects
FROM events
WHERE timestamp >= now() - INTERVAL 14 DAY
  AND event = 'provider_redirect_started'
  AND person_id != '688c2392-cba4-5693-9453-0294627a05e3'
GROUP BY properties.provider
ORDER BY redirects DESC
```

---

## Panel 3: Redirects failed

**Event:** `provider_redirect_failed`  
**Breakdown:** `provider`, `failure_reason`  
**Why:** Shows where the handoff breaks. A high failure rate for a provider means a config or data problem.

**SQL:**
```sql
SELECT
  properties.provider,
  properties.failure_reason,
  count(*) as failures
FROM events
WHERE timestamp >= now() - INTERVAL 14 DAY
  AND event = 'provider_redirect_failed'
  AND person_id != '688c2392-cba4-5693-9453-0294627a05e3'
GROUP BY properties.provider, properties.failure_reason
ORDER BY failures DESC
```

---

## Panel 4: Revenue attributed

**Status:** Future infra. No server-side postback or booking confirmation exists today.

**Planned events:**
- `provider_postback_received` — partner calls back with conversion + click_id
- `booking_confirmed` — user returns to Wayfind with confirmation signal

**Why:** This is the only panel that turns redirects into dollars. Without it, the dashboard measures handoffs, not revenue.

**Blocking work:**
- Receive and verify partner postbacks (CJ, Impact, Travelpayouts)
- Store click_id → session mapping securely
- Idempotent ingestion to avoid double-counting

---

## Conversion funnel

```
commerce_impression
    ↓
commerce_cta_clicked
    ↓
provider_redirect_started
    ↓
provider_postback_received  (future)
    ↓
booking_confirmed           (future)
```

**Key ratio:** `provider_redirect_started` / `commerce_cta_clicked`  
Target: >90%. Below that means clicks are dying before the partner handoff.

---

## Known gaps

- **Legacy routes now instrumented:** `/api/viator/go` and `/api/eats/go` now emit server-side events. `/api/commerce/go` already did.
- **Postback revenue not yet captured:** Panels 1–3 are live; Panel 4 is not.
- **Server-side events use the public PostHog key.** If `NEXT_PUBLIC_POSTHOG_KEY` is absent, capture returns false silently.

---

## Guard

`scripts/check-provider-redirects.mjs` runs in prebuild and verifies that all three redirect routes emit `provider_redirect_started` or `provider_redirect_failed`.
