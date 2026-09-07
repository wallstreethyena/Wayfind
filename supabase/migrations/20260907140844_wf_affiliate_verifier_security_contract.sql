CREATE OR REPLACE FUNCTION public.wf_verify_affiliate_links(p_limit integer DEFAULT 250, p_stale_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '240s'
AS $function$
declare
  r record; resp extensions.http_response; marker text; reached boolean; st int;
  d_seen int:=0; batch_limit int; stale_days int;
  d_ok int:=0; d_bad int:=0; e_ok int:=0; e_bad int:=0; neterr int:=0; e_seen int:=0;
begin
  -- NULL must never mean unlimited; one shared request budget covers both loops.
  batch_limit := least(250, greatest(0, coalesce(p_limit, 250)));
  stale_days := least(30, greatest(1, coalesce(p_stale_days, 7)));
  if not pg_catalog.pg_try_advisory_xact_lock(734821, 1) then
    return jsonb_build_object('skipped', true, 'reason', 'already_running');
  end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS','10000');

  -- Oldest deals first, leaving at least 200 of the default budget for experiences.
  for r in select id, affiliate_url as url, dest_url from public.wf_deals
    where active order by last_checked_at asc nulls first, id
    limit least(50, batch_limit)
  loop
    d_seen := d_seen + 1;
    marker := regexp_replace(coalesce(substring(coalesce(r.dest_url,'') from '://([^/]+)'),''), '^www\.', '');
    begin
      resp := extensions.http_get(r.url); st := coalesce(resp.status,0);
      reached := marker <> '' and (resp.content_type is null or resp.content_type not ilike 'image/%')
                 and position(marker in coalesce(resp.content,'')) > 0;
      if reached then
        update public.wf_deals set link_ok=true, http_status=st, last_checked_at=now(), fail_count=0 where id=r.id; d_ok:=d_ok+1;
      else
        update public.wf_deals set link_ok=false, http_status=st, last_checked_at=now(), fail_count=fail_count+1 where id=r.id; d_bad:=d_bad+1;
      end if;
    exception when others then
      update public.wf_deals set http_status=0, last_checked_at=now(), fail_count=fail_count+1,
        link_ok=case when fail_count+1>=2 then false else link_ok end where id=r.id; neterr:=neterr+1;
    end;
  end loop;

  -- EXPERIENCES: the stalest p_limit rows only. NULLS FIRST puts never-checked
  -- rows at the front, so a newly ingested product is verified on the next run
  -- rather than after a full sweep.
  for r in
    select product_url as url
      from public.wf_experiences
     where product_url is not null
       and (last_checked_at is null or last_checked_at < now() - make_interval(days => stale_days))
     order by last_checked_at asc nulls first
     limit (batch_limit - d_seen)
  loop
    e_seen := e_seen + 1;
    marker := regexp_replace(coalesce(substring(coalesce(r.url,'') from '://([^/]+)'),''), '^www\.', '');
    begin
      resp := extensions.http_get(r.url); st := coalesce(resp.status,0);
      reached := marker <> '' and (resp.content_type is null or resp.content_type not ilike 'image/%')
                 and position(marker in coalesce(resp.content,'')) > 0;
      if reached then
        update public.wf_experiences set link_ok=true, last_checked_at=now(), fail_count=0 where product_url=r.url; e_ok:=e_ok+1;
      else
        update public.wf_experiences set link_ok=false, last_checked_at=now(), fail_count=fail_count+1 where product_url=r.url; e_bad:=e_bad+1;
      end if;
    exception when others then
      update public.wf_experiences set last_checked_at=now(), fail_count=fail_count+1,
        link_ok=case when fail_count+1>=2 then false else link_ok end where product_url=r.url; neterr:=neterr+1;
    end;
  end loop;

  return jsonb_build_object(
    'deals_ok',d_ok,'deals_broken',d_bad,
    'exp_checked',e_seen,'exp_ok',e_ok,'exp_broken',e_bad,
    'network_errors',neterr,'batch_limit',batch_limit,'stale_days',stale_days,'deals_checked',d_seen,'ran_at',now());
end;
$function$;

REVOKE ALL ON FUNCTION public.wf_verify_affiliate_links(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wf_verify_affiliate_links(integer, integer) TO service_role;

-- Read-only production evidence. Covers every overload and actual inherited grants.
CREATE OR REPLACE FUNCTION public.wf_privileged_rpc_contract()
RETURNS TABLE (signature text, function_name text, security_definer boolean,
  anon_execute boolean, authenticated_execute boolean, service_execute boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT p.oid::pg_catalog.regprocedure::text, p.proname::text, p.prosecdef,
    pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE'),
    pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE'),
    pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prokind='f' AND p.proname LIKE 'wf\_%' ESCAPE '\';
$$;
REVOKE ALL ON FUNCTION public.wf_privileged_rpc_contract() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wf_privileged_rpc_contract() TO service_role;
