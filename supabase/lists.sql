-- List Engine snapshots (v5.71). Run this once in the Supabase SQL editor, same
-- as the other supabase/*.sql tables. Backs lib/listStore.js.
--
-- THE SNAPSHOT RULE: an image someone already shared must never change. Each row
-- is one immutable snapshot of a list, keyed by (slug, v) where v = generated_at
-- epoch seconds. A re-rank writes a NEW (slug, v) row; the old one is never
-- touched. getLatestSnapshot() reads the highest v for a slug (the live list);
-- getSnapshot(slug, v) reads the exact frozen one a share points at.
--
-- Written ONLY by server-side code holding SUPABASE_SERVICE_ROLE_KEY (the
-- /api/list/generate route). Public read is allowed because a published list is
-- public content by design (the /l/<slug> page and the /api/og/<slug> card both
-- render from it).
create table if not exists public.wf_lists (
  slug text not null,
  v bigint not null,                 -- generated_at epoch SECONDS (the snapshot version)
  generated_at timestamptz,
  city text,
  list_type text,
  data jsonb not null default '{}'::jsonb,  -- { card: {...}, list: {...} } — the frozen payload
  created_at timestamptz not null default now(),
  primary key (slug, v)
);
-- getLatestSnapshot: highest v for a slug.
create index if not exists wf_lists_latest_idx on public.wf_lists (slug, v desc);

alter table public.wf_lists enable row level security;
-- Public read: a published list is public content (it renders on /l/<slug> and
-- in the share card). No anon/authenticated write policy — snapshots are written
-- only by the service role, so they can never be forged or mutated client-side,
-- which is what makes the snapshot rule enforceable.
create policy "read lists" on public.wf_lists for select using (true);
