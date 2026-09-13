# Six-guide editorial refinement

Owner request: improve the six guides shown in the September 9 traffic screenshot.

Scope: Siesta Key Drum Circle, Pinecraft, Crystal River/Homosassa scalloping,
Siesta Key vs Lido Key, Weeki Wachee, and Winter Park Scenic Boat Tour.

The existing warm photographic hero is retained. These six routes now use their
specific descriptions instead of repeating their headlines, with quieter image
captions, more comfortable heading proportions, section navigation, larger mobile
body copy, readable insider notes, rounded touch targets, and separated FAQs.
Styles and navigation are server-rendered; no client package was added.
Photography remains existing editorial imagery, not a new location-photo shoot.
Travel facts and verification dates were not reverified or advanced.

The live Drum Circle page also showed a hotel for its beach section and a restaurant
under parking advice. Explicit null appQuery values now skip inventory resolution;
advice sections use that contract. Beach picks and Pinecraft Park declare accepted
whole-name aliases, preventing substring resorts from being substituted. Existing
review and geographic filters remain. An unmatched place stays without a card.

Validation before publication:
- Focused resolver guard: 30 assertions, including wrong-resort rejection, matching
  beach positive control, zero requests for advice, and a filter-removal mutation.
- JSX command: exit 0.
- Next production build with documented placeholder configuration: exit 0.
- Bundle check: 494.6 KB gzip, 498 KB budget, 3.4 KB headroom.
- Parsed all six generated HTML files: one h1 and one contents navigation each;
  all 23 section links resolve to rendered IDs; repeated headline copy absent.
- Browser visual verification is incomplete: the cloud browser rejected localhost
  with ERR_BLOCKED_BY_CLIENT. This is not a visual/mobile pass.
- Placeholder builds cannot verify live inventory/photo/share integration.

Release: obtain owner approval required by AGENTS.md section 11, publish a branch
and preview, check all six at phone and desktop widths, then merge and verify the
production revision and live card identity. Do not claim this work is deployed
until those release steps have actually completed.

Full guard runner was attempted but did not return a final result during this
session; it was interrupted. Do not count it as a pass. The last captured output
was check-atlas-retry-cron. A separate bounded invocation of the next command,
check-guide-cta-honesty, exited 0 (184 assertions). Complete the full required
suite in CI before merging; no guard was removed, skipped in CI, or weakened.
