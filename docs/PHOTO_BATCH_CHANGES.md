# Changing photo state in bulk

`wf_google_photo_store` (column `state`) and `wf_place_photo` (column `status`) have statement-level
audit triggers (migration `20261112200000_photo_batch_audit.sql`). Every statement that changes
photo state, or deletes photo rows, writes one row to `wf_photo_change_audit` (service role only).

Anyone changing photo state in bulk must first state why, in the same transaction:

```sql
begin;
set local wayfind.photo_change_reason = 'requeue 2026-11 batch after bad crawl';
update public.wf_place_photo set status = 'active' where ...;
commit;
```

- A statement that changes 20 or more rows with no reason is recorded with `flagged = true` and raises a
  WARNING. It is never blocked: the trigger swallows its own errors and cannot fail a write.
- `set local` lasts for the transaction only. A plain `set` leaks to the whole session; avoid it.
- Review flagged rows: `select * from wf_photo_change_audit where flagged order by at desc;`
- `update ... set status = status` changes nothing and writes no audit row.
