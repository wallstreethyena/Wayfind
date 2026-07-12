# Share metrics (List Engine, Part 4)

Virality is not a plan. **Share rate is the one number to move.** If `share_rate`
is under **2% of sessions**, the content is not shareable and no menu change will
fix it. That number, not traffic, is the target.

## The three ratios

| Metric | Definition | Source events |
|---|---|---|
| `share_rate` | shares / sessions | `share` / `session` |
| `open_rate` | clicks on a shared card / shares | `share_open` / `share` |
| `return_rate` | shared-card visitors back within 7 days / shared-card visitors | `share_return` / distinct devices with `share_open` |

**Benchmark:** `share_rate >= 0.02`.

## Where the events come from

All four land in the Supabase `events` table (and PostHog) via `logEvent`:

- **`share`** — already fired at every share action (list/hook/app). No new code.
- **`share_open`** — already fired when the app boots from a shared link. No new code.
- **`session`** — new. Fired once per tab session (`lib/shareMetrics.js` `markSessionStart`, `sessionStorage`-guarded), tagged `ref: "share" | "direct"`. This is the `share_rate` denominator.
- **`share_return`** — new. When a device that opened a shared card is back in a later session (>6h later, within 7 days), fired once (`checkShareReturn`, `localStorage`-guarded).

The `session` and `share_return` gaps are the only new instrumentation; `share`
and `share_open` were already in place, so `open_rate` was already computable.

## Reading it

```
GET /api/metrics/share?days=30
# if CRON_SECRET or METRICS_SECRET is set, add ?key=<secret>
```

Returns aggregate counts + the three ratios + `meets_benchmark`. Read-only,
aggregate only (no PII). Example:

```json
{ "ok": true, "window_days": 30, "sessions": 4200, "shares": 96,
  "opens": 61, "shareVisitors": 55, "returns": 12,
  "share_rate": 0.0229, "open_rate": 0.635, "return_rate": 0.218,
  "benchmark": 0.02, "meets_benchmark": true }
```

## Before / after

Instrument first, then judge each List Engine surface (the hook, the withheld
#1, the staleness banner) by whether it moves `share_rate` — not by whether it
looks good.
