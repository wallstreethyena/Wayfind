-- Retry used to save only issues/verified, losing the newly researched prose.
-- Additive, service-role-only RPC; existing callers of the old function remain
-- intact. Content, lifecycle, and the persisted outcome now share one UPDATE.
create or replace function public.wf_editorial_record_attempt_content(p_row jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  candidate public.wf_editorial;
  saved public.wf_editorial;
begin
  if jsonb_typeof(p_row) is distinct from 'object'
     or coalesce(btrim(p_row->>'place_id'), '') = ''
     or jsonb_typeof(p_row->'verified') is distinct from 'boolean' then
    raise exception 'Invalid editorial retry row';
  end if;
  candidate := jsonb_populate_record(null::public.wf_editorial, p_row);
  if candidate.verified and (
    coalesce(cardinality(candidate.issues), 0) > 0
    or coalesce(length(btrim(candidate.hook)), 0) < 20
    or coalesce(length(btrim(candidate.why_here)), 0) < 120
    or jsonb_typeof(candidate.facts) is distinct from 'array'
  ) then raise exception 'Editorial retry failed content gate'; end if;
  if candidate.verified and not exists (
    select 1 from jsonb_array_elements(candidate.facts) f
    where coalesce(btrim(f->>'claim'), '') <> ''
      and jsonb_typeof(f->'source') = 'string'
      and f->>'source' ~ '^https?://'
  ) then raise exception 'Editorial retry has no sourced facts'; end if;
  update public.wf_editorial e set
    hook = case when candidate.verified then candidate.hook else e.hook end,
    why_here = case when candidate.verified then candidate.why_here else e.why_here end,
    know_before = case when candidate.verified then candidate.know_before else e.know_before end,
    best_time = case when candidate.verified then candidate.best_time else e.best_time end,
    local_tip = case when candidate.verified then candidate.local_tip else e.local_tip end,
    facts = case when candidate.verified then candidate.facts else e.facts end,
    standard_version = case when candidate.verified then candidate.standard_version else e.standard_version end,
    verified = candidate.verified,
    issues = candidate.issues,
    attempt_count = e.attempt_count + 1,
    last_attempted_at = now(),
    written_at = case when candidate.verified then now() else e.written_at end
  where e.place_id = candidate.place_id and e.verified is not true
  returning e.* into saved;
  if not found then
    return jsonb_build_object('updated', 0, 'published', 0);
  end if;
  -- Existing content constraints and servability triggers remain authoritative.
  return jsonb_build_object('updated', 1, 'published', case when saved.verified then 1 else 0 end);
end;
$function$;
revoke all on function public.wf_editorial_record_attempt_content(jsonb) from public, anon, authenticated;
grant execute on function public.wf_editorial_record_attempt_content(jsonb) to service_role;
