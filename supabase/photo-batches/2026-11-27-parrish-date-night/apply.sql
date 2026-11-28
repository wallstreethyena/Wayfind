-- Apply after every cover in the manifest is deployed and responds as an image.
begin;
-- Restaurant iDalia
update public.wf_inventory as i
set signals = coalesce(i.signals, '{}'::jsonb) || jsonb_build_object(
  'photos', '["https://www.gowayfind.com/place-photos/batch-2026-11-27-parrish-date-night/ChIJ0enaRRklw4gRbih-Q1wLFok/cover.webp"]'::jsonb,
  'photo_gallery', '[{"url":"https://www.gowayfind.com/place-photos/batch-2026-11-27-parrish-date-night/ChIJ0enaRRklw4gRbih-Q1wLFok/cover.webp","bytes":140288,"sha256":"5d1a85422c1c1ed8d60d3f9726ea8e05e8f2c4c0f67bceeea4a7c049593f544d","width":851,"height":1280,"source":"official_website","license":"Courtesy of venue","source_ref":"https://www.idaliaeats.com/gallery","author":"Restaurant iDalia","title":"Restaurant iDalia dining room in Parrish","storage_path":null,"attribution_url":"https://www.idaliaeats.com/gallery","attribution_text":"Photo: Restaurant iDalia","original_url":"https://le-cdn.hibuwebsites.com/573f4ee6f9cf4a53bb1497f0620bf953/dms3rep/multi/opt/Interior-1920w.jpg"}]'::jsonb)
where i.place_id = 'ChIJ0enaRRklw4gRbih-Q1wLFok' and i.status = 'OPERATIONAL' and not coalesce(i.excluded, false)
  and not (coalesce(i.signals, '{}'::jsonb) ?| array['photos', 'photo_gallery'])
  and coalesce(nullif(i.signals->>'photo_url', ''), nullif(i.signals->>'photoUrl', ''), nullif(i.signals->>'photo', '')) is null
  and not exists (select 1 from public.wf_google_photo_store g where g.place_id = i.place_id and g.state in ('ready', 'removed'))
  and not exists (select 1 from public.wf_place_photo p where p.place_id = i.place_id and p.status = 'active')
returning i.place_id, i.name;
-- OSAKA Sushi & Grill
update public.wf_inventory as i
set signals = coalesce(i.signals, '{}'::jsonb) || jsonb_build_object(
  'photos', '["https://www.gowayfind.com/place-photos/batch-2026-11-27-parrish-date-night/ChIJeynD5C0lw4gRLd7l0-FF988/cover.webp"]'::jsonb,
  'photo_gallery', '[{"url":"https://www.gowayfind.com/place-photos/batch-2026-11-27-parrish-date-night/ChIJeynD5C0lw4gRLd7l0-FF988/cover.webp","bytes":77678,"sha256":"76f20a6b7aeca095a34494e2074864ce18b6caf44019f87e1f89d69461c5e56d","width":542,"height":640,"source":"official_website","license":"Courtesy of venue","source_ref":"https://order.osakaparrish.com/","author":"OSAKA Sushi & Grill","title":"Dragon Roll from Osaka Sushi & Grill''s Parrish ordering menu","storage_path":null,"attribution_url":"https://order.osakaparrish.com/","attribution_text":"Photo: OSAKA Sushi & Grill","original_url":"https://images.honor.jxtcloud.cn/9412126091_1760479529391.png"}]'::jsonb)
where i.place_id = 'ChIJeynD5C0lw4gRLd7l0-FF988' and i.status = 'OPERATIONAL' and not coalesce(i.excluded, false)
  and not (coalesce(i.signals, '{}'::jsonb) ?| array['photos', 'photo_gallery'])
  and coalesce(nullif(i.signals->>'photo_url', ''), nullif(i.signals->>'photoUrl', ''), nullif(i.signals->>'photo', '')) is null
  and not exists (select 1 from public.wf_google_photo_store g where g.place_id = i.place_id and g.state in ('ready', 'removed'))
  and not exists (select 1 from public.wf_place_photo p where p.place_id = i.place_id and p.status = 'active')
