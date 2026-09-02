-- 20260902_wf_inventory_preserve_signals.sql — OWNED FACTS ARE PERMANENT.
-- Owner directive 2026-09-02: a price (or rating/review count/photo) the library
-- already holds must never be erased by a later write that merely lacks it.
-- The promotion upsert (Prefer: resolution=merge-duplicates) replaces the whole
-- `signals` jsonb; a Pro-tier row written over an older full-mask row would
-- silently drop price. This trigger makes "never blank" a DATABASE law, not a
-- per-script convention: a non-null value survives any UPDATE that would set it
-- to null/absent. Legit non-null -> non-null changes pass through untouched.
-- APPLIED LIVE 2026-09-02 (project gbhtoehdxkzjsmmkisgu) and proven in a rolled-back
-- transaction: an UPDATE setting signals to {"rating":null,"types":[...]} left
-- priceNum=2 and rating=4.6 intact while types passed through.
create or replace function public.wf_inventory_preserve_signals()
returns trigger
language plpgsql
as $$
declare
  k text;
  keep jsonb := '{}'::jsonb;
begin
  foreach k in array array['price','priceNum','rating','reviews'] loop
    if (OLD.signals ? k) and (OLD.signals->>k) is not null
       and (NEW.signals is null or not (NEW.signals ? k) or (NEW.signals->>k) is null) then
      keep := keep || jsonb_build_object(k, OLD.signals->k);
    end if;
  end loop;
  if keep <> '{}'::jsonb then
    NEW.signals := coalesce(NEW.signals, '{}'::jsonb) || keep;
  end if;
  if NEW.photo_ref is null and OLD.photo_ref is not null then
    NEW.photo_ref := OLD.photo_ref;
  end if;
  return NEW;
end
$$;

drop trigger if exists wf_inventory_preserve_signals_trg on public.wf_inventory;
create trigger wf_inventory_preserve_signals_trg
before update on public.wf_inventory
for each row execute function public.wf_inventory_preserve_signals();

comment on function public.wf_inventory_preserve_signals() is
  'BEFORE UPDATE on wf_inventory: carries forward non-null signals.price/priceNum/rating/reviews and photo_ref when an incoming write would null or omit them. Owner law 2026-09-02: owned facts are permanent.';
