# Guide-page conversion overhaul — directive

Owner directive, 2026-07-30. Filed on disk so future sessions do not need it
re-pasted. Verbatim, with an implementation-reality appendix at the bottom —
the appendix is *findings*, not amendments.

---

## Context

Guides are our SEO engine and where real users land. PostHog 14d, owner excluded:

| path | views |
|---|---:|
| `/things-to-do/orlando` | 39 |
| `winter-park-scenic-boat-tour` | 35 |
| `orlando-not-theme-parks` | 29 |
| `disney-springs-restaurants` | 13 |
| long tail | 7–11 |

Bounce ~50%, almost no second actions. Every change must feel premium: real
numbers, real deadlines, one clear action, zero dark patterns.

## 1. ONE primary CTA per guide

Hick's law — choice overload suppresses action. Each guide ends with exactly one
intent-matched monetized CTA **plus** one "continue" card to a sibling guide.

Mapping, per GWEN's verified matrix:

- **tour/attraction guides** → Viator via `hasBookingCTA()` / `bookingTargets()`.
  THE single predicate — never a parallel resolution path; it carries the FTC
  disclosure.
- **restaurant guides** → the coupons/deals path where a registry deal exists for
  a mentioned place, else Directions-to-standout as the honest primary.
- **hotel guides** → existing `hotelUrl()` path. Stay22 rewrites at click time —
  never clone or precompute that href.

No link walls.

**Guard:** a guide whose primary CTA resolves to a bare external link where a
monetized route exists fails the build.

## 2. Open-loop teaser above the fold

Zeigarnik. One honest line per guide that the body resolves — e.g. "Locals skip #3
— here's what they do instead." Derive from the guide's own content; never
fabricate.

## 3. Social proof adjacent to the CTA

Review count + rating rendered **next to** the primary CTA, only when the data
exists. No placeholders. A caught failure must be distinguishable from
legitimately-empty (standing rule).

## 4. Real deadlines

Loss aversion. Where a guide references a deal, show its **actual expiry** pulled
from the deals data in code (`lib/coupons.js` / `clippOffers`), never hardcoded —
"Ends July 31" style. Anchored prices only where a computed promo price exists
("$16, reg. $19").

## 5. Exit-on-peak

End each guide with a save prompt feeding the existing save event. If save UI
lives outside these files, spec it and hand off.

## Voice

Plain, warm, specific, zero hype. Honest counts over superlatives — "3 nearby",
not "endless options". Never fake urgency: a real expiry date is the only
permitted deadline.

## Instrumentation

- `commerce_impression` on the CTA
- `commerce_cta_clicked` on click
- `guide_next_step` — values: `cta` | `continue` | `save` | `none`
- `primary_cta_null` **redefined**: "no MONETIZABLE CTA resolved". Directions is
  the acknowledged non-monetized terminal and does **not** suppress the event.

## Ship order

Top-5 guides first as the proof pass:
`things-to-do-orlando`, `winter-park-scenic-boat-tour`, `orlando-not-theme-parks`,
`disney-springs-restaurants`, `things-to-do-sarasota`.

Template + instrumentation PR first, content teasers second. Rebase on fresh
main — #477/#479-era files are moving.

---

# Appendix — implementation reality, verified 2026-07-30

Findings from reading the code before building. These are not amendments; they are
the gaps between the directive's names and what is on disk. Two of them change
*which pages* and *how the CTA resolves*, so they need an owner decision.

## A1. The highest-traffic page in the list is not a guide

`/things-to-do/orlando` (39 views — the single biggest) is a **landing route**:
`app/things-to-do/[metro]`, driven by `lib/landing.js`. It is a different template
from `app/guides/[slug]`, and there are ~84 landing pages behind it. The guide
template overhaul does not reach it.

## A2. Two named slugs do not exist; the real ones differ

The 17 real slugs live in `lib/guides.js`. Mapping the named five:

| directive name | on disk |
|---|---|
| `things-to-do-orlando` | **not a guide** — landing route, see A1 |
| `winter-park-scenic-boat-tour` | ✓ exists |
| `orlando-not-theme-parks` | actually `things-to-do-orlando-not-theme-parks` |
| `disney-springs-restaurants` | actually `best-restaurants-disney-springs` |
| `things-to-do-sarasota` | ✓ exists |

## A3. `clippOffers` does not exist

No module, export or identifier by that name anywhere in the repo. The real deals
source is `lib/coupons.js`, and it already provides exactly what §4 needs:

- `couponEndsLabel(c)` — the "Ends July 31" label
- `couponForPlaceName(name, todayIso)` — registry lookup by mentioned place
- `couponIsLive(c, todayIso)` — auto-hide past expiry
- `COUPONS[].expires` — `"YYYY-MM-DD"`, or `null` for no-expiry offers

`lib/verifiedOffers.js` carries `expiresAt` for the verified-offer path.

## A4. The CTA predicate is not server-safe as written

`hasBookingCTA()` and `bookingTargets()` live in **`app/components/BookingCTA.js`,
a client component**. Further:

- `bookingTargets` is **not exported** — only `hasBookingCTA` is.
- both take a place **`detail`** object (`detail, kind, viaTours, locName`), not a
  guide. A guide must resolve to a place first.
- `app/guides/[slug]/page.js` is a **server component**. Importing a
  client-component internal into a server page is what 500'd `/eat/[metro]/[cuisine]`
  on 2026-07-29 (`TypeError: m is not a function` from pulling in `lib/google`).

§1 says "THE single predicate — never a parallel resolution path", and that rule is
right. Satisfying it *and* keeping the server page working means extracting the
resolution into a server-safe `lib/` module that **both** `BookingCTA.js` and the
guide page import. That is one predicate with two callers, not a second path — but
it is a refactor of a live commerce component, not a new file.

## A5. The link wall already exists

`app/guides/[slug]/page.js` renders, **per pick**: `book` (tours/tickets), `rates`,
and "Open in Wayfind" — plus `OpenAppCTA` at the page bottom. So §1 is a removal
job at least as much as an addition, and removing per-pick affiliate links from
live guides changes existing monetized surface area. Worth an explicit owner
acknowledgement rather than being folded in silently.
