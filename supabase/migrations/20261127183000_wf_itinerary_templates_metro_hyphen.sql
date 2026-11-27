-- wf_itinerary_templates.metro: allow hyphenated Wayfind metro ids.
--
-- The first twice-daily run (2026-11-27 18:10 UTC) wrote Tampa, Orlando and
-- the Keys but every write for st-pete, manatee-sarasota and miami-dade failed:
-- the column check from 20261127150000 allowed only [a-z0-9_], while
-- wf_inventory.metro (the source the cron copies from) uses hyphens. The new
-- check accepts lowercase words joined by single hyphens or underscores, which
-- covers every TEMPLATE_METROS id and still rejects spaces, capitals, leading,
-- trailing or doubled separators. Locked by scripts/test-ai-engine-community.mjs.
--
-- Reverse:
--   alter table public.wf_itinerary_templates drop constraint wf_itinerary_templates_metro_check;
--   alter table public.wf_itinerary_templates add constraint wf_itinerary_templates_metro_check
--     check (char_length(metro) between 2 and 40 and metro ~ '^[a-z0-9_]+$');

alter table public.wf_itinerary_templates drop constraint if exists wf_itinerary_templates_metro_check;
alter table public.wf_itinerary_templates add constraint wf_itinerary_templates_metro_check
  check (char_length(metro) between 2 and 40 and metro ~ '^[a-z0-9]+([_-][a-z0-9]+)*$');
