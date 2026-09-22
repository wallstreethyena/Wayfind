-- Applied to production 2026-09-22 as launch_push_server_registration_rpc.
-- Additive bridge for moving native push registration off an anonymous
-- SECURITY DEFINER endpoint. Only Wayfind's service role can call this function.
create or replace function public.wf_register_push_token_server(
  p_token text,
  p_platform text,
  p_device_id text,
  p_user_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tok text := btrim(coalesce(p_token, ''));
  v_dev text := nullif(btrim(coalesce(p_device_id, '')), '');
begin
  if length(v_tok) < 32 or length(v_tok) > 512 then
    raise exception 'wf_register_push_token_server: implausible token length %', length(v_tok);
  end if;
  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'wf_register_push_token_server: unsupported platform %', p_platform;
  end if;
  if v_dev is not null and length(v_dev) > 160 then
    raise exception 'wf_register_push_token_server: implausible device id length %', length(v_dev);
  end if;

  insert into public.device_push_tokens as t (token, platform, user_id, device_id, updated_at)
  values (v_tok, p_platform, p_user_id, v_dev, now())
  on conflict (token) do update
    set platform = excluded.platform,
        user_id = coalesce(excluded.user_id, t.user_id),
        device_id = coalesce(excluded.device_id, t.device_id),
        updated_at = now();

  begin
    insert into public.wf_job_pulse (job, attempted, succeeded, failed, note)
    values ('push_register', 1, 1, 0, p_platform);
  exception when others then
    null;
  end;
end;
$$;

revoke all on function public.wf_register_push_token_server(text,text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.wf_register_push_token_server(text,text,text,uuid)
  to service_role;
