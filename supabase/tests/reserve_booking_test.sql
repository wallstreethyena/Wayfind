-- Reserve a table: database tests for the five wf_reserve_* functions.
-- Self contained. Run AFTER 20261112191807_wf_reserve_partners_requests.sql is applied. Everything
-- happens inside one transaction that is ROLLED BACK, so nothing is left behind. A failed check
-- raises an exception that names it. Run as a role that may execute the functions (service_role
-- or the database owner). Seeds only rows whose place_id starts with 'tst-reserve-'.
begin;

create function pg_temp.t_check(cond boolean, msg text) returns void language plpgsql as $f$
begin
  if cond is not true then raise exception 'reserve_booking_test FAILED: %', msg; end if;
end $f$;

do $t$
declare
  d0 date := (now() at time zone 'America/New_York')::date;
  hrs jsonb := '{"sun":[["17:00","21:00"]],"mon":[["17:00","21:00"]],"tue":[["17:00","21:00"]],"wed":[["17:00","21:00"]],"thu":[["17:00","21:00"]],"fri":[["17:00","21:00"]],"sat":[["17:00","21:00"]]}';
  allday jsonb := '{"sun":[["00:00","23:45"]],"mon":[["00:00","23:45"]],"tue":[["00:00","23:45"]],"wed":[["00:00","23:45"]],"thu":[["00:00","23:45"]],"fri":[["00:00","23:45"]],"sat":[["00:00","23:45"]]}';
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid(); u4 uuid := gen_random_uuid();
  u5 uuid := gen_random_uuid(); u6 uuid := gen_random_uuid(); u7 uuid := gen_random_uuid(); u8 uuid := gen_random_uuid();
  u9 uuid := gen_random_uuid(); u10 uuid := gen_random_uuid(); u11 uuid := gen_random_uuid(); u12 uuid := gen_random_uuid();
  k1 uuid := gen_random_uuid();
  r jsonb; r2 jsonb; bid uuid; n int; slots_n int; st text;
  P constant text := 'tst-reserve-main';
