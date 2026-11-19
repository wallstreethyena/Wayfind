# OpenTable selector map (captured)

`opentable.v1.json` contains the live OpenTable restref selectors captured during a supervised manual Chrome session (`availability` slot buttons -> optional seating selection -> `details` guest form -> submit + SMS code relay), with synthetic fixture fallbacks preserved for hermetic unit/browser tests.

When OpenTable changes its DOM, a human must replace the selectors after a new supervised manual capture. Do not paste live HTML into the repo.
