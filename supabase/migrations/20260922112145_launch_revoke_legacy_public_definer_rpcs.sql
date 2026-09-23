
revoke all on function public.wf_register_push_token(text,text,text)
  from public, anon, authenticated;
grant execute on function public.wf_register_push_token(text,text,text)
  to service_role;

do $$
declare
  v_oid oid;
  v_def text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='wf_schema_audit'
    and pg_get_function_identity_arguments(p.oid)='';
  if v_oid is null then
    raise exception 'wf_schema_audit not found';
  end if;
  v_def := pg_get_functiondef(v_oid);
  v_def := replace(
    v_def,
    E'intentional_public_rpcs text[] := array[\n    ''wf_join_waitlist'', ''wf_log_coverage_gap'', ''wf_register_push_token''\n  ];',
    E'intentional_public_rpcs text[] := array[]::text[];'
  );
  if position('array[]::text[]' in v_def) = 0 then
    raise exception 'wf_schema_audit allowlist replacement did not apply';
  end if;
  execute v_def;
end $$;
