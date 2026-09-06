-- 20260905_editorial_requires_servable_place.sql — PUBLISHED EDITORIAL MUST
-- DESCRIBE A PLACE WE ACTUALLY SERVE.
--
-- FOUND BY ARITHMETIC, 2026-09-05. The owner checked the coverage numbers and
-- they did not add up: 20,042 operational inventory minus 715 published left
-- 19,327 unaccounted, while 17,112 never-written plus 2,045 rejected came to
-- 19,157. He asked what the ~170-row difference was. It was not a hole in the
-- backlog — it was two different denominators being subtracted from each other.
-- The inventory-side count (17,112) is scoped to OPERATIONAL places; the
-- editorial-side counts (715 / 2,045 / 207) were scoped to wf_editorial, which
-- contains rows for places that are NOT operational.
--
-- Partitioning all 2,967 wf_editorial rows by their inventory status closes it
-- exactly and exposes the real defect:
--
--     operational                     2,930   (707 published)
--     no wf_inventory row at all         12   (  1 published)  <- 10-char ids,
--                                                                 not Google's
--                                                                 ChIJ… shape;
--                                                                 the 2026-07-22
--                                                                 hand-ticked era
--     CLOSED_PERMANENTLY                  9   (  2 published)
--     CLOSED_TEMPORARILY                  8   (  1 published)
--     EXCLUDED                            7   (  4 published)
--     FUTURE_OPENING                      1   (  0 published)
--                                     -----
--                                     2,967   (715 published)
--
-- So EIGHT published rows described places the site does not serve: four we had
-- DELIBERATELY EXCLUDED, two permanently closed, one temporarily closed, and one
-- whose place_id is not a real Google id at all.
--
-- AND THEY WERE REACHABLE. No editorial read filters on inventory status —
-- app/api/editorial/route.js matches on `place_id=eq.<id>&verified=is.true` and
-- nothing else, and lib/landing.js does the same in bulk. A rail would not show
-- these places, but a saved place, a shared link, a direct URL or an SEO landing
-- page reaches the detail surface, and a permanently closed venue could serve a
-- confident, verified "why you should go".
--
-- SAME BUG CLASS AS 20260904, ONE DIMENSION OVER. That migration made the
-- publish gate check CONTENT (does the row carry what it claims). Nothing ever
-- asked whether the PLACE was still servable. A gate that tests one axis of
-- publishability and not the others is how both of these survived.
--
-- A CHECK constraint cannot reference another table, so this is a trigger.
--
-- APPLIED LIVE 2026-09-05 (project gbhtoehdxkzjsmmkisgu): 8 rows demoted and
-- stamped issues = ['not-servable-inventory']; published 715 -> 707;
-- published_but_not_servable -> 0. PROVEN BY PROBE, not by reading the DDL: a
-- transaction that tries to re-publish one of the 8 is refused with the
-- trigger's message, and the probe rolls back.
--
-- REVERSIBLE:
--   update public.wf_editorial set verified = true, issues = null
--    where issues = array['not-servable-inventory'];
--
-- KNOWN LIMIT, STATED RATHER THAN HIDDEN: this fires on INSERT and UPDATE of
-- wf_editorial. It does NOT catch a place that closes AFTER its editorial was
-- published — that is a status change on wf_inventory, which this trigger never
-- sees. That needs a periodic reconcile and is tracked as its own follow-up.
-- Idempotent.

update public.wf_editorial e
set verified = false,
    issues   = array['not-servable-inventory']
where e.verified
  and not exists (
    select 1 from public.wf_inventory i
     where i.place_id = e.place_id and i.status = 'OPERATIONAL');

create or replace function public.wf_editorial_requires_servable_place()
returns trigger language plpgsql as $$
begin
  if new.verified is true
     and not exists (select 1 from public.wf_inventory i
                      where i.place_id = new.place_id and i.status = 'OPERATIONAL') then
    raise exception
      'wf_editorial.verified=true requires an OPERATIONAL wf_inventory row for place_id % (publishing editorial for a closed, excluded or unknown place)', new.place_id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists wf_editorial_servable_place on public.wf_editorial;
create trigger wf_editorial_servable_place
  before insert or update on public.wf_editorial
  for each row execute function public.wf_editorial_requires_servable_place();

comment on function public.wf_editorial_requires_servable_place() is
  'Refuses to publish (verified=true) editorial for a place with no OPERATIONAL wf_inventory row. A CHECK constraint cannot span tables, so this is a trigger. Added 2026-09-05 after 8 such rows were found live and reachable. Does NOT catch a place that closes AFTER publication — that needs a periodic reconcile.';

-- Expect: published 707, published_but_not_servable 0, demoted 8.
select
  count(*) filter (where verified) as published,
  count(*) filter (where verified and not exists (
      select 1 from public.wf_inventory i
       where i.place_id = wf_editorial.place_id and i.status = 'OPERATIONAL')) as published_but_not_servable,
  count(*) filter (where issues = array['not-servable-inventory']) as demoted
from public.wf_editorial;
