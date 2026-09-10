Wayfind's guide masthead could show dining imagery on unrelated articles because its title regex matched `date` inside `Dated`. Every guide also repeated its title in a generic promotional introduction, while the guide index omitted 16 articles outside four hardcoded regions.

This extends the existing six-guide work in #1201 across the full 41-guide collection:

- Replace the promotional masthead with an article title, useful summary, compact reading/share actions, and an explicitly assigned image with attribution.
- Require an image record for every guide; unknown slugs receive neutral artwork rather than a guessed category.
- Show every region and article on the index with responsive image cards.
- Apply the reading typography and collapsible contents to every guide.
- Preserve #1201's exact venue matching and intentional unresolved-place behavior.
- Correct the Orlando fall-events title and distinguish content updates from factual verification.
- Identify dated summer editions and record per-guide editorial follow-ups.

The audit distinguishes contextual photography from photos of a named venue or event. Some contextual images still warrant future original photography. No visit claims, new verification dates, or search-ranking promises are introduced.

Validation and remaining visual checks are recorded in `docs/design/blog-wide-upgrade.md`. This patch requires hosted mobile and desktop review before production release. It does not claim that all venue hours, offers, or seasonal facts have been reverified.
