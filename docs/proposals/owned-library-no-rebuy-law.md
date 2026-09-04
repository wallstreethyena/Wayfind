# The owned library never re-buys

Owner direction, 2026-09-03: the enriched Wayfind library must keep serving at no additional Google cost.

- `wf_inventory` is permanent. Google is paid once at discovery; serving paths must not add a `refreshed_at` age gate.
- Free mode buys lean and fills rating, review count, and status from owned signals through `lib/ownedLibrary.mergeOwnedSignals`.
- The rich `v1` cache answers before the spend ledger is consulted.
- `/api/places/refresh`, `/api/cron/inventory-refresh`, and `/api/cron/atlas-build` remain off in free mode on purpose. Do not add a ledger grant to make those workers re-buy owned data.
- “Never goes old” does not settle whether Google-derived rating and review counts may continue feeding Wayfind Score after Google’s content window. That is an owner and counsel decision, not permission to re-buy.

The executable contract lives in `lib/ownedLibrary.js` and `scripts/check-owned-library-no-rebuy.mjs`.
