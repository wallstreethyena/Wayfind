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
]);
