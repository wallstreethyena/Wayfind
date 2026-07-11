-- DRAFT FOR OWNER REVIEW — RLS hardening from the July 2026 static security
-- review (v5.43). Apply in the Supabase SQL editor AFTER running the two
-- verification queries below and reading each section. Nothing here runs
-- automatically. Written against the newer supabase/schema.sql; if the older
-- root supabase-schema.sql is what's live, the drops below also remove its
-- permissive policies.
--
-- STEP 0 — verify what is actually live before changing anything:
--   select tablename, rowsecurity from pg_tables where schemaname='public';
--   select tablename, policyname, cmd, qual, with_check
--     from pg_policies where schemaname='public' order by tablename, cmd;

-- ── H1: saved_places / likes must be owner-only reads ──────────────────────
-- The old root schema made both world-readable (USING (true)) via the anon
-- key, leaking every user's saves — including the reserved "Disliked" list.
drop policy if exists "saved are public" on public.saved_places;
create policy "own saved read" on public.saved_places
  for select using (auth.uid() = user_id);

drop policy if exists "likes are public" on public.likes;
create policy "own likes read" on public.likes
  for select using (auth.uid() = user_id);

-- ── H2: events inserts must bind user_id to the caller ─────────────────────
-- Today WITH CHECK (true) lets anyone insert rows carrying ANY user_id —
-- which forges giveaway entries (the draw counts events rows with
-- action='share') and spoofs other users. Anonymous analytics stay allowed,
-- but unattributed.
drop policy if exists "events_insert_anon" on public.events;
drop policy if exists "insert any event" on public.events;
create policy "events_insert_anon" on public.events
  for insert to anon
  with check (user_id is null);
create policy "events_insert_auth" on public.events
  for insert to authenticated
  with check (user_id = auth.uid());
-- [OWNER: even with this, the giveaway draw should not trust a
-- client-writable table. Longer term, count shares from a server-stamped
-- source (e.g. a SECURITY DEFINER RPC) — see the review report.]

-- ── M2: events payload constraints (flood/poison resistance) ────────────────
-- [OWNER: confirm the action allow-list matches every logEvent() action in
-- app/home.js before applying — query distinct actions first:
--   select action, count(*) from public.events group by 1 order by 2 desc;]
alter table public.events
  add constraint events_meta_size_chk
    check (meta is null or pg_column_size(meta) <= 2048),
  add constraint events_placename_len_chk
    check (place_name is null or char_length(place_name) <= 200);

-- ── M3: comments content constraints (the 600-char cap was client-side only)
-- [OWNER: confirm the type allow-list matches the UI's real set first:
--   select distinct type from public.comments;]
alter table public.comments
  add constraint comments_body_len_chk   check (char_length(body) <= 600),
  add constraint comments_author_len_chk check (author is null or char_length(author) <= 40),
  add constraint comments_rating_chk     check (rating is null or rating between 1 and 5);

-- ── L2: shared_lists payload size cap ───────────────────────────────────────
alter table public.shared_lists
  add constraint shared_lists_payload_size_chk
    check (pg_column_size(payload) <= 16384);

-- ── Also required (code side, shipped in v5.43): /api/cron and /api/cron/cwv
-- now fail closed — SET CRON_SECRET IN VERCEL or the Vercel cron invocations
-- themselves will 401. Vercel sends "Authorization: Bearer $CRON_SECRET"
-- automatically once the env var exists.
