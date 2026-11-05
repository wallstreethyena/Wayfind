# Viator booking attribution

This pipeline joins provider-reported bookings to persisted, opaque outbound
click tokens. It does not infer a booking from an outbound click, nor infer a
Google Ads campaign from a URL-supplied campaign value.

## Deployment state and activation

The migration `supabase/migrations/20261103220000_wf_viator_booking_attribution.sql`
is pending application. Its exact hash belongs in
`scripts/migration-pending-apply.json` until the merged migration has been
applied through the repository's migration workflow and its receipt verified.
Do not record an application based on local tests.

Both runtime features require explicit opt-in:

| Setting | Default | Effect |
|---|---|---|
| `WF_VIATOR_TOKEN_CAPTURE` | Disabled | Only `1` permits private click persistence and token stamping. |
| `WF_VIATOR_BOOKING_SYNC` | Disabled | Only `1` permits the authenticated cron to access credentials, the database, or Viator. |
| `WF_VIATOR_GOOGLE_UPLOAD_MODE` | `off` | Uploads stay off unless separately enabled for validation or live operation. |

Deploy with both opt-ins unset and uploads off. Apply the reviewed migration,
verify role access and RPC contracts, then enable capture. Enable booking sync
only after the schema is ready. The scheduled route is
`/api/cron/viator-bookings`; it always authenticates before evaluating the sync
gate. An authenticated disabled invocation returns `status: disabled` with
`Cache-Control: no-store` and performs no database or provider requests.

An enabled `?dry_run=1` request probes the provider contract without ingesting
booking records. It can write job telemetry. It requires the cron secret,
provider API credential, and server-side database credentials; missing required
configuration returns an explicit failure.

## Data and trust boundaries

- Outbound campaign tags contain an unpredictable `wfv_` token encoded as a
  URL-safe campaign suffix. Raw ad click IDs never appear in the partner URL.
- Click retry reuse requires the same visitor context and a bounded retry window.
- Provider events match only an exact stored token within the attribution window.
  Subsequent amendments and cancellations preserve an established booking match.
- URL campaign metadata is observed and unverified. Authoritative campaign
  verification is a separate operation; a URL parameter is not reporting evidence.
- Customer spend, estimated commission, confirmed commission, and paid commission
  remain separate. Customer spend must not be reported as Wayfind revenue.
- Tables, the financial view, and mutation RPCs are private to the server role.
  RLS stays enabled with no public policies; anonymous and signed-in clients have
  no direct table, view, or RPC access.
- Raw click identifiers and associated attribution snapshots are redacted after
  the retention period by the enabled scheduled job. Disabling sync also pauses
  scheduled redaction; reconcile outstanding retention work before suspending it
  after capture has been activated.

## Google upload staging

Keep uploads off during schema deployment and provider validation. The adapter
requires an explicitly configured operating account and conversion action; there
is no built-in account fallback. Credentials and account values are operational
configuration and must not be written to this document.

The adjustment adapter uses Google Ads API v26. Review the
[official API sunset schedule](https://developers.google.com/google-ads/api/docs/sunset-dates)
before activation or upgrades.

Use `validate_only` first with a dedicated secondary observation action.
`validated_only` proves request validation, not a live conversion or campaign
match. A successful live submission with a provider receipt records `submitted`;
missing or malformed receipts remain indeterminate and cannot fabricate success.
Live mode also claims previously validated rows for actual submission; only authoritative
reporting can establish `accepted` or verified campaign attribution. Keep the
booking action secondary until round-trip token preservation, financial values,
and cancellation handling have been verified.

Cancellation and amendment handling uses a durable upload ledger. A cancellation
before initial upload cancels the queued item. After submission, Google Ads
adjustments can retract both count and value. A Data Manager zero-value
restatement alone does not retract count and remains explicitly marked as needing
retraction. Neither a validated payload nor an HTTP success proves reconciliation.

## Verification and rollback

Run `node scripts/test-viator-booking-attribution.mjs`. The test executes the
migration and SQL fixtures in PGlite, exercises lease/cursor and upload races,
checks private role access, and proves opt-in gates with network traps and enabled
positive controls. Local execution is not evidence of production installation or
provider acceptance.

For rollback, set upload mode to `off`, disable capture, then disable sync after
accounting for any outstanding redaction and booking reconciliation. Placement
campaign tags continue on outbound links when token capture is disabled. Preserve
private ledgers for reconciliation; do not drop or expose them as a rollback.
