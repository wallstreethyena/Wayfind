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
