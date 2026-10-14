# Held migrations

SQL kept here is NOT part of supabase/migrations, so the migration receipt guard,
the production reconciliation canary and the apply runner do not expect it in
production. A held file moves back to supabase/migrations/ (and then needs a
pending entry or an applied receipt) only after the owner approves it.

- 20261002010000_wf_cc_partner_clicks_exclude_devices.sql
  sha256 d3c05b3e1b0e8be7425aa653de1c498330461a74442f48dd1dcc7d9cccd7e279 (13830 bytes).
  Changes reported Command Center partner-click KPIs (wf_cc_excluded_devices unions the
  exclude_devices setting; #1627). Held 2026-10-13 by owner decision until the owner has
  reviewed a Command Center before/after diff. NOT applied to production.
