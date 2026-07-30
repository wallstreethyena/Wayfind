# Deals registry — seeding priority

New file, 2026-07-30. There was no deals-registry doc; the owner asked for the
guide-seeding note to live at "the deals registry doc path", so this is it.

The registry itself is code: `lib/coupons.js` (`COUPONS[]`, `couponIsLive`,
`couponForPlaceName`, `couponEndsLabel`) plus `lib/verifiedOffers.js` for the
verified-offer path. This doc is priority and provenance, not data.

---

## Why guide-visible merchants come first

The guide conversion overhaul (#486, `docs/GUIDE_CONVERSION_DIRECTIVE.md`) resolves
ONE primary CTA per guide. Restaurant guides are mapped to the coupons/deals path
where a registry deal exists for a place the guide actually mentions, else
Directions-to-standout as the honest primary.

Measured 2026-07-30, all 17 guides: **0 of 3 restaurant guides match a registry
coupon.** All three fall to Directions. The code path works —
`couponForPlaceName()` is wired and `couponEndsLabel()` supplies the real expiry —
the registry simply has no overlap with these guides yet.

That is a **registry gap, not a code gap**, and it is the cheapest revenue fix on
the board because these merchants have *proven traffic*: they sit on pages users
already land on, rather than on a surface we hope they find.

Routing (owner, 2026-07-30): per-merchant Clipp seeding, gated on the owner's CJ
attribution test. GWEN's parked item.

---

## Seed these first — restaurants mentioned in live guides

Every name below is a pick in a shipped guide. A coupon for any one of them turns
that guide's primary CTA from Directions (earns nothing) into a monetized deal
CTA with a real expiry, with no code change.

### `best-cuban-sandwich-tampa` — Tampa
- Columbia Restaurant
- La Segunda Central Bakery
- West Tampa Sandwich Shop

### `st-armands-circle-restaurants` — Sarasota
- Columbia Restaurant *(also in the Tampa guide — one seed, two guides)*
- Café L'Europe
- Shore
- Crab & Fin
- Kilwins
- Blue Dolphin Café

### `best-restaurants-disney-springs` — Orlando
- The Boathouse
- Morimoto Asia
- Homecomin'
- Wine Bar George
- Jaleo by José Andrés
- Gideon's Bakehouse

**Highest leverage: Columbia Restaurant.** It is the only merchant appearing in two
guides, so one seed converts two CTAs.

---

## Two constraints on any seed

**Matching is by mentioned place, not by category.** `couponForPlaceName(name,
todayIso)` looks the merchant up by name against the guide's picks. A generic
"restaurants in Tampa" offer will not attach to a guide and will not surface as a
CTA.

**Expiry must be real.** `COUPONS[].expires` is `"YYYY-MM-DD"` or `null`;
`couponIsLive()` auto-hides past the date and `couponEndsLabel()` renders it.
Never hardcode a deadline anywhere — a real expiry is the only permitted urgency
(directive §4, and `check-guide-conversion.mjs` fails the build on a hardcoded
one).

---

## Disney Springs caveat

Six of the seven merchants above sit inside Disney Springs. AGENTS.md §7 forbids
automated requests to Disney hosts, and `officialPage()` in the atlas cron gates
on it. That constrains *sourcing editorial* for those places — it does **not**
constrain a Clipp/CJ merchant deal, which comes from the partner feed rather than
from Disney. Worth stating so nobody reads §7 as blocking the seeding.
