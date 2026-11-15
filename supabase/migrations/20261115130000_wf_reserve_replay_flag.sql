-- A retried booking (same user + idempotency key) returns the saved booking with 'replayed': true, so the API
-- sends its confirmation notice once, on the call that created the row, never again on a retry (2026-11-15).
-- Rewrites only the three "existing booking" returns in each function, from the live definition, and asserts
-- exactly three per function. Re-running is a no-op once the flag is present.
do $mig$
declare
  fn text;
  def text;
  old_ret constant text := $q$jsonb_build_object('ok', true, 'booking', to_jsonb(existing) || jsonb_build_object('restaurant_name', pt.name, 'restaurant_phone', pt.phone))$q$;
  new_ret constant text := $q$jsonb_build_object('ok', true, 'replayed', true, 'booking', to_jsonb(existing) || jsonb_build_object('restaurant_name', pt.name, 'restaurant_phone', pt.phone))$q$;
  n int;
begin
  foreach fn in array array[
    'public.wf_reserve_book(text,uuid,date,time without time zone,integer,text,text,text,boolean,uuid)',
    'public.wf_reserve_request(text,uuid,date,time without time zone,integer,text,text,text,boolean,uuid)'
  ] loop
    def := pg_get_functiondef(fn::regprocedure);
    if position(new_ret in def) > 0 and position(old_ret in def) = 0 then
      continue;
    end if;
    n := (length(def) - length(replace(def, old_ret, ''))) / length(old_ret);
    if n <> 3 then
      raise exception 'wf_reserve_replay_flag: expected 3 replay returns in %, found %', fn, n;
    end if;
    execute replace(def, old_ret, new_ret);
  end loop;
end
$mig$;
