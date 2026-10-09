# Wayfind seasonal search rollout

Prepared October 9, 2026. Not deployed. Google Ads unchanged.

## Four focused search destinations

| Theme and primary query | Proposed canonical path | Reader decision | Existing coverage linked |
| --- | --- | --- | --- |
| Fall in Florida | /fall-in-florida | Farm day, festival or evening outing | Statewide fall guide, Orlando fall events, Pinto’s Farm |
| Halloween in Florida | /halloween-in-florida | Scare level, family fit and food | Orlando Halloween food, statewide fall guide, indoor backup guide |
| Christmas in Florida | /christmas-in-florida | Light walk, boat parade or theme park day | Existing lights, boat parade and Christmas theme park guides |
| New Year’s in Florida | /new-years-in-florida | Family countdown, public fireworks or ticketed night | Current organizer announcement, event index, Orlando nightlife blog |

These are evergreen planning hubs with distinct choices, not duplicate copies of the dated guides. Existing guide URLs and their self-canonicals stay intact. None of the four root routes existed in the inspected main checkout (087632b6d3ad10f7fd8e1c81bc61b50b91d62a88). The personalized /seasonal route remains noindex as designed.

Natural variants: Florida fall activities, pumpkin patches in Florida, Florida Halloween events, family Halloween Florida, Christmas lights Florida, Christmas boat parades Florida, New Year’s Eve Florida and family New Year’s Eve Florida. Search demand, volume, difficulty and ranking are **unknown** because the connected Search Console tool returned no sites. No demand estimates were invented.

## What is prepared

Four server-rendered pages with one H1, distinct descriptions, self-canonicals, index/follow directives, CollectionPage/ItemList and BreadcrumbList markup, and branded text social previews. Each has a distinct accent using the established editorial components. These are intentionally text-led collection pages; no new venue photographs or artificial scenes are introduced.

The main sitemap includes all four destinations. The guides index and site footer link to all four; directly relevant guides link back to their parent seasonal hubs. The blog homepage and footer also link to them. Publish the main site before the blog changes to avoid temporary broken links. The blog sitemap stops assigning request-time modification dates to the homepage and city pages; post modification dates remain factual, and missing or invalid dates are omitted.

Dated guide links disappear after their stated final useful day. Existing dated articles remain accessible. The New Year’s announcement expires after January 1, 2027; the page never silently relabels an old event as a new edition.

## Evidence and limits

- Live HTTP checks: all 12 existing main-site destinations returned HTTP 200, a meaningful H1 and no robots noindex. Details: seasonal-link-baseline-2026-10-09.json. This is crawlability evidence, not proof of Google indexing.
- Official New Year’s source checked: https://www.visitpanamacitybeach.com/events/holiday-events/new-years-eve/ . It promotes welcoming 2027 but labels the schedule coming soon; no definite start time is promised in the new hub.
- Existing guide content is reused by linking, not by copying potentially stale venue facts. This task did not reverify every venue in the entire blog catalog.
- Main-site Christmas PR #1713 was open during the initial inspection. This work does not change its rail ordering, event registry or photos.
- Blog source was read using the authorized GitHub connector. Source commit: 58fb8630102e9cda7e03172e388703f5beaf5c9b. Direct private cloning was unavailable; the local snapshot commit is not a remote ancestor and must never be pushed as a replacement history. Apply only its reviewed file changes on the actual latest remote head.
- The Google Ads connector exposes one customer but returned no campaigns, assets or recommendations matching the screenshot. Conversion setup on the active advertising account is unverified.

## Ads prepared for account review

seasonal-search-ads-draft.csv contains four themed ad groups with five headlines and two descriptions each. Headline and description lengths are validated. seasonal-sitelinks-draft.csv contains six destination links with both description lines, also length-checked. These are review drafts, not a claim of an imported or live campaign.

Preserve the existing total budget. Inspect the actual account, campaign types, geography, search terms, conversion definitions and performance before assigning campaigns, match types, negatives or bids. Start the account review with whether a qualified affiliate outbound click is reliably measured; do not call a click a purchase. Do not turn on Performance Max or auto-apply recommendations just to increase the optimization score.

Image assets remain pending the active campaign review and visual/rights approval: use at least four relevant real photos with square and landscape crops. Google recommends 1200×1200 and 1200×628. No digitally added text, logos or graphic overlays for Search image assets. Public venue images are not automatically cleared for paid advertising. Existing Google photo permissions must not be assumed to authorize ad use.

## Measurement and release

Before publishing: finish the repository guard/build gates, inspect phone and desktop rendering, review the diffs against current main, and confirm the owner’s release authorization required by AGENTS.md §11. The owner approved branch publication and draft pull requests on October 9; merge and production deployment are not included in that approval. No production or advertising changes have been made.

After an authorized deployment: confirm the exact production revision, fetch all four pages and sitemap, test links and sharing, then inspect indexability in Search Console for both main and blog properties. Submit the existing sitemaps only after verifying the live contents. Capture query/page clicks, impressions, CTR and average position with date/device/country context. Capture qualified booking clicks separately from confirmed commissions. Review after 4–8 weeks, accounting for seasonal demand. No recurring task has been created.

Google determines rankings and ad auction placement. This implementation does not guarantee first place or coverage of every search.

References: https://developers.google.com/search/docs/fundamentals/seo-starter-guide ; https://developers.google.com/search/docs/appearance/structured-data/breadcrumb ; https://schema.org/CollectionPage ; https://support.google.com/google-ads/answer/9566341 ; https://support.google.com/google-ads/answer/2375416 .

## Local validation

- Main and blog production builds completed successfully. The main build used documented placeholder public credentials with a scratch-only fetch preload that immediately rejects the placeholder Supabase host. It does not simulate successful production data. Live database behavior is not verified by this build.
- Built HTML for all four hubs has one H1, one main element, the intended title, a self-canonical using the established www.gowayfind.com domain, and CollectionPage structured data.
- Seasonal rendering/expiration checks pass, including a negative control that fails if expired links are retained. Main SEO, guide, share-card and JSX checks pass. Blog prebuild and sitemap-date checks pass.
- Card standard structural checks pass. Chromium is unavailable, so rendered card and phone/desktop visual checks have not run. No visual approval is claimed.
- Refetched main before release review: origin/main remains 087632b6d3ad10f7fd8e1c81bc61b50b91d62a88. Both working diffs pass whitespace checks.
- The broader suite identified missing display-font scopes on the four new routes. Each now has the standard DisplayFontScope layout. The existing font guard retains its checks and additionally renders/censuses all four new layouts: 53 assertions pass. The corrected main build completed successfully, and its generated HTML was checked again for canonical, schema, heading, main-element and font-scope output. The complete 855-guard run ended without a recorded final result and its process is no longer available. Over 400 guards completed without a further reported failure. A complete successful run remains required before merging. No full-suite pass is claimed.

## Review handoff

The changes are suitable for a draft pull request, not an unqualified production release. Remaining gates: complete the full guard suite, inspect mobile and desktop in a browser, and obtain the owner authorization required by AGENTS.md §11 before any remote write. Main branch publication should precede blog publication. No live Google Ads or Search Console changes are included.

Published for review with owner approval: https://github.com/wallstreethyena/Wayfind/pull/1714 and https://github.com/wallstreethyena/wayfind-blog/pull/9 . Both are drafts.
