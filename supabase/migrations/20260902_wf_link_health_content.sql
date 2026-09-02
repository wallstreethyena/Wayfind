-- 20260902_wf_link_health_content.sql — CONTENT-AWARE OUTBOUND LINK HEALTH.
--
-- Incident 2026-09-02: the Fruitville Grove Pumpkin Festival card's
-- "Event details" opened fruitvillegrove.com — a dropped domain re-registered
-- by an Indonesian togel/slot operator. The URL came from a tier-3 calendar
-- source and no job had ever fetched it; every link check in this repo asked
-- only "does it answer 200?", which a hijacked domain does. The same sweep
-- found O'Leary's Tiki Bar's live site with online-casino copy injected.
--
-- Two additions:
--   1. wf_events gains link_ok / link_verdict / link_checked_at / link_final_url,
--      written nightly by /api/cron/events-link-health from a real fetch
--      classified by lib/linkQuarantine.classifyOutboundPage. Serving paths
--      (lib/curatedEvents.eventOutboundUrl) publish NO external URL for a row
--      with link_ok = false — the card still serves, the button does not.
--   2. wf_link_verdicts — a URL-keyed verdict cache for links that are not
--      rows we own (a venue's Google websiteUri shown in the detail sheet).
--      /api/outbound/verdict reads it before it lets the client render a
--      "Website" button, and fills it on a miss.
--
-- APPLIED LIVE 2026-09-02 (project gbhtoehdxkzjsmmkisgu). Idempotent.

alter table public.wf_events
  add column if not exists link_ok         boolean,
  add column if not exists link_verdict    text,
  add column if not exists link_checked_at timestamptz,
  add column if not exists link_final_url  text;

comment on column public.wf_events.link_ok is
  'null = never content-checked; true = destination answered as the venue/event; false = hijacked/parked/dead/soft-404/offsite per events-link-health — serving paths publish no external URL. See lib/linkQuarantine.js.';

create index if not exists wf_events_link_checked_idx
  on public.wf_events (link_checked_at asc nulls first);

create table if not exists public.wf_link_verdicts (
  url          text primary key,
  host         text not null,
  verdict      text not null,           -- alive | hijacked | parked | dead | soft404 | offsite | unknown
  reason       text,
  title        text,
  final_url    text,
  expected     text,                    -- the name(s) the link was checked against
  checked_at   timestamptz not null default now(),
  fail_count   integer not null default 0
);
create index if not exists wf_link_verdicts_host_idx on public.wf_link_verdicts (host);
create index if not exists wf_link_verdicts_checked_idx on public.wf_link_verdicts (checked_at);

alter table public.wf_link_verdicts enable row level security;
-- No anon policy on purpose: only the service role (crons, server routes)
-- reads or writes verdicts. CLAUDE.md lesson 5: new tables ship WITH RLS.

comment on table public.wf_link_verdicts is
  'Content-classified verdicts for outbound URLs Wayfind may render (venue websites from Google, event links). Written by /api/outbound/verdict and /api/cron/events-link-health; a hijacked/parked/dead verdict removes the link from every surface. 2026-09-02.';