returning i.place_id, i.name;
-- Mizu Sushi & Hibachi Express
update public.wf_inventory as i
set signals = coalesce(i.signals, '{}'::jsonb) || jsonb_build_object(
  'photos', '["https://www.gowayfind.com/place-photos/batch-2026-11-27-parrish-date-night/ChIJmQoo1qo7w4gR9XNE9oEQpec/cover.webp"]'::jsonb,
  'photo_gallery', '[{"url":"https://www.gowayfind.com/place-photos/batch-2026-11-27-parrish-date-night/ChIJmQoo1qo7w4gR9XNE9oEQpec/cover.webp","bytes":37642,"sha256":"7c6259ce3624aabccb63fceb6269673fca502ef9a5813c931045764629e02b3d","width":518,"height":274,"source":"official_website","license":"Courtesy of venue","source_ref":"https://mizusushihibachiexpress.fronteats.com/","author":"Mizu Sushi & Hibachi Express","title":"Sushi and sashimi pictured on Mizu''s Bradenton ordering page","storage_path":null,"attribution_url":"https://mizusushihibachiexpress.fronteats.com/","attribution_text":"Photo: Mizu Sushi & Hibachi Express","original_url":"https://s3.us-east-2.amazonaws.com/www.posbee.com/common-files/1761876956578_0.37.png"}]'::jsonb)
where i.place_id = 'ChIJmQoo1qo7w4gR9XNE9oEQpec' and i.status = 'OPERATIONAL' and not coalesce(i.excluded, false)
  and not (coalesce(i.signals, '{}'::jsonb) ?| array['photos', 'photo_gallery'])
  and coalesce(nullif(i.signals->>'photo_url', ''), nullif(i.signals->>'photoUrl', ''), nullif(i.signals->>'photo', '')) is null
  and not exists (select 1 from public.wf_google_photo_store g where g.place_id = i.place_id and g.state in ('ready', 'removed'))
  and not exists (select 1 from public.wf_place_photo p where p.place_id = i.place_id and p.status = 'active')
returning i.place_id, i.name;
-- Sixty East Italian Cucina & Martini Bar
update public.wf_inventory as i
set signals = coalesce(i.signals, '{}'::jsonb) || jsonb_build_object(
  'photos', '["https://www.gowayfind.com/place-photos/batch-2026-11-27-parrish-date-night/ChIJBV_Rwcw8w4gRhW_wUsV5PB0/cover.webp"]'::jsonb,
  'photo_gallery', '[{"url":"https://www.gowayfind.com/place-photos/batch-2026-11-27-parrish-date-night/ChIJBV_Rwcw8w4gRhW_wUsV5PB0/cover.webp","bytes":122806,"sha256":"e9c8e3f3cf11b199900e6ad1dfafc3520c75612c1a608468d8b4addb18f9d43e","width":1280,"height":854,"source":"official_website","license":"Courtesy of venue","source_ref":"https://www.60eastellenton.com/","author":"Sixty East Italian Cucina & Martini Bar","title":"Sixty East''s martini bar in Ellenton","storage_path":null,"attribution_url":"https://www.60eastellenton.com/","attribution_text":"Photo: Sixty East Italian Cucina & Martini Bar","original_url":"https://images.squarespace-cdn.com/content/v1/5955768c72af65573f30cf61/1775155411745-WNPT7LQ7HCC4YUFN2MU0/60Enight.jpg"}]'::jsonb)
where i.place_id = 'ChIJBV_Rwcw8w4gRhW_wUsV5PB0' and i.status = 'OPERATIONAL' and not coalesce(i.excluded, false)
  and not (coalesce(i.signals, '{}'::jsonb) ?| array['photos', 'photo_gallery'])
  and coalesce(nullif(i.signals->>'photo_url', ''), nullif(i.signals->>'photoUrl', ''), nullif(i.signals->>'photo', '')) is null
  and not exists (select 1 from public.wf_google_photo_store g where g.place_id = i.place_id and g.state in ('ready', 'removed'))
  and not exists (select 1 from public.wf_place_photo p where p.place_id = i.place_id and p.status = 'active')
returning i.place_id, i.name;
-- Mitaka Ramen
update public.wf_inventory as i
set signals = coalesce(i.signals, '{}'::jsonb) || jsonb_build_object(
  'photos', '["https://www.gowayfind.com/place-photos/batch-2026-11-27-parrish-date-night/ChIJQTtGaHo9w4gR0ofXsseTDNQ/cover.webp"]'::jsonb,
  'photo_gallery', '[{"url":"https://www.gowayfind.com/place-photos/batch-2026-11-27-parrish-date-night/ChIJQTtGaHo9w4gR0ofXsseTDNQ/cover.webp","bytes":79626,"sha256":"aab318af4bc6f1066461096a38808c853f307d866eef034a575cac2191336934","width":1024,"height":576,"source":"official_website","license":"Courtesy of venue","source_ref":"https://www.mitakaramenhouse.com/gallery/","author":"Mitaka Ramen","title":"Ramen from the Ellenton restaurant''s gallery","storage_path":null,"attribution_url":"https://www.mitakaramenhouse.com/gallery/","attribution_text":"Photo: Mitaka Ramen","original_url":"https://website-cdn.menusifu.com/wp-content/uploads/mitakaramenhouse.com/2023/09/415be57f-6f5c-4db7-aedd-918d84dc379f.jpg"}]'::jsonb)
