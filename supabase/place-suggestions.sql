-- Place-suggestion feature (v6.53). Run this once in the Supabase SQL editor,
-- same as the other supabase/*.sql tables. Backs app/api/place-suggestions.
--
-- Owner: "the user tell the app a place they want to be added to a particular
-- experience... it has to be stored and everytime after we do a push we
-- identify the report places and if it is indeed a place we should place in
-- the list... it's truly an app for the people who use it and they make it
-- better." This is a REVIEW-THEN-ADD workflow, never auto-publish: a row
-- here is only a proposal. The owner (or scripts/review-place-suggestions.mjs)
-- decides whether it becomes a lib/curated.js entry with a matching `intents`
-- key — the existing CURATED+intents mechanism (see lib/curated.js and its
-- usage in app/home.js) is what actually injects an approved place into the
-- themed list; this table never touches ranking on its own.
--
-- place_id is a REAL Google Place ID, resolved client-side via the same
-- guarded /api/places/autocomplete + /api/places/details proxy the search box
-- uses (app/home.js's sugFetchSuggestions/pickSugSuggestion) — never raw free
-- text. Matches the project rule that Google Places is the only source of
-- place identifiers.
create table if not exists public.wf_place_suggestions (
  id uuid primary key default gen_random_uuid(),
  place_id text not null,
  place_name text not null,
  place_lat double precision,
  place_lng double precision,
  experience_key text not null,       -- the EXPERIENCES/hookDetail id this was suggested for, e.g. "hiddengems"
  note text,                          -- optional, user-supplied ("why does it belong here")
  city text,                          -- the user's locName/cityNow at submit time, for the owner's context only
  device_id text,                     -- anonymous device id (same cookie/localStorage id as everywhere else) — abuse-cap only, never shown to other users
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewer_note text
);

create index if not exists wf_place_suggestions_status_idx on public.wf_place_suggestions (status, submitted_at desc);
create index if not exists wf_place_suggestions_exp_idx on public.wf_place_suggestions (experience_key, status);
create index if not exists wf_place_suggestions_device_idx on public.wf_place_suggestions (device_id, submitted_at desc);

alter table public.wf_place_suggestions enable row level security;
-- No public select/insert/update policy at all — every write and every read
-- goes through app/api/place-suggestions (service role only), same posture as
-- wf_city_requests and verified_offers. A suggestion is never client-readable:
-- nobody can see who suggested what, or scrape the pending queue.

-- ── Owner review (run by hand, or see scripts/review-place-suggestions.mjs) ──
-- PREVIEW: pending suggestions, newest first.
-- select id, place_id, place_name, place_lat, place_lng, experience_key, note, city, submitted_at
-- from public.wf_place_suggestions
-- where status = 'pending'
-- order by submitted_at desc;

-- APPROVE (after you've added the matching lib/curated.js entry with
-- intents: ["<experience_key>"] so it actually surfaces in the app):
-- update public.wf_place_suggestions set status = 'approved', reviewed_at = now(), reviewer_note = '<optional>'
-- where id = '<uuid>';

-- REJECT (not a fit — leave a reason so a repeat suggestion isn't re-litigated blind):
-- update public.wf_place_suggestions set status = 'rejected', reviewed_at = now(), reviewer_note = '<why>'
-- where id = '<uuid>';
