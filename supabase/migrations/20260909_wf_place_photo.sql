-- wf_place_photo — a photo library Wayfind owns outright and never re-buys.
--
-- THE INCIDENT (measured against production, 2026-09-09). 10,028 cached photo
-- URIs in wf_places_cache expire between 2026-09-25 and 2026-10-04 (measured
-- this same day), and September's Google photo allowance is already
-- exhausted at 950/950 — every one of those 10,028 places goes back to
-- fetching a fresh Google photo the moment its cache row dies, against a
-- ledger with zero headroom left this month. wf_photo_repair_queue
-- (20260908) records WHICH places are currently showing the compass
-- fallback; it does not give Wayfind a photo it can show instead, because
-- every recovery path it drives (same-place cache reuse, a fresh Google
-- fetch) still rents the picture from Google under a ToS that forbids
-- storing it past 30 days. Wikimedia Commons photos are CC-licensed, free,
-- and MAY be stored permanently with attribution — this is the table that
-- holds them.
--
-- WHY A TABLE, NOT A LOG LINE. wf_places_cache is a short-TTL k/v response
-- cache (k/v/exp) built to expire — the exact property that created this
-- incident. A log line ("place X got a Commons photo on date Y") would tell
-- an operator a backfill ran; it would not tell the request-time photo
-- server what to SERVE, would not survive being queried by status for the
-- next backfill pass, and would not carry the attribution a CC license
-- requires at the point of display. wf_place_photo is the durable, per-place
-- record both halves of this lane need: the filler worker (this migration's
-- owner) upserts one row per place it resolves or rejects, keyed on
-- place_id so a place is decided exactly once; the request-time server (a
-- separate lane) reads status='active' rows directly, with the attribution
-- fields already sitting next to the image so nothing has to be
-- re-derived or re-fetched to display it.
--
-- THE HARD CONSTRAINTS THIS TABLE MUST NEVER VIOLATE:
-- no Google photo is EVER written here — `source` admits only
-- 'wikimedia' | 'owner' | 'creator', never anything Google-sourced, so this
-- table cannot become a second place the 30-day Google-content limit is
-- quietly violated from; a row is written ONLY after the place's identity
-- has been verified against the candidate Wikipedia/Wikidata article (never
-- on name-similarity alone — see lib/commonsPhotos.js, which reuses
-- lib/popularity.js's verifyWikiIdentity rather than inventing a looser
-- matcher); a row is written ONLY for a file whose license is unambiguously
-- free (clearly CC or public-domain) — anything else is rejected, never
-- guessed into "probably fine"; attribution_text, attribution_url, license
-- and source_ref are NOT NULL and are populated on every row, active or
-- rejected, because a CC-licensed image displayed without attribution is a
-- license violation, not a cosmetic gap; a place a worker could not clear
-- (bad identity match, no free-licensed image, no Commons image at all)
-- gets status='rejected' with a reason baked into source_ref/attribution
-- fields being empty-but-present, so the SAME worker never re-spends a
-- Wikimedia round trip re-discovering the same "no" run after run.

create table if not exists public.wf_place_photo (
  place_id          text primary key references public.wf_inventory(place_id) on delete cascade,
  source            text not null check (source = any (array['wikimedia','owner','creator'])),
  image_url         text not null,
  width             integer,
  height            integer,
  license           text not null,
  attribution_text  text not null,
  attribution_url   text not null,
  source_ref        text not null,
  match_confidence  numeric not null default 0,
  status            text not null default 'active'
                       check (status = any (array['active','rejected','stale'])),
  verified_at       timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index if not exists wf_place_photo_status_verified_idx
  on public.wf_place_photo (status, verified_at);

alter table public.wf_place_photo enable row level security;
revoke all on public.wf_place_photo from anon, authenticated;
grant select, insert, update, delete on public.wf_place_photo to service_role;

comment on table public.wf_place_photo is
  'Permanent, owned photo record (2026-09-09). One row per place_id a photo backfill worker has resolved or rejected -- never a Google photo (see source check), because Wikimedia Commons content is CC-licensed and may be stored indefinitely with attribution, unlike anything rented from Google. Written by scripts/backfill-place-photos.mjs / app/api/cron/place-photos (lib/commonsPhotos.js findCommonsPhoto), which reuses lib/popularity.js verifyWikiIdentity for identity and rejects any non-free license. See this file for the full incident.';
comment on column public.wf_place_photo.source is
  'Where this photo came from. wikimedia: Wikimedia Commons, resolved via the Wikidata/Wikipedia identity-verified path (lib/commonsPhotos.js). owner/creator: reserved for a future direct-upload path (a business owner or a Wayfind creator submits their own photo) -- not written by this lane, declared now so the check constraint does not need a migration later.';
comment on column public.wf_place_photo.image_url is
  'The photo''s direct, hotlinkable URL (a Wikimedia Commons upload.wikimedia.org URL for source=wikimedia). Never a Google Places media URL -- that content may not be stored past 30 days and does not belong in this table at all. NOT NULL admits no "no photo" state, so a status=''rejected'' row (no schema column for a reason) stores '''' here -- see the status comment below and source_ref for where the reason actually lives.';
comment on column public.wf_place_photo.license is
  'The machine-readable license code from the source''s own metadata (e.g. Commons extmetadata License.value, such as "cc-by-sa-4.0" or "pd"). Only a license lib/commonsPhotos.js classifies as clearly free/CC/public-domain is ever written on an active row -- anything ambiguous or non-free is rejected (status=''rejected''), never stored on a guess. A rejected row stores the literal sentinel ''none'' here (NOT NULL leaves no other option).';
comment on column public.wf_place_photo.attribution_text is
  'The human-readable credit line to render next to the photo (artist/author plus license short name, e.g. "Jane Doe, CC BY-SA 4.0"). Required on every active row -- a CC license without displayed attribution is a violated license, not a missing nicety. '''' on a status=''rejected'' row, which has no photo to credit.';
comment on column public.wf_place_photo.attribution_url is
  'Where the attribution text should link -- the source''s own description/credit page (a Commons File: page for source=wikimedia). Required on every active row for the same reason as attribution_text; '''' on a status=''rejected'' row.';
comment on column public.wf_place_photo.source_ref is
  'A stable identifier back to the source record (the Commons File: page title, e.g. "File:Example.jpg", for source=wikimedia on an active row). On a status=''rejected'' row this instead carries "rejected:<reason>" (no-wiki-candidate / identity_<verifyWikiIdentity reason> / license_non_free_license / no-image, from lib/commonsPhotos.js findCommonsPhoto''s onReject hook) -- the schema has no separate reason column, so this NOT NULL field is repurposed to hold WHY, which is what lets an operator tell "never checked" from "checked and there is genuinely nothing" without a second table.';
comment on column public.wf_place_photo.match_confidence is
  'The identity-match confidence carried over from lib/popularity.js''s nameSim/verifyWikiIdentity path (0..1) -- how sure the resolver is that the Wikipedia/Wikidata article this photo came from is THIS place, not a same-named one. Never a license or image-quality score.';
comment on column public.wf_place_photo.status is
  'active: a verified, free-licensed photo is on this row and may be served. rejected: a worker looked at this place and found no admissible photo (failed identity verification, no free license, or no Commons image at all) -- the row exists specifically so the same place is never re-attempted every run. stale: reserved for a future re-verification pass (e.g. the source file was deleted or relicensed on Commons); not written by the initial backfill.';
comment on column public.wf_place_photo.verified_at is
  'When the identity/license verification behind this row last ran. Distinct from created_at so a future re-verification pass can update this without losing the row''s original creation date.';