where i.place_id = 'ChIJQTtGaHo9w4gR0ofXsseTDNQ' and i.status = 'OPERATIONAL' and not coalesce(i.excluded, false)
  and not (coalesce(i.signals, '{}'::jsonb) ?| array['photos', 'photo_gallery'])
  and coalesce(nullif(i.signals->>'photo_url', ''), nullif(i.signals->>'photoUrl', ''), nullif(i.signals->>'photo', '')) is null
  and not exists (select 1 from public.wf_google_photo_store g where g.place_id = i.place_id and g.state in ('ready', 'removed'))
  and not exists (select 1 from public.wf_place_photo p where p.place_id = i.place_id and p.status = 'active')
returning i.place_id, i.name;
-- Migi Sushi Restaurant
update public.wf_inventory as i
set signals = coalesce(i.signals, '{}'::jsonb) || jsonb_build_object(
  'photos', '["https://www.gowayfind.com/place-photos/batch-2026-11-27-parrish-date-night/ChIJyWPn9u09w4gRUJLQ-QZdmbU/cover.webp"]'::jsonb,
  'photo_gallery', '[{"url":"https://www.gowayfind.com/place-photos/batch-2026-11-27-parrish-date-night/ChIJyWPn9u09w4gRUJLQ-QZdmbU/cover.webp","bytes":50918,"sha256":"988895fc8e49cd1ae0f46e1e0c30563446ab246b66c3766fc3fb11b8e36938cf","width":680,"height":453,"source":"official_website","license":"Courtesy of venue","source_ref":"https://www.migisushibradenton.com/","author":"Migi Sushi Restaurant","title":"Sashimi pictured on Migi Sushi''s Bradenton website","storage_path":null,"attribution_url":"https://www.migisushibradenton.com/","attribution_text":"Photo: Migi Sushi Restaurant","original_url":"https://www.migisushibradenton.com/images/banner02.jpg"}]'::jsonb)
where i.place_id = 'ChIJyWPn9u09w4gRUJLQ-QZdmbU' and i.status = 'OPERATIONAL' and not coalesce(i.excluded, false)
  and not (coalesce(i.signals, '{}'::jsonb) ?| array['photos', 'photo_gallery'])
  and coalesce(nullif(i.signals->>'photo_url', ''), nullif(i.signals->>'photoUrl', ''), nullif(i.signals->>'photo', '')) is null
  and not exists (select 1 from public.wf_google_photo_store g where g.place_id = i.place_id and g.state in ('ready', 'removed'))
  and not exists (select 1 from public.wf_place_photo p where p.place_id = i.place_id and p.status = 'active')
returning i.place_id, i.name;
-- Rice Bowl Asian House
update public.wf_inventory as i
set signals = coalesce(i.signals, '{}'::jsonb) || jsonb_build_object(
  'photos', '["https://www.gowayfind.com/place-photos/batch-2026-11-27-parrish-date-night/ChIJD9LRCvw7w4gRo7b8Ih_JRWU/cover.webp"]'::jsonb,
  'photo_gallery', '[{"url":"https://www.gowayfind.com/place-photos/batch-2026-11-27-parrish-date-night/ChIJD9LRCvw7w4gRo7b8Ih_JRWU/cover.webp","bytes":96552,"sha256":"3d7b6b9a9f2e2dbbc2998035e7a1d67847fe785e0db4deb28a28505c9c65c4f5","width":800,"height":800,"source":"official_website","license":"Courtesy of venue","source_ref":"https://ricebowlasianhousefl.kwickmenu.com/","author":"Rice Bowl Asian House","title":"Spicy Bourbon from Rice Bowl Asian House''s Bradenton ordering menu","storage_path":null,"attribution_url":"https://ricebowlasianhousefl.kwickmenu.com/","attribution_text":"Photo: Rice Bowl Asian House","original_url":"https://ricebowlasianhousefl.kwickmenu.com/img/263.jpg"}]'::jsonb)
