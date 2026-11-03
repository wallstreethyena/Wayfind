// Flag keys only. Split from lib/seoFlags.js so a client or a guard can name
// the flags without loading the PostHog reader.
//
// Neither flag exists in PostHog yet (2026-11-03). Create them there as
// boolean flags before turning either one on. Off is the only safe default.

export const SEO_FLAGS = Object.freeze({
  badgeFindUs: "badge_find_us",
  bestOfPages: "seo_bestof_pages",
});
