// Guides that ship their own app/guides/<slug>/page.js.
//
// They stay registered in GUIDES so the guide index, sitemap, SEO audit and
// editorial checks still count them. The generic app/guides/[slug] template
// must NOT prerender them: in `next build` its prerendered output for the same
// URL replaces the dedicated route's output, so production silently serves the
// generic layout instead of the custom page (Pinto's Farm, 2026-09-22: no farm
// map, no ticket CTA, no arrival map on the live URL).
//
// scripts/check-guide-dedicated-routes.mjs fails the build if a dedicated
// guide folder exists for a GUIDES slug that is missing from this list.
export const DEDICATED_GUIDE_ROUTES = new Set([
  "pintos-farm-miami-2026",
  "universal-orlando-christmas-2026",
  "disney-world-holiday-food-guide-2026",
]);

// Standalone hand-authored guides that do not have a GUIDES record. Keep the
// sitemap and the human-facing discovery link in sync without promoting old
// dated inventory into current guide results.
export const STANDALONE_GUIDE_INDEX = Object.freeze([
  Object.freeze({ slug: "florida-fall-festivals-2026", label: "2026 Florida fall festival guide" }),
]);