where i.place_id = 'ChIJD9LRCvw7w4gRo7b8Ih_JRWU' and i.status = 'OPERATIONAL' and not coalesce(i.excluded, false)
  and not (coalesce(i.signals, '{}'::jsonb) ?| array['photos', 'photo_gallery'])
  and coalesce(nullif(i.signals->>'photo_url', ''), nullif(i.signals->>'photoUrl', ''), nullif(i.signals->>'photo', '')) is null
  and not exists (select 1 from public.wf_google_photo_store g where g.place_id = i.place_id and g.state in ('ready', 'removed'))
  and not exists (select 1 from public.wf_place_photo p where p.place_id = i.place_id and p.status = 'active')
returning i.place_id, i.name;
-- Little Jo-To
update public.wf_inventory as i
set signals = coalesce(i.signals, '{}'::jsonb) || jsonb_build_object(
  'photos', '["https://www.gowayfind.com/place-photos/batch-2026-11-27-parrish-date-night/ChIJNZ0IJgw9w4gRdfGzDzSIuUw/cover.webp"]'::jsonb,
  'photo_gallery', '[{"url":"https://www.gowayfind.com/place-photos/batch-2026-11-27-parrish-date-night/ChIJNZ0IJgw9w4gRdfGzDzSIuUw/cover.webp","bytes":145784,"sha256":"5cc731bad81a9816a805b2ef477b5aac3628c978d51ba782a11e1a77a38325ee","width":1280,"height":960,"source":"official_website","license":"Courtesy of venue","source_ref":"https://littlejoto.com/","author":"Little Jo-To","title":"Little Jo-To''s dining room in Bradenton","storage_path":null,"attribution_url":"https://littlejoto.com/","attribution_text":"Photo: Little Jo-To","original_url":"https://img1.wsimg.com/isteam/ip/2ba17ab0-fbff-47b4-9d5f-15f61dab37c5/IMG_8711.jpg"}]'::jsonb)
where i.place_id = 'ChIJNZ0IJgw9w4gRdfGzDzSIuUw' and i.status = 'OPERATIONAL' and not coalesce(i.excluded, false)
  and not (coalesce(i.signals, '{}'::jsonb) ?| array['photos', 'photo_gallery'])
  and coalesce(nullif(i.signals->>'photo_url', ''), nullif(i.signals->>'photoUrl', ''), nullif(i.signals->>'photo', '')) is null
  and not exists (select 1 from public.wf_google_photo_store g where g.place_id = i.place_id and g.state in ('ready', 'removed'))
  and not exists (select 1 from public.wf_place_photo p where p.place_id = i.place_id and p.status = 'active')
returning i.place_id, i.name;
-- Fav's Italian Cucina
update public.wf_inventory as i
set signals = coalesce(i.signals, '{}'::jsonb) || jsonb_build_object(
  'photos', '["https://www.gowayfind.com/place-photos/batch-2026-11-27-parrish-date-night/ChIJ5S7Hkc0Xw4gRnHLY5tt-B_8/cover.webp"]'::jsonb,
  'photo_gallery', '[{"url":"https://www.gowayfind.com/place-photos/batch-2026-11-27-parrish-date-night/ChIJ5S7Hkc0Xw4gRnHLY5tt-B_8/cover.webp","bytes":93422,"sha256":"59bfe415a9de99396a0d2333f00434c0d1bb58e64ef80d5e8417c0457b78764d","width":900,"height":650,"source":"official_website","license":"Courtesy of venue","source_ref":"https://favsitaliancucina.com/","author":"Fav''s Italian Cucina","title":"Inside Fav''s Italian Cucina in downtown Bradenton","storage_path":null,"attribution_url":"https://favsitaliancucina.com/","attribution_text":"Photo: Fav''s Italian Cucina","original_url":"https://favsitaliancucina.com/wp/wp-content/uploads/2024/06/inside.jpg"}]'::jsonb)
where i.place_id = 'ChIJ5S7Hkc0Xw4gRnHLY5tt-B_8' and i.status = 'OPERATIONAL' and not coalesce(i.excluded, false)
  and not (coalesce(i.signals, '{}'::jsonb) ?| array['photos', 'photo_gallery'])
  and coalesce(nullif(i.signals->>'photo_url', ''), nullif(i.signals->>'photoUrl', ''), nullif(i.signals->>'photo', '')) is null
  and not exists (select 1 from public.wf_google_photo_store g where g.place_id = i.place_id and g.state in ('ready', 'removed'))
  and not exists (select 1 from public.wf_place_photo p where p.place_id = i.place_id and p.status = 'active')
returning i.place_id, i.name;
commit;
