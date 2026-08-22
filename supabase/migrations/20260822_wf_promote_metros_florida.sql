-- 20260822_wf_promote_metros_florida.sql — open the rest of Florida.
--
-- WHY. 6,651 places in wf_place_ids clear the owner's 9.2 Wayfind score and are
-- not servable. Measured 2026-08-22:
--
--   3,642  outside Florida entirely (Dubai, Singapore, Istanbul, Leeds, Manila —
--          ~90 rows per "metro", the residue of stray searches). NOT opened here,
--          and deliberately so: the 20260813 migration exists to stop exactly
--          that flood.
--   3,009  in Florida, of which only 703 sat inside the four original boxes.
--
-- So 2,306 places clearing 9.2 were unreachable for one reason: no box contained
-- them. This adds thirteen, each drawn around a real measured cluster rather than
-- around a city name. Coverage at 9.2+, counted against live data before the
-- boxes were written:
--
--   miami 595 · fort-lauderdale 359 · jacksonville 195 · palm-beach 100
--   clearwater 100 · daytona 78 · naples-fort-myers 75 · space-coast 57
--   orlando-north 56 · destin 55 · st-augustine 51 · pensacola 50
--   ocala-gainesville 43 · venice-punta-gorda 11
--
-- CLEARWATER is the one to notice: 100 places clearing 9.2, sitting 0.05° west of
-- the Tampa box's edge. The home market was losing its own beach towns to a
-- rounding decision.
--
-- ONLY ADDITIVE. No existing box is altered. orlando-north is a NEW box abutting
-- orlando rather than an extension of it, because the 20260813 migration is
-- already applied and scripts/check-promote-metros-parity.mjs compares the JS
-- constant against the migration ARTIFACTS — mutating a landed migration would
-- make the file lie about what the database contains. Boxes may overlap;
-- wf_bucket_metro breaks ties by nearest centre, identical to bucketMetro().
--
-- COST. Enqueue is free. Each promoted row costs one Place Details call at
-- ~$0.017, so opening all thirteen commits roughly $39 at the 9.2 floor. Nothing
-- is enqueued by this migration — public.wf_promotion_enqueue_by_score() decides
-- that, and it takes an explicit floor and limit.

insert into public.wf_promote_metros (metro, min_lat, max_lat, min_lng, max_lng) values
  ('miami',              25.55, 26.00, -80.50, -80.10),
  ('fort-lauderdale',    26.00, 26.45, -80.35, -80.05),
  ('palm-beach',         26.45, 26.95, -80.30, -80.02),
  ('naples-fort-myers',  26.10, 26.75, -82.05, -81.60),
  ('venice-punta-gorda', 26.85, 27.15, -82.50, -82.00),
  ('clearwater',         27.88, 28.22, -82.92, -82.72),
  ('space-coast',        28.00, 28.60, -80.90, -80.55),
  ('orlando-north',      28.75, 28.92, -81.65, -81.10),
  ('daytona',            29.00, 29.45, -81.20, -80.90),
  ('ocala-gainesville',  29.10, 29.80, -82.50, -82.00),
  ('st-augustine',       29.75, 30.05, -81.45, -81.20),
  ('jacksonville',       30.05, 30.55, -81.90, -81.30),
  ('destin',             30.32, 30.52, -86.70, -86.30),
  ('pensacola',          30.28, 30.62, -87.45, -87.00)
on conflict (metro) do nothing;
