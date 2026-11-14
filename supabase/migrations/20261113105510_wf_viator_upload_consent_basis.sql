-- 20261113105510_wf_viator_upload_consent_basis.sql
--
-- Owner-approved consent rule for Google Ads offline booking uploads
-- (2026-11-12): upload on an explicit GRANTED consent, or for a click made
-- OUTSIDE the EEA / UK / Switzerland (where Google's EU user consent policy
-- does not apply) when the browser sent no Global Privacy Control signal.
-- A denial, a GPC signal, an unknown country, or a covered region without
-- GRANTED consent all keep the booking out of Google.
--
-- The click stores only the resulting label (lib/adConsentRegion.js), never
-- the country. The label is copied onto the booking by wf_viator_reconcile and
-- replaces the old GRANTED-only test in its upload eligibility step.
--
-- Additive and forward-only: new nullable columns (NULL = recorded before this
-- rule, which keeps the old GRANTED-only test in both SQL and JS) plus an in-place,
-- assertion-guarded edit of the LIVE function body. If any anchor is missing
-- (the function drifted from the reviewed text) the migration raises and
-- changes nothing.
--
-- Rollback / forward-fix: the old behaviour is restored by replacing
-- `coalesce(v_current.upload_consent_basis, 'unknown_region') not in ('granted', 'not_required_region')`
-- with `coalesce(v_current.consent_ad_user_data, 'UNKNOWN') <> 'GRANTED'`;
-- the columns are harmless to leave in place.
-- RLS: no new table; both tables already have RLS enabled with no anon/auth policies.
-- Deployment order: apply this migration BEFORE the code that writes
-- upload_consent_basis (an insert naming an unknown column would fail and
-- fall back to the GRANTED-only path).

alter table public.wf_viator_clicks
  add column if not exists upload_consent_basis text;
alter table public.wf_viator_bookings
  add column if not exists upload_consent_basis text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wf_viator_clicks_upload_consent_basis_check') then
    alter table public.wf_viator_clicks add constraint wf_viator_clicks_upload_consent_basis_check
      check (upload_consent_basis is null or upload_consent_basis in ('granted', 'not_required_region', 'denied', 'gpc_opt_out', 'restricted_region_no_consent', 'unknown_region'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wf_viator_bookings_upload_consent_basis_check') then
    alter table public.wf_viator_bookings add constraint wf_viator_bookings_upload_consent_basis_check
      check (upload_consent_basis is null or upload_consent_basis in ('granted', 'not_required_region', 'denied', 'gpc_opt_out', 'restricted_region_no_consent', 'unknown_region'));
  end if;
end $$;

do $$
declare
  v_def text;
  v_old text;
  v_new text;
  a_cols text := E'        consent_ad_user_data, consent_ad_personalization,\n        gross_booking_value, estimated_commission, confirmed_commission, paid_commission,';
  b_cols text := E'        consent_ad_user_data, consent_ad_personalization,\n        upload_consent_basis,\n        gross_booking_value, estimated_commission, confirmed_commission, paid_commission,';
  a_vals text := E'        case when v_attr_status = ''matched'' and v_has_click then v_click.consent_ad_personalization else null end,\n        v_gross, v_estimated, v_confirmed, v_paid,';
  b_vals text := E'        case when v_attr_status = ''matched'' and v_has_click then v_click.consent_ad_personalization else null end,\n        case when v_attr_status = ''matched'' and v_has_click then v_click.upload_consent_basis else null end,\n        v_gross, v_estimated, v_confirmed, v_paid,';
  a_upd text := E'        consent_ad_personalization = coalesce(\n          public.wf_viator_bookings.consent_ad_personalization,\n          case when v_attr_status = ''matched'' and v_has_click then v_click.consent_ad_personalization else null end\n        ),';
  b_upd text := E'        consent_ad_personalization = coalesce(\n          public.wf_viator_bookings.consent_ad_personalization,\n          case when v_attr_status = ''matched'' and v_has_click then v_click.consent_ad_personalization else null end\n        ),\n        upload_consent_basis = coalesce(\n          public.wf_viator_bookings.upload_consent_basis,\n          case when v_attr_status = ''matched'' and v_has_click then v_click.upload_consent_basis else null end\n        ),';
  a_gate text := E'      elsif coalesce(v_current.consent_ad_user_data, ''UNKNOWN'') <> ''GRANTED'' then\n        v_elig_status := ''ineligible_missing_consent'';';
  b_gate text := E'      elsif coalesce(v_current.consent_ad_user_data, ''UNKNOWN'') = ''DENIED''\n            or coalesce(\n                 v_current.upload_consent_basis,\n                 case when v_current.consent_ad_user_data = ''GRANTED'' then ''granted'' else ''unknown_region'' end\n               ) not in (''granted'', ''not_required_region'') then\n        v_elig_status := ''ineligible_missing_consent'';';
  n int;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'wf_viator_reconcile';
  if v_def is null then
    raise exception 'wf_viator_reconcile not found';
  end if;
  if position('upload_consent_basis' in v_def) > 0 then
    raise notice 'wf_viator_reconcile already carries upload_consent_basis; nothing to do';
    return;
  end if;

  v_old := v_def;
  foreach v_new in array array[a_cols, a_vals, a_upd, a_gate] loop
    n := (length(v_def) - length(replace(v_def, v_new, ''))) / length(v_new);
    if n <> 1 then
      raise exception 'wf_viator_reconcile anchor found % times (expected 1): %', n, left(v_new, 120);
    end if;
  end loop;

  v_def := replace(v_def, a_cols, b_cols);
  v_def := replace(v_def, a_vals, b_vals);
  v_def := replace(v_def, a_upd, b_upd);
  v_def := replace(v_def, a_gate, b_gate);
  if v_def = v_old then
    raise exception 'wf_viator_reconcile unchanged after splice';
  end if;
  execute v_def;
end $$;
