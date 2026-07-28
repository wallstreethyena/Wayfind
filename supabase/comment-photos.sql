-- Community-take photos + longer reviews (v6.54). Paste into the Supabase SQL
-- editor and run once, same as supabase/comments.sql (the original table).
--
-- Owner: "the review is capped on characters we should be able to allow the
-- user to have more characters and write it longer" + "allow the user to
-- also post pictures on the review." Two changes, both non-destructive:
--   1. A generous, explicit length cap on `body` (4000 chars — the old cap
--      was a client-side-only `.slice(0, 600)` with no DB backstop at all).
--   2. A `photos` column: an array of Supabase Storage PATHS (not full URLs
--      — a path survives a bucket/project URL change and needs no parsing to
--      delete), capped at 4 per post.
--
-- Community takes post straight from the browser to Supabase using the
-- signed-in user's own session (no server route in between — see
-- app/components/sheets/Detail.js). That means a client-side character/photo
-- cap alone is trivially bypassed by anyone calling the REST API directly
-- with a valid token, so the REAL enforcement has to live here, as CHECK
-- constraints — the app's own caps just keep a normal user from ever seeing
-- something accepted client-side and then silently rejected by the database.

alter table public.comments add column if not exists photos jsonb not null default '[]'::jsonb;

do $$ begin
  alter table public.comments add constraint comments_body_len check (char_length(body) <= 4000);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.comments add constraint comments_photos_len check (jsonb_array_length(photos) <= 4);
exception when duplicate_object then null;
end $$;

-- ── Storage: a public bucket for community-take photos ──────────────────────
-- Public READ (comments are already publicly readable — a photo attached to
-- one is no more sensitive than the text next to it) comes from the bucket
-- itself being `public` — Supabase serves public buckets' objects straight
-- off the public CDN URL (see getPublicUrl in Detail.js), which is NOT gated
-- by storage.objects RLS at all. A SELECT policy here would do nothing for
-- that read path; its only real effect is granting `list`/enumerate access
-- over the REST API, letting anyone walk every uploader's folder — flagged by
-- Supabase's own security advisor (public_bucket_allows_listing) the first
-- time this shipped, and removed rather than kept as unused surface area.
-- Authenticated users may only write/delete under their OWN user-id folder —
-- app code enforces this by construction (every upload path is
-- `${user.id}/...`, see uploadPendingPhotos in Detail.js), and these two
-- policies enforce it for real, independent of what the client sends.
insert into storage.buckets (id, name, public)
values ('comment-photos', 'comment-photos', true)
on conflict (id) do nothing;

drop policy if exists "own-folder insert comment photos" on storage.objects;
create policy "own-folder insert comment photos" on storage.objects
  for insert with check (
    bucket_id = 'comment-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own-folder delete comment photos" on storage.objects;
create policy "own-folder delete comment photos" on storage.objects
  for delete using (
    bucket_id = 'comment-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
