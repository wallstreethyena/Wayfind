// The homepage's search title and description (SEO audit, 2026-11-27).
//
// The brand line "One place worth leaving home for" is the owner's tagline and
// stays: it is the default title in app/layout.js (every route without its own
// title), the Open Graph and Twitter share title, and the second half of this
// homepage title. What changed is the FRONT of the homepage <title>: nobody
// types the tagline into Google, so the words searchers do type ("things to do
// in Florida today") lead, and the description names the Florida places the
// rankings cover. No "Best" (rankings are on merit, never for sale), and the
// on-merit line stays word for word.
//
// app/page.js puts these on "/" only. app/home.js restores HOME_TITLE (inlined
// there to keep the client bundle flat) when the app returns to the feed.
// scripts/check-seo.mjs keeps all three in step.
export const HOME_TITLE = "Things to Do in Florida Today | Wayfind: One place worth leaving home for";
export const HOME_DESCRIPTION = "Things to do in Florida today, from Sarasota and Anna Maria Island to Tampa Bay, Orlando and Miami. Places are ranked on merit. Rankings are never for sale.";
export const HOME_H1 = "Wayfind: things to do in Florida right now, ranked on merit";
