# Canary remediation — 2026-10-04

## Verified failures

Main audited: `0709738350181c0e3d79aba24150246b08d4d594`.
The five latest completed canary runs were inspected, including both failing
job logs for every run. All five reported the same three defects:

| Run | Started (UTC) | Inventory | Migration reconciliation |
| --- | --- | --- | --- |
| 37202756723 | 2026-10-04 12:37:36 | Siesta twin | Purge absent from repo; heartbeat unapplied |
| 37181807616 | 2026-10-04 06:05:57 | Siesta twin | Same |
| 37164311885 | 2026-10-04 00:14:05 | Siesta twin | Same |
| 37155569152 | 2026-10-03 21:34:21 | Siesta twin | Same |
| 37142819272 | 2026-10-03 18:04:04 | Siesta twin | Same |

The newest run used the audited main; the other four used `96ea2b5d`.
Routes, promotion metro parity, incident delivery and the RPC signature step
passed. The heartbeat job successfully recorded the aggregate failure; its
successful execution does not mean the canary passed.

Latest failing jobs: inventory `111437621155`, deploy contract `111437621275`.
Exact diagnoses:

- `Siesta Key Village (2x, 86m)` violates the one-venue/one-card invariant.
- `unreviewed production migration: 20261002005045 / wf_photo_credit_purge_expired`
- `20260930120000_wf_heartbeat_github_monitor_tolerance.sql has no applied ledger entry or verified historical alias.`

Run URL: https://github.com/wallstreethyena/Wayfind/actions/runs/37202756723

## Existing repair integrated

Imported only the exact photo-purge migration from existing handoff PR #1632,
head `981e6fea8453bae0baa840463c93d76dedbc9b8f`:
`supabase/migrations/20260930120000_wf_photo_credit_purge_expired.sql`.
This records already-applied SQL; it must not be applied again.

- File SHA-256: `2f61bfcf7ed249e6565209caf4690933b0ac0ad4b7583f508341af32aa047ab2`
- Canonical statement-array SHA-256: `1c9c4c9119fb9183e414c05b6a9c39a839085fa77aeea0670be91108612f8de1`
- Production has exactly one logical-name ledger row, server version `20261002005045`, with that exact statement hash.

Read-only verification, project `gbhtoehdxkzjsmmkisgu`:

```sql
select count(*) as matching_ledger_rows,
       min(version) as server_version,
       bool_and(statements_sha256 =
         '1c9c4c9119fb9183e414c05b6a9c39a839085fa77aeea0670be91108612f8de1')
         as exact_statement_hash
from public.wf_migration_ledger_hashes()
where name = 'wf_photo_credit_purge_expired';
```

No reconciliation exceptions, guard changes or database writes were used.

## Remaining authorized applies

Follow existing issue #1593 and PR #1599, including one operator, fresh ledger
checks, private before/after snapshots, reference counts and the canonical
runner. The owner release instruction is recorded on #1599. No new Siesta
implementation is needed; #1632 also carries the reviewed migration.

At `2026-10-04T13:39:10Z`, both Siesta IDs remained `OPERATIONAL`, unexcluded,
unlocked, with null exclusion reasons. Heartbeat tolerances remained canary
360, synthetic-monitor 360, photo-monitor 240 minutes. Neither migration had
a ledger entry. A subsequent read found zero likes, saved_places and
wf_saved_items references to the duplicate; refresh these before applying.

| Migration | File SHA-256 | Canonical statement-array SHA-256 |
| --- | --- | --- |
| `20260930120000_wf_heartbeat_github_monitor_tolerance.sql` | `048db2c02bc5f17efa2eca963b4397d0090a2863a5574ceb629750bef6e4ea96` | `cd01bfb507e205c124233c161237a7d56e9302dd39897ba5e674f9a2257926de` |
| `20260929_siesta_key_village_split_venue_dedupe.sql` at #1599 head `b3bfa43271b88cf604cac5c83c2663eb9028df72` | `7a15d901554223cdba5f170fd8ccfafe4a3e112bd293e3a9a4c1e95936828500` | `f542c37f066a19a21ce5979d09b79f1403e132a63b6591e2a228f5e580b0ce8d` |

Run the heartbeat apply independently from a clean canonical main checkout.
Run Siesta from the approved clean #1599 checkout after satisfying its
preconditions. If the duplicate has likes or saves, stop for the existing
runbook's owner decision.

```sh
node scripts/apply-migration.mjs supabase/migrations/20260930120000_wf_heartbeat_github_monitor_tolerance.sql
node scripts/apply-migration.mjs supabase/migrations/20260929_siesta_key_village_split_venue_dedupe.sql
```

The execution environment checked in this audit lacks all three runner
credentials: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_URL`, and
`SUPABASE_SERVICE_ROLE_KEY`. Connector access does not provision them. Do not
substitute connector SQL, manual ledger edits or a bypass. After an ambiguous
response, inspect ledger and effects before retrying. Save genuine receipts,
verify exactly one matching ledger row each, merge through the protected
path, and inspect fresh canary/photo-monitor/synthetic-monitor runs.

## Regression evidence and limits

- Existing `test-promote-decision.mjs`: 23 assertions passed, including the
  captured Siesta pair and healthy branch/name/metro controls.
  `partitionSplitVenues` is already called by both promotion paths.
- Existing `check-heartbeat-tolerance.mjs`: 14 assertions passed, replaying
  three migrations. This proves repository intent, not a production apply.
- Direct calls to the shipped reconciliation helpers: nine assertions passed.
  Exact captured production hash accepted; removing the canonical file,
  changing the SQL hash, and duplicating the ledger entry each rejected.
  The unapplied heartbeat migration remained unresolved.
- Full live reconciliation was not rerun locally because credentials are
  absent. The next canary must verify the shipped canonical file and both
  completed applies. No claim of a green production canary is made here.

The root cause is an incomplete operational handoff: one applied migration
was never merged, one merged migration was never applied, and the reviewed
Siesta data repair remains unapplied. The alarms are correctly detecting all
three; suppressing them would hide unresolved production state.

## Follow-up verified — 2026-10-05

Current main is `f88356590728bb218f0a9d8498d5584eb113dfae`.
Canary run `37357464849` now reports only two remaining defects:
inventory job `111923398297` reports the Siesta twin, and contract job
`111923398738` reports the unapplied heartbeat migration. The imported
photo-purge migration no longer appears as a reconciliation failure.

The existing Vercel connection supplied the existing Supabase URL and
service credential privately. The canonical heartbeat runner was invoked
with them and refused before applying because `SUPABASE_ACCESS_TOKEN` is
still absent. No new credentials, database writes, direct SQL workaround or
ledger edits were used for this canary repair. A fresh ledger query returned
no entry for either remaining migration.

Next operator action: securely configure the existing Management API access
token in the canonical runner environment, then follow the separate clean
main heartbeat apply and clean approved #1599 Siesta apply described above.
Refresh the inventory/reference preconditions, preserve private snapshots,
and verify the genuine receipts and fresh canary afterward. Do not merge
#1599 until its apply and verification requirements pass.
