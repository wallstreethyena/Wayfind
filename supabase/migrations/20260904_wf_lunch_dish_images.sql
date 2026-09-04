create table if not exists public.wf_lunch_dish_images (
  place_id text primary key,
  image_url text,
  source_url text,
  must_try text not null,
  confidence numeric(4,3),
  reason text,
  checked_at timestamptz not null default now(),
  constraint wf_lunch_dish_images_image_url check (image_url is null or image_url ~ '^https?://'),
  constraint wf_lunch_dish_images_source_url check (source_url is null or source_url ~ '^https?://')
);

alter table public.wf_lunch_dish_images enable row level security;
revoke all on public.wf_lunch_dish_images from anon, authenticated;
grant all on public.wf_lunch_dish_images to service_role;

comment on table public.wf_lunch_dish_images is
  'Server-only vision verification of an exact must-try dish from restaurant-owned source pages. Null image_url records a checked fallback to the restaurant image; Google photo names are never cached.';
