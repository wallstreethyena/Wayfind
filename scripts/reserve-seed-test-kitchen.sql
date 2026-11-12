-- Reserve a table: the TEST restaurant. NOT RUN by the code lane; the integrator runs it against the
-- preview or production database after the 20261111210000 migration is applied.
-- Idempotent: safe to run again, it updates the same row. Stage 'demo' means it is visible only
-- outside production (the partner list never returns a demo partner in production) and no email is
-- ever sent for it. Try it at /reserve/test on a preview deployment.
insert into public.wf_reserve_partners
  (place_id, name, contact_email, phone, stage, active, timezone, max_party, capacity_covers, seating_minutes, lead_minutes, window_days, hours, closed_dates)
values (
  'wf-test-kitchen', 'Wayfind Test Kitchen', 'reserve-test@gowayfind.com', '(941) 555-0100', 'demo', true,
  'America/New_York', 12, 24, 90, 60, 60,
  -- Monday is closed (missing). Last seating windows: Tue to Thu 17:00 to 21:00, Fri and Sat 17:00 to 22:00,
  -- Sunday 11:00 to 14:00 and 17:00 to 20:00.
  '{"tue":[["17:00","21:00"]],"wed":[["17:00","21:00"]],"thu":[["17:00","21:00"]],"fri":[["17:00","22:00"]],"sat":[["17:00","22:00"]],"sun":[["11:00","14:00"],["17:00","20:00"]]}'::jsonb,
  array['2026-11-26'::date, '2026-12-25'::date]   -- Thanksgiving and Christmas 2026
)
on conflict (place_id) do update set
  name = excluded.name, contact_email = excluded.contact_email, phone = excluded.phone, stage = excluded.stage,
  active = excluded.active, timezone = excluded.timezone, max_party = excluded.max_party,
  capacity_covers = excluded.capacity_covers, seating_minutes = excluded.seating_minutes,
  lead_minutes = excluded.lead_minutes, window_days = excluded.window_days, hours = excluded.hours,
  closed_dates = excluded.closed_dates, updated_at = now();

-- manage_token_hash (the restaurant dashboard link) is NOT set here on purpose. The integrator makes a
-- token and stores only its hash, so the token never lands in the repo or a log:
--   node -e "const c=require('node:crypto');const t=c.randomBytes(32).toString('base64url');console.log('token',t);console.log(c.createHash('sha256').update(t).digest('hex'))"
--   update public.wf_reserve_partners set manage_token_hash = '<the sha256 hex printed above>' where place_id = 'wf-test-kitchen';
-- The dashboard is then /reserve/manage/<token>.
