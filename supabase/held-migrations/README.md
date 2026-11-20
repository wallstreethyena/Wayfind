# Held migrations

SQL kept here is NOT part of supabase/migrations, so the migration receipt guard,
the production reconciliation canary and the apply runner do not expect it in
production. A held file moves back to supabase/migrations/ (and then needs a
pending entry or an applied receipt) only after the owner approves it.

- 20261013180000_event_link_repairs_2026_10_13.sql
  sha256 7da41a3ca2ebd85fd996ffb60921d7be52ccda9576c4e085d37f10f276a83c49 (5484 bytes).
  Superseded 2026-10-14: coffee+goblin already correct by manual write; Cortez+Country Thunder owned by #1760. Must NOT be applied (#1740). NOT applied to production.

Released: 20261002010000_wf_cc_partner_clicks_exclude_devices.sql (#1627) left this folder on
2026-11-20 when the owner asked for the report to be fixed; it is superseded by
supabase/migrations/20261120140000_wf_cc_partner_clicks_commerce_mirror.sql, which also counts the
commerce_cta_clicked mirror. Before/after (owner briefing, 2026-11-13..19 ET): partner clicks
0,0,0,0,1,0,0 under the old definition vs 27,28,13,13,17,24,22 under the new one.
