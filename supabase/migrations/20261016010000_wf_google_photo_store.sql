-- Google-origin assets remain explicitly Google-origin, separate from the
-- permanently licensed wf_place_photo lane. No scheduled expiry or refill.
create table public.wf_google_photo_store (
  place_id text primary key check (place_id ~ '^[A-Za-z0-9_-]{10,}$'),
  state text not null check (state in ('pending','ready','failed','removed')),
  lease_token uuid,
  lease_until timestamptz,
  retry_after timestamptz,
  storage_path text,
  version text,
  credit jsonb,
  width integer,
  height integer,
  bytes integer,
  content_type text,
  updated_at timestamptz not null default now(),
  check (state <> 'ready' or (storage_path is not null and version is not null and credit is not null and width > 0 and height > 0 and bytes > 0))
);
alter table public.wf_google_photo_store enable row level security;
revoke all on public.wf_google_photo_store from public, anon, authenticated;
grant select on public.wf_google_photo_store to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('google-place-photos','google-place-photos',false,12582912,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;

create function public.wf_google_photo_store_claim(p_place_id text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare r public.wf_google_photo_store; t uuid;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise insufficient_privilege; end if;
  if p_place_id !~ '^[A-Za-z0-9_-]{10,}$' then raise invalid_parameter_value; end if;
  insert into public.wf_google_photo_store(place_id,state) values(p_place_id,'failed') on conflict do nothing;
  select * into r from public.wf_google_photo_store where place_id=p_place_id for update;
  if r.state='removed' then return jsonb_build_object('state','removed'); end if;
  if r.state='ready' then return jsonb_build_object('state','ready','row',to_jsonb(r)); end if;
  if (r.state='pending' and r.lease_until > now()) or r.retry_after > now() then
    return jsonb_build_object('state','pending');
  end if;
  t := gen_random_uuid();
  update public.wf_google_photo_store set state='pending',lease_token=t,lease_until=now()+interval '90 seconds',retry_after=null,updated_at=now() where place_id=p_place_id;
  return jsonb_build_object('state','claimed','token',t);
end $$;

create function public.wf_google_photo_store_complete(p_place_id text,p_token uuid,p_asset jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare r public.wf_google_photo_store;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise insufficient_privilege; end if;
  if coalesce(p_asset->>'version','') !~ '^[a-f0-9]{64}$' or coalesce(p_asset->>'storage_path','') <> (p_place_id||'/'||p_token::text||'/'||(p_asset->>'version'))
     or coalesce(p_asset->>'content_type','') not in ('image/jpeg','image/png','image/webp')
     or coalesce(jsonb_typeof(p_asset->'credit'),'') <> 'object'
     or coalesce((p_asset->>'width')::integer,0) <= 0 or coalesce((p_asset->>'height')::integer,0) <= 0
     or coalesce((p_asset->>'bytes')::integer,0) not between 1 and 12582912
     or (p_asset->>'width')::bigint*(p_asset->>'height')::bigint > 40000000 then raise invalid_parameter_value; end if;
  update public.wf_google_photo_store set state='ready',storage_path=p_asset->>'storage_path',version=p_asset->>'version',credit=p_asset->'credit',
    width=(p_asset->>'width')::integer,height=(p_asset->>'height')::integer,bytes=(p_asset->>'bytes')::integer,content_type=p_asset->>'content_type',
    lease_token=null,lease_until=null,retry_after=null,updated_at=now()
    where place_id=p_place_id and state='pending' and lease_token=p_token and lease_until>now()
    returning * into r;
  if not found then return jsonb_build_object('state','conflict'); end if;
  return jsonb_build_object('state','ready','row',to_jsonb(r));
end $$;

create function public.wf_google_photo_store_fail(p_place_id text,p_token uuid) returns boolean
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise insufficient_privilege; end if;
  update public.wf_google_photo_store set state='failed',lease_token=null,lease_until=null,retry_after=now()+interval '60 seconds',updated_at=now()
    where place_id=p_place_id and state='pending' and lease_token=p_token;
  return found;
end $$;

create function public.wf_google_photo_store_remove(p_place_id text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare r public.wf_google_photo_store;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise insufficient_privilege; end if;
  if p_place_id !~ '^[A-Za-z0-9_-]{10,}$' then raise invalid_parameter_value; end if;
  insert into public.wf_google_photo_store(place_id,state) values(p_place_id,'removed') on conflict do nothing;
  select * into r from public.wf_google_photo_store where place_id=p_place_id for update;
  -- Retain the private object key for safe cleanup retries. State=removed
  -- revokes delivery immediately and invalidates every outstanding token.
  update public.wf_google_photo_store set state='removed',lease_token=null,lease_until=null,retry_after=null,version=null,credit=null,updated_at=now() where place_id=p_place_id;
  return jsonb_build_object('state','removed','storage_path',r.storage_path);
end $$;

revoke all on function public.wf_google_photo_store_claim(text) from public,anon,authenticated;
revoke all on function public.wf_google_photo_store_complete(text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.wf_google_photo_store_fail(text,uuid) from public,anon,authenticated;
revoke all on function public.wf_google_photo_store_remove(text) from public,anon,authenticated;
grant execute on function public.wf_google_photo_store_claim(text) to service_role;
grant execute on function public.wf_google_photo_store_complete(text,uuid,jsonb) to service_role;
grant execute on function public.wf_google_photo_store_fail(text,uuid) to service_role;
grant execute on function public.wf_google_photo_store_remove(text) to service_role;
