-- 20260822_wf_feedback.sql — in-app user feedback that lands in the DATABASE,
-- never an inbox. APPLIED TO PRODUCTION 2026-08-22; recorded here so the schema
-- lives in git.
--
-- Owner directive: a feedback control that does NOT go to email — something a
-- user acts on in the app, that the team reads later in one place. Written by
-- /api/feedback with the service role; service-role only (no policies), so the
-- anon key can neither read others' feedback nor write directly.
--
-- Read the queue:  select * from wf_feedback where not handled order by created_at desc;
create table if not exists public.wf_feedback (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  message     text not null,
  sentiment   text,                       -- 'up' | 'down' | null
  path        text,                       -- route the user was on
  place       text,                       -- optional place/context label
  loc_name    text,                       -- the reader's resolved location
  build       text,                       -- BUILD_ID, to tie feedback to a release
  user_id     uuid,                       -- set only when signed in
  ua          text,                       -- user agent, truncated
  handled     boolean not null default false,
  constraint wf_feedback_message_len   check (char_length(message) between 1 and 2000),
  constraint wf_feedback_sentiment_ck  check (sentiment is null or sentiment in ('up','down'))
);

create index if not exists wf_feedback_created_idx   on public.wf_feedback (created_at desc);
create index if not exists wf_feedback_unhandled_idx on public.wf_feedback (handled, created_at desc);

alter table public.wf_feedback enable row level security;

comment on table public.wf_feedback is
  'In-app user feedback (owner: NOT email). Written by /api/feedback with the service role; service-role only, no policies.';
