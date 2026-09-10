# Travelpayouts click-to-sale attribution

## Status and scope

This lane covers Tiqets, Klook and Go City commerce redirects. It connects an opaque, server-generated click token to provider-reported bookings in a service-only conversion ledger. It does not fabricate sales, provide checkout, or claim exactly-once PostHog delivery.

Affiliate opportunity refresh is **SHIPPED / awaiting natural post-ship evidence**. PR #1191 merged as `7374df3a`; its migration and service-role-only RPC are already live. Do not replay that migration, reopen the PR, rebase the preserved branch or merge the lane again. The `9fff6557` and `a495ce34` bundles are historical recovery snapshots. Photo-monitor scheduling shipped in #1206 as `a5f01cb5`.

The September 9 queue observation (63 rows, max hits 1, no re-sightings) predates the expected first natural re-sightings around September 11. Await the scheduled Atlas cycle: hits must increase, last_seen_at advance, first_seen_at stay fixed, and a previously resolved missing opportunity reopen. No synthetic production write is needed.

The previous local candidate `d963db2` was not pushed before its checkout disappeared between sessions. This is a newly reconstructed candidate, not a claim that the old commit was recovered. It must receive new validation before release. The owner approved publishing, merging, the new attribution migration and deployment on September 10.

## Provider contract

- [Dynamic SubID on provider short links](https://support.travelpayouts.com/hc/en-us/articles/12729746524050-How-to-dynamically-change-SubID-in-short-affiliate-links)
- [Official link creation API](https://support.travelpayouts.com/hc/ru/articles/25289759198226)
- [Official booking statistics API](https://support.travelpayouts.com/hc/en-us/articles/360019864079-API-of-affiliate-programs-booking-statistics)

Dynamic sub_id is documented on generated tp.st short links. The classic tp.media/r builder remains unchanged. Provisioning sends only original server-registry destinations and verifies the returned account marker, traffic source and exact echoed destination. No short link is followed by automation, which would manufacture an affiliate click.

## Data and behavior

- wf_tp_links stores reusable mappings bound to provider, offer, destination, campaign, marker and traffic source. Disabled mappings stay disabled.
- wf_tp_clicks stores random tokens and sanitized commerce dimensions. It does not store visitor cookies, email, IP, user-agent or free-text search.
- wf_tp_conversions holds one row per network, campaign and provider action. Only a newer provider timestamp can change status and nullable money. Attribution identity is immutable.

A click is persisted before its token is issued. Missing mappings or measurement failures retain the already-validated classic affiliate redirect and are explicitly labeled unattributed. Classic links retain account-level affiliate tracking. Storage outages cannot issue unrecorded tokens or take the booking destination down.

The 30-day matching window is a conservative Wayfind rule, not a claim about every partner's cookie policy. A late first report can match when its action creation timestamp falls inside the click window. Later status updates to matched sales remain observable after expiry. Provider timestamps without a zone are interpreted as UTC; live account acceptance must confirm that reporting convention. Only the documented optional single leading dot is normalized in returned tokens.

All tables use RLS with client-role access revoked. The reconciliation RPC uses caller privileges and service-role-only execution. Replays and stale snapshots cannot duplicate sales or overwrite newer status. Unknown money remains null instead of becoming zero.

Statistics use the earliest durable click as their date bound so late cancellations remain visible. Pagination and reconciliation have explicit caps; truncation or malformed results fail visibly rather than claiming completion. The cron reports confirmed heartbeat writes separately from indeterminate timeouts.

## Release and acceptance

1. Validate the new candidate with focused guards, a meaningful red proof, SQL regression tests in isolated PostgreSQL, the required full guard suite, JSX, production build and bundle check.
2. Read the complete committed new migration, verify its digest and check that production has not applied it already. Apply only this new file. Verify the exact applied statements, RLS, grants and RPC signature before releasing its caller.
3. Publish and merge only the reviewed tree after hosted checks pass. Verify the exact production deployment and aliases.
4. With TRAVELPAYOUTS_TOKEN, Supabase service credentials and CRON_SECRET available, run the provisioning CLI with --apply. Its default dry run makes zero requests. Provider rejection or a bound being reached must remain visibly incomplete.
5. Inspect the authenticated cron's reported outcome and pulse. An absent credential is a configuration failure, never a successful zero-sales result.
6. Await a legitimate booking. Verify token and campaign match, then replay its report without increasing row count or commission totals. Do not generate automated affiliate clicks or fabricate bookings for this evidence.

Production deployment `dpl_4FxxPbFk12H682EnW1ra7aMmH3PX` at `5bc5f7d9` was READY on September 10. Its build environment audit reports TRAVELPAYOUTS_TOKEN absent. Installing a real server-side token remains necessary for live provider activation; code release alone cannot resolve missing credentials.

## Verification evidence

Reconstructed candidate checks: attribution guard 177 assertions passed; provisioning guard 35 assertions passed; JSX passed. The complete migration and SQL regression script passed in isolated PGlite PostgreSQL. Deliberate mutations of token normalization, SQL missing-field handling and immutable action creation time failed as expected.

The local production build failed because Google Fonts DNS resolution was unavailable (Fraunces and Inter). Hosted production build and bundle verification remain required. The full local guard runner exited 0 in a clean environment; browser and live-data checks explicitly skipped where their local dependencies were absent. Hosted Chromium checks remain required.

Automatic approval review rejected the feature-branch push to wallstreethyena/Wayfind because it required destination-specific authorization. No attribution migration, PR merge or deployment has occurred. Prior candidate test results do not count as validation of this reconstructed tree.
