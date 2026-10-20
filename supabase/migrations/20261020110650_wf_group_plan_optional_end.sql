-- Optional-end follow-up to the group-planning schema introduced in #1636.
-- Prepared locally with Supabase CLI; NOT applied to any hosted database.
-- Apply only through scripts/apply-migration.mjs with approval and reconciliation.
-- Existing schema-v1 plans and explicit intervals need no rewrite. A missing
-- end stays unknown; bound starts independently so SQL NULL cannot skip 90 days.
-- Preserve server-only access, INVOKER privileges, CAS and notification behavior.
begin;

create or replace function public.wf_group_plan_create(p_state jsonb,p_invite_secret text,p_create_key uuid,p_email_consent boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare row public.wf_group_plans; owner uuid; made timestamptz; due timestamptz;
begin
  owner := (p_state->>'ownerId')::uuid;
  -- Serialize this owner's creation cap and idempotency check.
  perform pg_advisory_xact_lock(hashtextextended(owner::text,32491));
  select * into row from public.wf_group_plans where owner_id=owner and create_key=p_create_key;
  if found then return to_jsonb(row); end if;
  if (select count(*) from public.wf_group_plans where owner_id=owner and created_at>clock_timestamp()-interval '1 hour')>=10 then
    return jsonb_build_object('error','rate_limited');
  end if;
  made := (p_state->>'createdAt')::timestamptz;
  due := (p_state->>'deadline')::timestamptz;
  if p_state->>'status'<>'draft' or (p_state->>'revision')::int<>1
     or abs(extract(epoch from clock_timestamp()-made))>60
     or due<=clock_timestamp() or due>clock_timestamp()+interval '14 days'
     or exists(select 1 from jsonb_array_elements(p_state->'times') t where
       t->>'startsAt' is null or (t->>'startsAt')::timestamptz<=due
       or (t->>'startsAt')::timestamptz>clock_timestamp()+interval '90 days'
       or (t->>'endsAt' is not null and (
         (t->>'endsAt')::timestamptz<=(t->>'startsAt')::timestamptz
         or (t->>'endsAt')::timestamptz>clock_timestamp()+interval '90 days')))
     or exists(select 1
       from jsonb_array_elements(p_state->'times') with ordinality a(t,i)
       cross join jsonb_array_elements(p_state->'times') with ordinality b(t,i)
       where a.i<b.i and (
         (a.t->>'startsAt')::timestamptz=(b.t->>'startsAt')::timestamptz
         or ((a.t->>'startsAt')::timestamptz<=(b.t->>'startsAt')::timestamptz
           and (b.t->>'startsAt')::timestamptz<(a.t->>'endsAt')::timestamptz)
         or ((b.t->>'startsAt')::timestamptz<=(a.t->>'startsAt')::timestamptz
           and (a.t->>'startsAt')::timestamptz<(b.t->>'endsAt')::timestamptz))) then
    return jsonb_build_object('error','invalid_plan');
  end if;
  insert into public.wf_group_plans(id,owner_id,create_key,revision,status,deadline,created_at,expires_at,invite_secret,email_consent,state)
  values((p_state->>'id')::uuid,owner,p_create_key,1,'draft',due,made,made+interval '120 days',p_invite_secret,coalesce(p_email_consent,false),p_state)
  returning * into row;
  return to_jsonb(row);
end $$;

revoke all on function public.wf_group_plan_create(jsonb,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.wf_group_plan_create(jsonb,text,uuid,boolean) to service_role;

commit;
