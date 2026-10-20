# Wayfind

Wayfind is a Next.js discovery app backed by owned inventory and guarded
server-side provider integrations. The interactive map uses MapLibre and needs
no Google browser key.

## Local development

```bash
npm ci
npm run dev
```

Copy `.env.local.example` to `.env.local` for optional integrations. Never put
paid provider credentials in a `NEXT_PUBLIC_*` variable: Next.js embeds those
values in browser assets.

## How Gabe runs it

This adds the seasonal venues from the 19 October 2026 plan. It does not
deploy the site, and it does not change rankings or scores. A place that is
already on the live list is left as it is.

There is no `.nvmrc` and no `engines` field in `package.json`. The checks run
on Node 22. On the Mac, install Node 22, then confirm it:

```bash
node -v
```

You should see `v22`. Then, in the project folder:

```bash
git fetch origin
git checkout seasonal-venues-add-2026-10-19
npm ci
```

Create `.env.local` in that same folder with three lines, using your own
values. Do not commit that file.

```text
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
GOOGLE_MAPS_SERVER_KEY=your Google server key
```

The service-role key has to be an `sb_secret_` key. The old JWT keys were
turned off.

Dry run first. This spends Google calls but writes no inventory:

```bash
npm run add-seasonal-venues
```

Every call requires the existing `WAYFIND_GATE` and atomic monthly ledger
allowance. Set the gate explicitly in `.env.local` if it is not configured.
The script does not increase budgets or provide a cap bypass.

When the matches are ready to write:

```bash
npm run add-seasonal-venues -- --apply
```

Each run stops at 130 billed Google calls. A dry run spends one Text Search
for every venue it can locate. Apply spends those searches again, then one
Place Details call for each verified place. Doing both is two separate runs.
Rio Body Wax is skipped. Do not run `node scripts/backfill-place-photos.mjs`.

The address check before Google is a free US Census lookup, so the 1 km test
does not spend a Google call. The summary at the end says how many places were
added, why each failure was skipped, the live place count before and after,
and how many billed Google calls were used.

## Paid-provider controls

All paid or quota-limited provider calls run on the server. `WAYFIND_GATE` must
be explicitly set to `free` or `open`; an absent, misspelled, or `shut` value
blocks provider spend. Every provider also requires its positive finite monthly
cap and an available atomic Supabase spend ledger.

Examples include `GOOGLE_GEOCODING_MONTH_CAP`,
`GOOGLE_TEXT_ENTERPRISE_MONTH_CAP`, `ANTHROPIC_MONTHLY_REQUEST_CAP`, and the
provider-specific `*_MONTH_CAP` values documented in `.env.local.example`.
Cached and owned data continue to serve when a provider is unavailable or its
budget is exhausted.

## Verification

```bash
node scripts/run-guards.mjs
npm run check:jsx
npm run build
```

The guard suite includes client-boundary discovery, atomic-ledger denial tests,
authentication tombstones, public diagnostic retirement, and SSRF regression
cases. Its tests use injected transports and do not call paid providers.