begin
  insert into public.wf_reserve_partners (place_id, name, contact_email, phone, stage, capacity_covers, seating_minutes, lead_minutes, window_days, max_party, hours, closed_dates)
  values (P, 'Test Main', 'x@example.test', '(941) 555-0100', 'demo', 10, 90, 60, 60, 6, hrs, array[d0 + 5]),
         ('tst-reserve-allday', 'Test Allday', 'x@example.test', null, 'demo', 10, 90, 60, 60, 6, allday, '{}'),
         ('tst-reserve-closed', 'Test Closed', 'x@example.test', null, 'demo', 10, 90, 60, 60, 6, '{}', '{}'),
         ('tst-reserve-off', 'Test Off', 'x@example.test', null, 'live', 10, 90, 60, 60, 6, hrs, '{}');
  update public.wf_reserve_partners set active = false where place_id = 'tst-reserve-off';

  -- capacity math and the grid: 17:00 through 21:00 every 15 minutes is 17 slots
  select count(*) into slots_n from public.wf_reserve_slots(P, d0 + 3, 4);
  perform pg_temp.t_check(slots_n = 17, 'an empty day offers 17 quarter hour slots, got ' || slots_n);
  perform pg_temp.t_check(exists (select 1 from public.wf_reserve_slots(P, d0 + 3, 4) s where s.slot = '21:00'), 'last seating 21:00 is offered');
  perform pg_temp.t_check(not exists (select 1 from public.wf_reserve_slots(P, d0 + 3, 4) s where s.slot = '21:15'), '21:15 is after last seating');
  perform pg_temp.t_check(not exists (select 1 from public.wf_reserve_slots(P, d0 + 3, 7)), 'a party above max_party gets no slots');
  perform pg_temp.t_check(not exists (select 1 from public.wf_reserve_slots('tst-reserve-off', d0 + 3, 2)), 'an inactive partner gets no slots');
  perform pg_temp.t_check(not exists (select 1 from public.wf_reserve_slots(P, d0 + 5, 2)), 'a closed date gets no slots');
  perform pg_temp.t_check(not exists (select 1 from public.wf_reserve_slots('tst-reserve-closed', d0 + 3, 2)), 'a day missing from hours is closed');

  -- first booking: 6 guests at 18:00 holds [18:00, 19:30)
  r := public.wf_reserve_book(P, u1, d0 + 3, '18:00', 6, 'Gabe', 'window', '941-555-0199', false, k1);
  perform pg_temp.t_check((r ->> 'ok')::boolean and r -> 'booking' ->> 'status' = 'confirmed', 'first booking confirms: ' || r::text);
  perform pg_temp.t_check(r -> 'booking' ->> 'confirmation_code' ~ '^[A-HJKMNP-Z2-9]{6}$', 'confirmation code is 6 safe characters');
  perform pg_temp.t_check(r -> 'booking' -> 'guest_phone' = 'null'::jsonb and r -> 'booking' -> 'phone_consent_at' = 'null'::jsonb, 'phone is dropped without consent');
  perform pg_temp.t_check(r -> 'booking' ->> 'restaurant_phone' = '(941) 555-0100', 'result carries the restaurant phone');
  bid := (r -> 'booking' ->> 'id')::uuid;

  -- idempotent retry: same user and key returns the same row, creates nothing
  r2 := public.wf_reserve_book(P, u1, d0 + 3, '18:00', 6, 'Gabe', 'window', null, false, k1);
  select count(*) into n from public.wf_reserve_bookings where user_id = u1;
  perform pg_temp.t_check((r2 ->> 'ok')::boolean and (r2 -> 'booking' ->> 'id')::uuid = bid and n = 1, 'retry with the same key returns the first booking and adds no row');
  r2 := public.wf_reserve_book(P, u1, d0 + 3, '19:00', 2, 'Other', null, null, false, k1);
  perform pg_temp.t_check((r2 -> 'booking' ->> 'id')::uuid = bid and (r2 -> 'booking' ->> 'reserve_time')::time = '18:00', 'a retry returns the first booking unchanged even if the arguments differ');

  -- the same guest, same place and day, new key
  r2 := public.wf_reserve_book(P, u1, d0 + 3, '20:00', 2, 'Gabe', null, null, false, gen_random_uuid());
  perform pg_temp.t_check(r2 ->> 'code' = 'DUPLICATE', 'second booking at the same place and day is DUPLICATE: ' || r2::text);

  -- overlap math: party 5 does not fit beside 6 (11 > 10) while the windows overlap, and fits at 19:30
  perform pg_temp.t_check(not exists (select 1 from public.wf_reserve_slots(P, d0 + 3, 5) s where s.slot = '18:00'), 'overlapping slot at 18:00 is full for 5');
  perform pg_temp.t_check(not exists (select 1 from public.wf_reserve_slots(P, d0 + 3, 5) s where s.slot = '17:00'), '17:00 runs to 18:30 and overlaps, so it is full for 5');
  perform pg_temp.t_check(not exists (select 1 from public.wf_reserve_slots(P, d0 + 3, 5) s where s.slot = '19:15'), '19:15 still overlaps the 18:00 table');
  perform pg_temp.t_check(exists (select 1 from public.wf_reserve_slots(P, d0 + 3, 5) s where s.slot = '19:30'), '19:30 starts exactly when the 18:00 table ends, so it is open');
  perform pg_temp.t_check(exists (select 1 from public.wf_reserve_slots(P, d0 + 3, 4) s where s.slot = '18:00'), '6 + 4 = 10 fits exactly');

  -- fill the slot, then a full slot refuses
  r2 := public.wf_reserve_book(P, u2, d0 + 3, '18:00', 4, 'Ann', null, '941-555-0111', true, gen_random_uuid());
  perform pg_temp.t_check((r2 ->> 'ok')::boolean, 'a booking that exactly fills the slot succeeds');
  perform pg_temp.t_check(r2 -> 'booking' ->> 'guest_phone' = '941-555-0111' and r2 -> 'booking' -> 'phone_consent_at' <> 'null'::jsonb, 'phone is stored with consent');
  r2 := public.wf_reserve_book(P, u3, d0 + 3, '18:00', 1, 'Bo', null, null, false, gen_random_uuid());
  perform pg_temp.t_check(r2 ->> 'code' = 'SLOT_FULL', 'a full slot refuses: ' || r2::text);

  -- cancel frees room; a stranger cannot cancel; cancelling twice is unchanged
  r2 := public.wf_reserve_cancel(bid, 'guest', u3, null, null);
  perform pg_temp.t_check(r2 ->> 'code' = 'NOT_FOUND', 'another guest cannot cancel it');
  r2 := public.wf_reserve_cancel(bid, 'restaurant', null, 'tst-reserve-other', 'x');
  perform pg_temp.t_check(r2 ->> 'code' = 'NOT_FOUND', 'another restaurant cannot cancel it');
  r2 := public.wf_reserve_cancel(bid, 'nobody', u1, null, null);
  perform pg_temp.t_check(r2 ->> 'code' = 'INVALID_ACTOR', 'unknown actor is refused');
  r2 := public.wf_reserve_cancel(bid, 'guest', u1, null, 'plans changed');
  perform pg_temp.t_check((r2 ->> 'ok')::boolean and r2 -> 'booking' ->> 'status' = 'cancelled' and r2 -> 'booking' ->> 'cancelled_by' = 'guest', 'guest cancels own booking');
  r2 := public.wf_reserve_cancel(bid, 'guest', u1, null, 'again');
  perform pg_temp.t_check((r2 ->> 'ok')::boolean and r2 -> 'booking' ->> 'cancel_reason' = 'plans changed', 'cancelling twice returns it unchanged');
  r2 := public.wf_reserve_book(P, u3, d0 + 3, '18:00', 6, 'Bo', null, null, false, gen_random_uuid());
  perform pg_temp.t_check((r2 ->> 'ok')::boolean, 'a cancelled booking frees its room');

  -- other refusals
  perform pg_temp.t_check(public.wf_reserve_book(P, u4, d0 + 5, '18:00', 2, 'Cy', null, null, false, gen_random_uuid()) ->> 'code' = 'CLOSED', 'closed date is CLOSED');
  perform pg_temp.t_check(public.wf_reserve_book('tst-reserve-closed', u4, d0 + 3, '18:00', 2, 'Cy', null, null, false, gen_random_uuid()) ->> 'code' = 'CLOSED', 'a day with no hours is CLOSED');
  perform pg_temp.t_check(public.wf_reserve_book(P, u4, d0 + 3, '22:00', 2, 'Cy', null, null, false, gen_random_uuid()) ->> 'code' = 'CLOSED', 'a time after last seating is CLOSED');
  perform pg_temp.t_check(public.wf_reserve_book(P, u4, d0 + 61, '18:00', 2, 'Cy', null, null, false, gen_random_uuid()) ->> 'code' = 'OUT_OF_WINDOW', 'beyond window_days is OUT_OF_WINDOW');
  perform pg_temp.t_check(public.wf_reserve_book(P, u4, d0 - 1, '18:00', 2, 'Cy', null, null, false, gen_random_uuid()) ->> 'code' = 'OUT_OF_WINDOW', 'a past day is OUT_OF_WINDOW');
  perform pg_temp.t_check(public.wf_reserve_book(P, u4, d0 + 4, '18:00', 7, 'Cy', null, null, false, gen_random_uuid()) ->> 'code' = 'PARTY_TOO_LARGE', 'party above max_party');
  perform pg_temp.t_check(public.wf_reserve_book('tst-reserve-off', u4, d0 + 4, '18:00', 2, 'Cy', null, null, false, gen_random_uuid()) ->> 'code' = 'UNAVAILABLE', 'inactive partner is UNAVAILABLE');
  perform pg_temp.t_check(public.wf_reserve_book('tst-reserve-nobody', u4, d0 + 4, '18:00', 2, 'Cy', null, null, false, gen_random_uuid()) ->> 'code' = 'UNAVAILABLE', 'unknown partner is UNAVAILABLE');

  -- lead time: a time earlier this hour today is TOO_SOON, and no offered slot is inside the lead window
  r2 := public.wf_reserve_book('tst-reserve-allday', u4, (now() at time zone 'America/New_York')::date,
        date_trunc('hour', now() at time zone 'America/New_York')::time, 2, 'Cy', null, null, false, gen_random_uuid());
  perform pg_temp.t_check(r2 ->> 'code' in ('TOO_SOON', 'OUT_OF_WINDOW'), 'a time inside the lead window is TOO_SOON: ' || r2::text);
  perform pg_temp.t_check(not exists (
    select 1 from public.wf_reserve_slots('tst-reserve-allday', (now() at time zone 'America/New_York')::date, 2) s
    where (now() at time zone 'America/New_York')::date + s.slot < (now() at time zone 'America/New_York') + interval '60 minutes'), 'today offers no slot inside the lead window');

  -- limit: at most 3 upcoming bookings per guest
  perform public.wf_reserve_book('tst-reserve-allday', u5, d0 + 10, '18:00', 1, 'Di', null, null, false, gen_random_uuid());
  perform public.wf_reserve_book('tst-reserve-allday', u5, d0 + 11, '18:00', 1, 'Di', null, null, false, gen_random_uuid());
  perform public.wf_reserve_book('tst-reserve-allday', u5, d0 + 12, '18:00', 1, 'Di', null, null, false, gen_random_uuid());
  perform pg_temp.t_check(public.wf_reserve_book('tst-reserve-allday', u5, d0 + 13, '18:00', 1, 'Di', null, null, false, gen_random_uuid()) ->> 'code' = 'LIMIT', 'a fourth upcoming booking is LIMIT');

  -- propose, accept
  r := public.wf_reserve_book(P, u6, d0 + 20, '18:00', 6, 'Ed', null, null, false, gen_random_uuid());
  bid := (r -> 'booking' ->> 'id')::uuid;
  perform public.wf_reserve_book(P, u7, d0 + 20, '20:00', 6, 'Fay', null, null, false, gen_random_uuid());
  perform public.wf_reserve_book(P, u8, d0 + 20, '20:00', 4, 'Gus', null, null, false, gen_random_uuid());
  perform pg_temp.t_check(public.wf_reserve_propose(bid, 'tst-reserve-other', d0 + 20, '17:00') ->> 'code' = 'NOT_FOUND', 'another restaurant cannot propose');
  perform pg_temp.t_check(public.wf_reserve_propose(bid, P, d0 + 20, '20:00') ->> 'code' = 'SLOT_FULL', 'proposing a full slot is refused');
  perform pg_temp.t_check(public.wf_reserve_propose(bid, P, d0 + 20, '18:00') ->> 'code' = 'SAME_TIME', 'proposing the same time is refused');
  r2 := public.wf_reserve_propose(bid, P, d0 + 20, '17:00');
  perform pg_temp.t_check((r2 ->> 'ok')::boolean and r2 -> 'booking' ->> 'status' = 'proposed' and (r2 -> 'booking' ->> 'proposed_time')::time = '17:00', 'proposal to a slot with room is saved (its own seats are not counted)');
  perform pg_temp.t_check(not exists (select 1 from public.wf_reserve_slots(P, d0 + 20, 5) s where s.slot = '18:00'), 'a proposed booking still holds its CURRENT time');
  perform pg_temp.t_check(public.wf_reserve_respond_proposal(bid, u1, true) ->> 'code' = 'NOT_FOUND', 'only the guest can answer');
  r2 := public.wf_reserve_respond_proposal(bid, u6, true);
  perform pg_temp.t_check((r2 ->> 'ok')::boolean and r2 -> 'booking' ->> 'status' = 'confirmed' and (r2 -> 'booking' ->> 'reserve_time')::time = '17:00' and r2 -> 'booking' -> 'proposed_time' = 'null'::jsonb, 'accepting moves the booking and clears the proposal');
  perform pg_temp.t_check(public.wf_reserve_respond_proposal(bid, u6, true) ->> 'code' = 'NOT_PROPOSED', 'answering twice is NOT_PROPOSED');

  -- decline cancels
  r := public.wf_reserve_book(P, u9, d0 + 21, '18:00', 2, 'Hal', null, null, false, gen_random_uuid());
  bid := (r -> 'booking' ->> 'id')::uuid;
  perform public.wf_reserve_propose(bid, P, d0 + 21, '19:00');
  r2 := public.wf_reserve_respond_proposal(bid, u9, false);
  perform pg_temp.t_check((r2 ->> 'ok')::boolean and r2 -> 'booking' ->> 'status' = 'cancelled' and r2 -> 'booking' ->> 'cancelled_by' = 'guest' and r2 -> 'booking' ->> 'cancel_reason' = 'declined new time', 'declining cancels with the reason');
  perform pg_temp.t_check(public.wf_reserve_propose(bid, P, d0 + 21, '19:30') ->> 'code' = 'NOT_PROPOSABLE', 'a cancelled booking cannot be proposed');

  -- proposed slot fills up before the guest answers: SLOT_FULL and it stays proposed
  r := public.wf_reserve_book(P, u10, d0 + 22, '17:00', 2, 'Ivy', null, null, false, gen_random_uuid());
  bid := (r -> 'booking' ->> 'id')::uuid;
  perform pg_temp.t_check((public.wf_reserve_propose(bid, P, d0 + 22, '19:00') ->> 'ok')::boolean, 'proposal to an empty 19:00');
  perform public.wf_reserve_book(P, u11, d0 + 22, '19:00', 6, 'Jo', null, null, false, gen_random_uuid());
  perform public.wf_reserve_book(P, u12, d0 + 22, '19:00', 4, 'Kit', null, null, false, gen_random_uuid());
  r2 := public.wf_reserve_respond_proposal(bid, u10, true);
  perform pg_temp.t_check(r2 ->> 'code' = 'SLOT_FULL' and r2 -> 'booking' ->> 'status' = 'proposed', 'accepting a slot that filled up is SLOT_FULL and stays proposed');
  select status into st from public.wf_reserve_bookings where id = bid;
  perform pg_temp.t_check(st = 'proposed', 'the stored row is still proposed');

  -- a restaurant cancel needs the right place
  r2 := public.wf_reserve_cancel(bid, 'restaurant', null, P, 'kitchen closed');
  perform pg_temp.t_check((r2 ->> 'ok')::boolean and r2 -> 'booking' ->> 'cancelled_by' = 'restaurant' and r2 -> 'booking' ->> 'cancel_reason' = 'kitchen closed', 'restaurant cancels its own booking with a reason');

  -- the phone constraint holds even for direct inserts
  begin
    insert into public.wf_reserve_bookings (confirmation_code, place_id, user_id, guest_name, party_size, reserve_date, reserve_time, guest_phone, idempotency_key)
    values ('ZZZZZ2', P, gen_random_uuid(), 'X', 1, d0 + 30, '18:00', '941-555-0000', gen_random_uuid());
    raise exception 'reserve_booking_test FAILED: a phone without consent was stored';
  exception when check_violation then null;
  end;
end
$t$;

select 'reserve_booking_test: ok' as result;
rollback;
