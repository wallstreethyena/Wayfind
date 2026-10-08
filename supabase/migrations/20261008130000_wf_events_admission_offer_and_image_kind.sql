-- 2026-10-08: source-supported price wording and honest image labels for events.
-- Applied to production via the Supabase MCP (migration wf_events_admission_offer_and_image_kind).
alter table public.wf_events
  add column if not exists admission_offer text,
  add column if not exists hero_image_kind text;
alter table public.wf_events
  add constraint wf_events_admission_offer_chk check (admission_offer is null or admission_offer in ('free_admission','free_admission_paid_activities','free_tier_conditions','paid','unknown')),
  add constraint wf_events_hero_image_kind_chk check (hero_image_kind is null or hero_image_kind in ('event','venue'));
comment on column public.wf_events.admission_offer is 'Source-supported offer type for price wording (2026-10-08): free_admission | free_admission_paid_activities | free_tier_conditions | paid | unknown. Null = not classified (a $0 tier never reads as free).';
comment on column public.wf_events.hero_image_kind is 'What hero_image depicts: event (the organizer''s own event image) or venue (a photo of the place, not the event).';
