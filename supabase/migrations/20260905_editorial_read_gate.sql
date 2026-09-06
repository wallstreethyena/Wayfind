-- 20260905_editorial_read_gate.sql — EDITORIAL FAILS CLOSED AT READ TIME.
--
-- Owner, 2026-09-05: "if a place is open when editorial is published, then
-- closes later, the trigger never runs again... every time Wayfind serves 'You
-- should go here!' it should first ask 'Is this place still open?'"
--
-- He is right, and it is the more important half of the fix.
--
-- WHAT THE WRITE TRIGGER CANNOT DO. 20260905_editorial_requires_servable_place
-- added wf_editorial_servable_place, which refuses to publish editorial for a
-- place with no OPERATIONAL wf_inventory row. That answers "was this place open
-- when we printed the guide". It cannot answer "is it open now", because a venue
-- closing is an UPDATE to wf_inventory.status — a table the trigger never fires
-- on. A periodic reconcile narrows that window; it does not close it, and
-- between two runs the site tells somebody to go to a restaurant that shut down.
--
-- THE FIX IS A VIEW. Evaluated on EVERY read, so the "closes later" case fails
-- closed the instant the status changes, with no job needing to run. A boolean
-- column would have the same staleness problem as the trigger; seven patched
-- call sites would have the green-on-move problem (proven: writing this fix, a
-- hand-written list of six readers missed a seventh, lib/explodingNearbyServe.js
-- — a guard built on the same list would have gone green on the file it missed).
--
-- security_invoker = true so the CALLER's RLS still applies. Without it the view
-- runs as its owner and quietly bypasses RLS on both base tables, which would
-- turn a correctness fix into a security regression.
--
-- APPLIED LIVE 2026-09-05 (project gbhtoehdxkzjsmmkisgu). PROVEN BY PROBE, not
-- by reading the DDL: a servable place returned 1 row; flipping its
-- wf_inventory.status to CLOSED_PERMANENTLY made the view return 0 IMMEDIATELY;
-- restoring the status returned 1 again. Rolled back.
--
-- EVERY SERVING PATH READS THIS VIEW. The raw table stays available to
-- app/api/cron/* — atlas-build writes rows, cuisine-classify and beach-water
-- read columns unrelated to serving prose. A cron is not a serving path.
-- scripts/check-editorial-read-gate.mjs WALKS app/ and lib/ and fails by name on
-- any serving read of the raw table, so an eighth reader added tomorrow cannot
-- bypass the gate quietly.
--
-- Idempotent.

create or replace view public.wf_editorial_servable
with (security_invoker = true) as
select e.*
from public.wf_editorial e
join public.wf_inventory i
  on i.place_id = e.place_id and i.status = 'OPERATIONAL'
where e.verified is true;

grant select on public.wf_editorial_servable to anon, authenticated, service_role;

comment on view public.wf_editorial_servable is
  'THE ONLY editorial source any serving path may read. Enforces BOTH publish axes at READ time: verified = true AND the place still has an OPERATIONAL wf_inventory row. The write trigger cannot catch a venue that closes AFTER publication, because that is a status change on wf_inventory it never sees. This view is evaluated per read, so that case fails closed with no job needing to run. Added 2026-09-05. security_invoker=true so caller RLS still applies.';
