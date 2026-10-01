# Testing without polluting analytics

Wayfind records visitor behaviour in two stores. Tests have to respect both.

| store | written by | read by |
|---|---|---|
| PostHog | `lib/browserAnalytics.js` (page visits, clicks, experiment exposures) | Command Center **Visitors** tab, experiment analysis |
| Supabase `public.events` | `app/home.js` `logEvent` / `logEventAnon`, `lib/likeSignal.js`, server `lib/insiderServer.js` | Command Center first-party KPIs (`wf_cc_*` RPCs in `supabase/command-center.sql`) |

Both clients refuse to record automation by design:

- `isKnownBot` in `lib/browserAnalytics.js` skips webdriver and crawler user agents.
- `analyticsSuppressionReason` in `app/home.js` skips the owner, internal devices and bots.
- Both experiments (`lib/experiment.js` `looksAutomated`) keep automation out of either arm.

## Mode 1: ordinary UI testing (the default)

Use `tests/e2e/lib/containment.js` in every browser test that loads a real page:

```js
const { containAnalytics, assertContained } = require("./lib/containment");
const log = await containAnalytics(context);   // before the first navigation
// … drive the page …
assertContained(log, expect);                    // nothing leaked
```

It **fails closed**:

- every non-GET request is aborted (Supabase inserts, beacons, keepalive posts, PostHog batches);
- every analytics or ads host is aborted, GET pixels included;
- every partner redirect (`/api/<partner>/go`, `/api/outbound`) is aborted.

Do not replace it with a hostname blocklist. That is how #1603 happened: PostHog was blocked, but the first-party Supabase insert was not.

A test that must see an experiment arm may override `navigator.webdriver` **inside a contained context only**. Nothing that session does can be recorded. Say so in the test header.

## Mode 2: controlled end-to-end analytics verification

Persistence cannot be proven while every write is blocked. A blocked-write run proves the **payload**, never storage. Proving storage takes one of these:

1. **Owner device, real session (preferred).** The owner taps the flow on a phone from a non-internal device and notes the time. The verifier then reads that session back read-only:
   - PostHog by session id;
   - Supabase `events` by `device_id` (localStorage `wf_device` on that phone).
   
   This is a real visitor, not a synthetic one. It is correct for it to count.
2. **Labelled synthetic events.** Not implemented yet. It would need every row tagged at write time (`device_id` prefixed `synthetic-`, `meta.synthetic = true`; PostHog `wf_synthetic = true`) and the readers excluding that tag (`wf_cc_*` RPCs, `lib/commandCenter/trafficQuality.js`) **before** the first synthetic row is written. Do not write synthetic rows until both exclusions exist and are tested.

Never disguise an automated browser to get past the bot filters **with collection enabled**.

## Auditing a suspected leak (read-only)

Rows in `public.events` carry no user agent. A leak can only be scoped by `device_id` and time.

Candidate test devices are those whose **entire** history fits inside the test window:

```sql
-- read-only; candidates, not proof. Review before excluding anything.
select device_id, min(created_at) first_seen, max(created_at) last_seen,
       count(*) n, array_agg(distinct action) actions, array_agg(distinct place_id) places
from public.events
group by device_id
having min(created_at) >= '2026-09-30T00:00:00Z' and max(created_at) < '2026-10-01T03:00:00Z'
order by first_seen;
```

Exclude confirmed test devices from reports **by `device_id`**. Never delete visitor rows to make a number match.
