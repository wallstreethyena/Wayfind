# Daily trend report intake

Replace `latest.json` with the newest Florida report. Keep `schemaVersion` at
`wayfind-daily-trends-v1` and run:

```bash
node scripts/test-daily-trend-intelligence.mjs
```

Each item must identify its evidence type. A related query score is not search
volume. A published rank is not current velocity. An event needs exact start
and end dates. An unmeasured phrase stays held.

The report feeds the owner only Command Center. It cannot change a displayed
Wayfind Score, publish a card, or start a Google Places request. Leads reach the
public product only after the existing geography, freshness, editorial, event,
and CTA checks pass.
