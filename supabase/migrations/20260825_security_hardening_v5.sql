-- 20260825_security_hardening_v5.sql
-- APPLIED TO PRODUCTION 2026-08-25 as four migrations:
--   security_hardening_v5_definer_views_and_rpc_lockdown
--   security_hardening_v5_table_grants_least_privilege
--   security_hardening_v5_net_schema_and_default_privileges
--   fix_two_silent_rls_denials_comments_delete_and_waitlist_signed_in
-- Merging this file applies nothing (AGENTS.md: merging is not applying). It is
-- the record.
--
-- TRIGGER: Supabase security email, 23 Aug 2026. Its headline item
-- (rls_disabled_in_public) was already closed before this pass - every one of
-- the 60 public tables has RLS on. What the audit found underneath it was worse
-- than the alert.
--
-- ROOT CAUSE, and the reason v1..v4 kept having to be written:
--   ALTER DEFAULT PRIVILEGES in schema public granted anon + authenticated ALL
--   on every new table (arwdDxtm) and EXECUTE on every new function. Each
--   hardening pass fixed the objects that existed; the next migration created
--   new ones born wide open. wf_promotion_enqueue_by_score (Aug 22),
--   wf_affiliate_worklist (Aug 21) and the three 20260820 backup tables are all
--   the same bug wearing different names. Part 3 fixes the default itself.

-- ===========================================================================
-- PART 1 - SECURITY DEFINER views (advisor: ERROR) and anon-callable RPCs
-- ===========================================================================

-- A view with no security_invoker runs as its owner (postgres) and ignores RLS
-- on everything underneath. wf_affiliate_opportunities is RLS-on/no-policy
-- exactly so the publishable key cannot read it; this view was handing over the
-- whole monetisation worklist - place, category, suggested partner, hit counts -
-- to anyone with the key out of the browser bundle. Neither view is referenced
-- in lib/ app/ components/ scripts/; both are operator objects.
alter view public.wf_affiliate_worklist set (security_invoker = on);
revoke all on public.wf_affiliate_worklist from anon, authenticated;
alter view public.wf_beach_water_geo set (security_invoker = on);

-- wf_promotion_enqueue_by_score writes wf_promotion_queue, which the cron
-- worker drains by calling Google Place Details. Anon-callable it is an
-- unauthenticated, unrated faucet on metered spend (~$31 per 2000 places).
-- REVOKE FROM PUBLIC IS THE POINT: Postgres grants EXECUTE to PUBLIC on every
-- new function and anon inherits it, so revoking anon alone changes nothing.
revoke all on function public.wf_promotion_enqueue_by_score(integer, integer, text) from public, anon, authenticated;
revoke all on function public.notify_giveaway_entry() from public, anon, authenticated;
revoke all on function public.notify_new_signup() from public, anon, authenticated;
revoke all on function public.notify_welcome_email() from public, anon, authenticated;

-- Service-role-only RPCs. SECURITY INVOKER, so RLS already blocked their
-- writes for anon - this removes the other half of the hole.
revoke all on function public.wf_add_inventory_place(text, text, text, text, text, double precision, double precision, numeric, integer, text[], text) from public, anon, authenticated;
revoke all on function public.wf_atlas_missing(text, text[], integer) from public, anon, authenticated;
revoke all on function public.wf_atlas_retryable(text, text[], integer) from public, anon, authenticated;
revoke all on function public.wf_editorial_record_attempt(text, text[]) from public, anon, authenticated;
revoke all on function public.wf_popularity_stale_batch(integer) from public, anon, authenticated;
revoke all on function public.wf_cuisine_backfill(text[]) from public, anon, authenticated;
revoke all on function public.wf_cuisine_coverage(text) from public, anon, authenticated;
revoke all on function public.wf_coverage_status(double precision, double precision) from public, anon, authenticated;
revoke all on function public.wf_scout_candidates(integer, integer) from public, anon, authenticated;
revoke all on function public.wf_job_health(integer) from public, anon, authenticated;

