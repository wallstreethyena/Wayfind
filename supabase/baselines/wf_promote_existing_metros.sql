-- Record the five already-active production boxes observed read-only on
-- 2026-09-06. This artifact repairs the offline fallback's missing history.
-- It does not enqueue work, alter budgets, or overwrite an existing box.
-- The production table already contains all five rows. Do not replace this
-- with the older, unmerged Florida expansion proposal (#902).
insert into public.wf_promote_metros (metro, min_lat, max_lat, min_lng, max_lng) values
  ('miami-dade', 25.50, 25.98, -80.50, -80.10),
  ('broward',    25.98, 26.32, -80.35, -80.08),
  ('palm-beach', 26.32, 26.95, -80.25, -80.03),
  ('keys',      24.50, 25.30, -81.90, -80.30),
  ('florida',   24.40, 31.10, -87.70, -79.90)
on conflict (metro) do nothing;
