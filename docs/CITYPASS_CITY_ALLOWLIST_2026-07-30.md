# CityPASS — the city allowlist, read from source (2026-07-30)

The queued wiring task carries one hard constraint: **gate by city allowlist,
never a generic fallback.** CityPASS serves a fixed, small set of destinations, and
a link that resolves to another metro's inventory is worse than no link because it
looks like a working recommendation. That is the Ringling/Tiqets lesson.

This is the allowlist read from CityPASS's own destination nav rather than guessed
or remembered — the gate that has to exist before any of the wiring is safe.

---

## 1. The complete destination list (17)

```
/atlanta                  /orlando
/boston                   /philadelphia
/chicago-comparison       /san-antonio
/dallas                   /san-diego
/denver                   /san-francisco-comparison
/houston                  /seattle-comparison
/los-angeles              /southern-california
/new-york-comparison      /tampa
/toronto
```

### The shape trap — a template would 404 on a third of them

**Four destinations are not bare city slugs:** `chicago-comparison`,
`new-york-comparison`, `san-francisco-comparison`, `seattle-comparison`.

A `/${citySlug}` template — the obvious implementation — silently produces
`/chicago`, `/new-york`, `/san-francisco` and `/seattle`, none of which is the
destination page. This is the *same* failure the Clipp registry was written to
prevent (`/local-coupons/<st>/<city>` looked right and served an error page). It is
the reason the allowlist must be an enumerated table with a real path per row, not
a slug rule.

**Wayfind's two covered metros are both plain slugs** — `/orlando` and `/tampa` —
which is precisely why a template would have looked fine in local testing and
broken only for cities we would add later.

## 2. Our two cities, verified live in a browser

| city | title | inventory seen | prices |
|---|---|---|---|
| Orlando | *Official Orlando CityPASS® \| Save on Tickets to Orlando Theme Parks* | Walt Disney World® Resort, SeaWorld, theme parks | 3–10 Day tickets from **$366**, others $64–$178 |
| Tampa | *CityPASS® – See 5 Top Things to Do in Tampa Bay and Save up to 55%* | Busch Gardens Tampa Bay + 4 more, choose-5 bundle | **$149.95** / $139.95, bundles to $332.92 |

Both serve real, priced inventory. Neither is an empty or placeholder page.

### The first Tampa read was a false negative — do not trust one probe

Tampa initially returned `ERR_CONNECTION_CLOSED` with a 184-byte error body. That
is a *dropped connection*, not a 404, and it came after several rapid navigations —
i.e. rate-limiting, not absence. Re-read after an 8-second pause, the page returned
4,479 bytes of real inventory.

Had that first result been recorded, **Tampa would have been wrongly excluded from
the allowlist** and half our CityPASS coverage lost. A connection-level failure is
never evidence about whether a page exists; only a real response is. Same lesson as
the stale-`.next` bisect and the Clipp search that matched its own query.

## 3. Disney: checked, and there is no conflict

Orlando CityPASS inventory is Disney-heavy, and AGENTS.md §8 carries a Disney
constraint — so it was checked rather than assumed. The rule prohibits **scraping,
polling, or automated requests against Disney endpoints** (`disneyworld.disney.go.com`,
My Disney Experience, reservation endpoints), with Google Places as the only source
of identifiers.

Linking to citypass.com — an authorized ticket seller, stating so on its own page —
is not a Disney request of any kind. **No conflict.** Recorded because the next
person to look at CityPASS Orlando will have the same question.

## 4. What still has to happen before this ships

Not started, deliberately — this document is the gate, not the feature:

1. An enumerated `CITYPASS_DESTINATIONS` registry, one row per destination with its
   **literal path** (never a slug rule — see §1) and its browser-verification record,
   in the shape `lib/clippOffers.js` already uses.
2. A `citypass` entry in `PROVIDERS` (`lib/commerceProviders.js`) with a `resolve`
   function and a host allowlist, routed through `/api/commerce/go`.
3. **No sub_id outbound**; `rel="sponsored nofollow"` on any rendered anchor.
4. City gating at the *call* site: a viewer outside Orlando/Tampa gets **nothing**,
   never a generic national CityPASS link. `nearestMetro()` (`lib/orderInFeatured.js`)
   already resolves a viewer to a metro and returns `null` beyond 75mi — the same
   function #504's deal-sheet locality sort uses, so both surfaces agree on what
   "here" means.
5. Guards with RED proofs, including one that fails if a bare-slug template is
   reintroduced for the four `-comparison` destinations.

TicketSmarter is queued behind this and has **not** been read yet; its inventory
gate still needs the same treatment before it can be claimed.
