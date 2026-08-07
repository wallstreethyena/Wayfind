-- 20260806_wf_gate_status_core_metros_grant.sql
--
-- FIX: wf_gate_status() returns 401 to every client, signed in or not.
--
-- Found auditing the home page on 2026-08-06. The browser console shows a 401
-- on POST /rest/v1/rpc/wf_gate_status on every single page load. The cause is
-- not the key, the JWT, or the grant on the function itself -- anon HAS EXECUTE
-- on wf_gate_status, and wf_best_picks (identical ACL) returns 200 beside it.
--
-- REPRODUCED, rather than inferred:
--
--     set local role anon;
--     select public.wf_gate_status(27.5875, -82.4251, null);
--     -- ERROR: 42501: permission denied for table wf_core_metros
--     -- HINT:  GRANT SELECT ON public.wf_core_metros TO anon;
--
-- wf_gate_status is LANGUAGE sql STABLE with prosecdef = false, i.e. SECURITY
-- INVOKER, so its body runs with the CALLER's privileges. It reads two tables:
--
--     wf_inventory     anon SELECT: true   (1 policy)   <- fine
--     wf_core_metros   anon SELECT: FALSE  (0 policies) <- the whole failure
--
-- Measured for every client role; service_role is the only one that can read it,
-- which is why the server-side call in app/api/city/unlock/route.js (service
-- headers) has always worked while the browser's has never worked:
--
--     rolname         select_core_metros   select_inventory
--     anon            false                true
--     authenticated   false                true
--     service_role    true                 true
--
-- WHAT IT BREAKS, both silently -- the client's rejection handler just sets
-- gateStatus to null and carries on, so nothing is logged and nothing looks
-- wrong:
--
--   1. CityGate never renders. gateStatus is null forever, so the coverage door
--      ('unlock' for signed-in, 'alert' + waitlist for signed-out visitors
--      outside our coverage) is unreachable code in production.
--   2. Coverage expansion never starts from a real visit. The auto-unlock effect
--      in app/home.js is gated on gateStatus === 'unlock' || 'alert', so
--      /api/city/unlock -- the thing that pulls Google + Viator inventory for an
--      uncovered city -- is never called on behalf of an actual reader.
--
-- WHY A GRANT AND NOT security definer. Making the function SECURITY DEFINER
-- would also work and would keep wf_core_metros unreadable, but it widens what
-- the function can touch and needs a pinned search_path to be safe. This table
-- is a non-sensitive lookup -- the list of metro slugs Wayfind treats as core --
-- and the function already returns its influence to anon in the 'live' answer.
-- A read grant is the smaller change and leaks nothing that the RPC's own return
-- value did not already imply.
--
-- SCOPE: SELECT only, to the two client roles. No policy is dropped, no other
-- table is touched, and nothing here relaxes the P0 RLS work -- wf_core_metros
-- holds no user data.

begin;

grant select on public.wf_core_metros to anon, authenticated;

-- RLS is enabled on this table with zero policies, which denies every row to
-- any role that is not BYPASSRLS -- so the grant alone still returns nothing.
-- Both halves are required.
drop policy if exists "core metros are readable" on public.wf_core_metros;
create policy "core metros are readable"
  on public.wf_core_metros
  for select
  to anon, authenticated
  using (true);

commit;

-- ── VERIFICATION ────────────────────────────────────────────────────────────
-- Run AFTER the commit above. Do not accept the migration on "no error" alone:
-- the failure mode this fixes was itself silent, and the grant without the
-- policy (or vice versa) still returns zero rows and re-breaks the gate.
--
--   -- 1. Both client roles can now read the lookup table.
--   select rolname,
--          has_table_privilege(rolname, 'public.wf_core_metros', 'SELECT') as can_select
--   from pg_roles where rolname in ('anon','authenticated');
--   -- EXPECT: can_select = true for both.
--
--   -- 2. The RPC itself now ANSWERS as an anonymous visitor. This is the real
--   --    assertion -- privilege alone is not the behaviour we care about.
--   set local role anon;
--   select public.wf_gate_status(27.5875, -82.4251, null) as gate;      -- Parrish, covered
--   -- EXPECT: 'live'  (NOT an error, and NOT null)
--   select public.wf_gate_status(64.8378, -147.7164, null) as gate;     -- Fairbanks, AK
--   -- EXPECT: 'alert' (signed-out + uncovered -> the waitlist door)
--   reset role;
--   -- A CONTROL is the point of the second call: if BOTH return 'live' the
--   -- policy is wrong in the other direction and the gate is answering yes to
--   -- everywhere, which is just as broken as answering nothing.
