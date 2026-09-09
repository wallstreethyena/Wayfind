# Revenue checker

The health cron requests only host-locked Undercover Tourist merchant URLs,
never CJ tracking links. Redirects are manual, at most three, under one ten-second
deadline; host or product-path changes stop as unknown. Duplicate destinations
share a request. Stored check times limit retries to twelve hours, including
unknown and quarantined rows. Historic false-healthy 403/429 rows are rechecked.

403/429, timeouts, server failures and unresolved redirects are unknown. They do
not increase the failure counter or lift quarantine. 404/410 require two strikes.
A successful page response proves reachability only, not ticket availability,
entity/date accuracy, partner approval, or commission. Structural tracking failure
quarantines the row and fails the job. Database write failures are visible.

## Python revenue extension

From tools/python, with the existing locked environment:

```
uv run --locked wayfind-audit revenue-collect --out private/revenue.json
uv run --locked wayfind-audit revenue-report --input private/revenue.json --out reports/revenue-run
```

Collection uses WAYFIND_AUDIT_DATABASE_URL and one repeatable-read, read-only
transaction. The role needs complete SELECT visibility on wf_inventory, wf_events,
wf_experiences, wf_deals, wf_affiliate_coverage, wf_affiliate_opportunities.
No credentials are created or changed. Fixed keyset queries use 1,000-row pages,
independent counts, unique IDs, terminal-page proof, timeouts and a row ceiling.
No dynamic place-product join or affiliate request runs. A failed census never
writes a successful partial snapshot.

The existing Python workflow now runs an independent revenue job on its daily
schedule, manual dispatch and relevant main pushes. It reuses the canary's
SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY with `--transport rest`: GET-only,
fixed project/table allowlist, redirects refused before credentials can leave the
database origin, exact response counts and keyset pages. This is multi-request
consistency and fails if observed counts drift. No new credentials are created.
Missing credentials fail loudly, without silently skipping the money check.
Revenue artifact retention is fourteen days. Reports distinguish complete inventory enumeration from incomplete
rendered-card eligibility, preserve all candidate evidence, and report unavailable
traffic, pending/approved/paid commission and actual costs as unknown.

No automated money estimate or seven-day lift is inferred. Compare only successful
accessible reports with equivalent scopes and separately supplied partner statements.

## Release dependencies

Opportunity counters belong to existing PR #1191, not this implementation. Its
database RPC was found installed with service-only execute access on September 9.
Review and ship that existing PR rather than duplicating its migration/caller.

Jollywood Nights and Mickey's Christmas Party remain exact merchant candidates.
No link is published until account eligibility and tracking are independently
verified. Fever on-site selling requires the separate distribution agreement/API;
an affiliate link does not implement checkout. No enrollment is performed here.