-- DELIBERATELY LEFT anon-callable - these are the browser's RPCs, verified
-- against every .rpc( and /rest/v1/rpc/ call site in the repo:
--   wf_best_picks  wf_things_to_do  wf_buzz_picks  wf_nearest_beaches
--   wf_gate_status  wf_cuisine_chips  wf_cuisine_places  wf_taste_bump
--   wf_taste_wipe  wf_register_push_token  wf_join_waitlist
--   wf_log_coverage_gap  wf_is_beach  wf_quality10
-- wf_is_beach and wf_quality10 are pure helpers called inside security_invoker
-- views, so anon needs EXECUTE for those views to resolve at all.

-- ===========================================================================
-- PART 2 - table grants, least privilege
-- ===========================================================================
-- Every revoke below is behaviour-preserving by construction: it is issued only
-- where NO policy grants that role that command, so the operation is already
-- denied. What changes is that RLS stops being the only thing in the way.

-- TRUNCATE is NOT subject to RLS and PostgREST never issues it. anon held
-- TRUNCATE on 60 tables. Widest latent privilege in the schema.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

revoke insert, update, delete on
  public.offers, public.wf_beach_water, public.wf_blog_posts, public.wf_blog_settings,
  public.wf_booking_audit, public.wf_deals, public.wf_editorial, public.wf_email_signups,
  public.wf_events, public.wf_experiences, public.wf_feedback, public.wf_geo_coverage,
  public.wf_giveaway_entries, public.wf_hero_images, public.wf_inventory,
  public.wf_inventory_audit_backup_20260820b, public.wf_inventory_dedupe_backup_20260820,
  public.wf_inventory_type_backfill_20260820, public.wf_job_pulse, public.wf_lists,
  public.wf_place_ids, public.wf_place_popularity, public.wf_place_products_manual,
  public.wf_promote_metros, public.wf_promotion_queue, public.wf_scout_verdicts,
  public.wf_spend_ledger, public.wf_trend_candidates, public.wf_trend_concept_map,
  public.wf_trend_discovery_queue, public.wf_trend_place_matches, public.wf_trend_snapshots,
  public.wf_trend_topics, public.wf_viator_dests
from anon, authenticated;

-- Append-only intake: the INSERT policy stays, nothing else survives.
revoke update, delete on public.events, public.cwv_runs, public.shared_lists from anon, authenticated;

-- Signed-in surfaces: anon keeps nothing, authenticated keeps what its policies name.
revoke insert, update, delete on
  public.wf_city_requests, public.wf_media_reports, public.wf_saved_items,
  public.wf_taste, public.wf_user_media
from anon;
revoke update, delete on public.wf_city_requests, public.wf_media_reports from authenticated;
revoke update on public.wf_user_media from authenticated;
revoke delete on public.comments from anon;
revoke update, delete on public.wf_waitlist from anon, authenticated;  -- anon INSERT is the point of the table

-- ===========================================================================
-- PART 3 - pg_net, and THE DEFAULT
-- ===========================================================================

-- ATTEMPTED AND DID NOT TAKE. net.* is owned by supabase_admin and every grant
-- on it was made BY supabase_admin, so a revoke issued as postgres is a silent
-- no-op. PUBLIC still holds ALL on net.http_request_queue and net._http_response
-- and EXECUTE on net.http_post. NOT reachable from the API - PostgREST answers
-- "Only the following schemas are exposed: public, graphql_public" - so it only
-- matters to a role that can already run arbitrary SQL. Platform-level; raise
-- with Supabase or move pg_net out of public (see the extension_in_public lint).
revoke all on all tables in schema net from anon, authenticated;
revoke all on all functions in schema net from anon, authenticated;
revoke usage on schema net from anon, authenticated;

-- THIS is the line that stops v6 from being necessary. New tables and functions
-- in public are now private by default; exposure is an explicit line in the
-- migration that creates them:
--     grant select on public.<table> to anon, authenticated;   -- plus an RLS policy
--     grant execute on function public.<fn>(<args>) to anon, authenticated;
-- Existing objects are unaffected - default privileges only apply at CREATE.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
-- (supabase_admin's defaults still grant ALL; postgres is not a member of that
--  role and cannot alter them. Only objects supabase_admin itself creates.)

-- ===========================================================================
-- PART 4 - two live bugs the audit surfaced. Both are the house failure mode:
-- an RLS denial the client swallows, so the UI reports success and no row lands.
-- ===========================================================================

-- Nobody could delete their own comment. Detail.js:527 fires the delete;
-- comments had SELECT/INSERT/UPDATE policies and no DELETE policy, so RLS
-- removed zero rows, PostgREST answered 204, and .then(()=>{},()=>{}) saw
-- nothing wrong.
create policy comments_delete_own on public.comments
  for delete to authenticated
  using (auth.uid() = user_id);

-- Signed-in users could not join the uncovered-city waitlist: the policy was
-- scoped to {anon}, but CityGate.js:61 and home.js:456 both run in the browser
-- for signed-in visitors too. CityGate catches the error and sets phase
-- "listed" anyway - the user is told they are on the list while the insert is
-- refused. wf_waitlist is the demand signal behind wf_expansion_demand, so each
-- refused row was a lost email AND a lost vote on which metro gets built next.
alter policy wf_waitlist_insert on public.wf_waitlist to anon, authenticated;

-- ===========================================================================
-- VERIFIED 2026-08-25 against the live REST API with the real publishable key,
-- control as well as happy path:
--   BLOCKED  GET  wf_affiliate_worklist              -> 401 42501
--   BLOCKED  POST rpc/wf_promotion_enqueue_by_score  -> 401 42501
--   BLOCKED  POST rpc/wf_atlas_missing               -> 404 PGRST202 (hidden)
--   BLOCKED  POST wf_deals / wf_inventory, DELETE wf_inventory -> 401 42501
--   WORKS    wf_best_picks, wf_things_to_do, wf_buzz_picks, wf_nearest_beaches,
--            wf_cuisine_chips, wf_quality10, and reads of wf_inventory,
--            wf_editorial, wf_experiences, wf_beach_water, wf_beach_water_geo,
--            wf_place_popularity_scored, wf_deals, wf_events, wf_hero_images,
--            wf_core_metros, wf_blog_posts, shared_lists, offers, comments
--   CONTROL  wf_gate_status Parrish -> "live"; Fairbanks -> "alert"
--   SERVICE  service_role kept full DML on 60/60 tables and EXECUTE on 16/16
--            revoked functions - no cron path touched.
-- ===========================================================================
