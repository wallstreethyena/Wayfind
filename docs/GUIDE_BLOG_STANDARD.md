# Guide and blog standard

Owner, 2026-11-23: every guide and blog page on Wayfind looks and is structured
like the Holidays at UTC 2026 page,
[gowayfind.com/florida-events/utc-holidays-2026](https://www.gowayfind.com/florida-events/utc-holidays-2026).
That page is the canonical layout. A later change does not get its own guide
design.

`scripts/check-editorial-standard.mjs` fails CI when a guide, a dedicated guide
route, or a Florida event page skips the shared frame, and when the checked-in
broken fixture is missing a required section. The broken fixture is
`scripts/fixtures/editorial-standard-broken.html`. Read this file before adding
or restyling a guide or blog.

## The frame

`app/components/EditorialStandard.js` is the one template.

| Route | How it enters the frame |
| --- | --- |
| `/florida-events/[slug]` | Renders `EditorialStandard` and passes its existing `EventDetailShell` as `overview`, plus `EventWhere`. |
| `/guides/[slug]` | Renders `EditorialStandard` directly. This is every data-backed guide, including `/guides/tampa-restaurants` and `/guides/river-of-lights-tampa-2026`. |
| Dedicated guides (`app/guides/<slug>/page.js`) | Render `GuideStandardShell`, which renders `EditorialStandard`. Custom maps and modules stay as children. |
| `/blog` | Permanent redirect to `blog.gowayfind.com`. There is no `app/blog` in this repo. Blog articles published here are guides. |

The `/guides` index is a directory, not an article, and does not use the article frame.

## Required sections

Confirmed on the live UTC page and in `app/florida-events/[slug]/page.js`:

1. Hero photo. A reviewed photo carries a `Photo:` credit under the rail. A guide with no reviewed photo renders no photo and does not say "Photo unavailable".
2. One `h1`.
3. Facts: **When**, **Where**, **Cost**, **Who it is for**. Values come from fields the page already stores (`lib/editorialStandard.js`). A missing fact says "Not stated on this page". It is not a guessed price or date.
4. Short summary (`data-editorial-summary`). For a guide this is the existing intro.
5. Booking note (`.wf-event-booking-note`). Guides use the existing partner disclosure sentence.
6. **Where it is.** Venue and address when one reviewed street door exists (`GuidePickWhere` / `guideWhereForRecord`, the PR 2581 address rule). **Plan your drive** is the Apple route from `EventWhere`, and it renders when that door has coordinates. A roundup names its region and does not invent one door. Each pick still keeps its own address line and Google Maps link.
7. **Before and after.** On an event page this is the outing rail (`Before and after, kid friendly` on the UTC page, with "Picks for before and after"). On a guide it is the same heading. Nearby cards appear when the guide is tied to an event that already has pairings. Otherwise the section says no separate nearby picks are listed.

The article body under that frame (numbered picks, FAQs, maps, ticket copy) stays. This standard does not rewrite those facts.

## Rules that stay in force

- Every pick needs a real photo. No "Photo unavailable" placeholder.
- Guide addresses and map links stay on `GuidePickWhere` (`scripts/check-guide-place-addresses.mjs`).
- New chrome copy has no em dash, en dash, or spaced hyphen.
- The frame never links `/date-night`.
- Pick photos still follow `docs/design/guide-visual-standard.md` (`GuideFigure`, credits, fixed ratios). That document governs the photographs inside the article. This document governs the page frame.

## Changing the standard

Change this file, `app/components/EditorialStandard.js`, and
`scripts/check-editorial-standard.mjs` in the same commit, with the owner's
decision quoted. Do not exclude a route to make the check pass.
