-- Wayfind Annual Giveaway 2026: run on Nov 1 in the Supabase SQL editor.
-- Entrants: signed-in accounts with 3+ DISTINCT shared items in the window.
with entries as (
  select user_id,
         count(distinct coalesce(place_id, meta->>'theme', meta->>'title')) as items
  from events
  where action = 'share'
    and user_id is not null
    and coalesce(meta->>'kind','') <> 'app'
    and created_at >= '2026-07-03' and created_at < '2026-11-01'
  group by user_id
  having count(distinct coalesce(place_id, meta->>'theme', meta->>'title')) >= 3
)
select user_id from entries order by random() limit 1;
-- To see the full entrant pool first: select * from entries order by items desc;
