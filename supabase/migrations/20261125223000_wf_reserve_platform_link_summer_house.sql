-- OpenTable link for Summer House on the Lake (Disney Springs), the one restaurant the booking
-- agent is allowed to book (lib/bookingAgent/placeAllowlist.js). Without this row the provider
-- registry does not know the restaurant is on OpenTable, so neither the handoff nor the agent
-- can reach it.
-- Evidence (read 2026-11-25): OpenTable's profile 1280968 and its /r/ page both show "Summer House
-- on the Lake - Disney Springs", 1498 E Buena Vista Dr, Orlando, FL 32821, rid=1280968, with online
-- reservations. The Wayfind place ChIJb6B8uZx_3YgRjEUVK2NK1wE is "Summer House on the Lake",
-- Lake Buena Vista, 28.3704 -81.5207 (Disney Springs).
-- Additive and idempotent. Reverse: delete this one row.
insert into public.wf_reserve_platform_links (place_id, platform, external_id, external_slug, evidence_url, verified_by, active)
values (
  'ChIJb6B8uZx_3YgRjEUVK2NK1wE',
  'opentable',
  '1280968',
  'summer-house-on-the-lake-disney-springs-orlando',
  'https://www.opentable.com/r/summer-house-on-the-lake-disney-springs-orlando',
  'claude.exe OpenTable page check 2026-11-25',
  true
)
on conflict (place_id, platform) do nothing;
