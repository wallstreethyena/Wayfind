# Editorial image correction

Prepared on 2026-09-10 from main `1d8800ca8f5637ba3d9ed722c14eec73d77a83fd`.

The 41-guide registry now has 38 reviewed photograph mappings and three explicit photo gaps. Eighteen mappings use seventeen newly sourced, optimized images. The St. Armands and Magical Dining guides share one explicitly illustrative plated-dinner photograph; the reuse is documented. Exact locations replace cross-city substitutes for Myakka, Weeki Wachee, Anna Maria Island, De Soto, Robinson Preserve, Parrish, Winter Park, Crystal River, Lido Key and Sarasota's Ringling estate. Subject photographs replace unrelated food/activity images. Illustrative photos are visibly identified on both cards and article heroes.

Drum circle, bioluminescent kayaking and scalloping use text-led layouts until a suitable licensed photograph is found. No unrelated fallback is selected on missing data or failed image decoding. The Pinecraft church composite was rejected for presentation quality; its existing pie photograph remains explicitly illustrative and does not claim to be Yoder's pie.

The machine guard checks metadata against human-reviewed subject/location briefs, source-license consistency, asset size/dimensions, duplicate-source disclosure, rendered article markup and real error/decode callbacks. It does not establish visual truth by itself. Full per-guide records, captions, attribution and SHA-256 checksums are in `blog-images.json`.

Source/output pixels were inspected. Cloud browser policy rejected the local file preview; responsive browser verification of the changed site remains pending a permitted preview. No push, PR or deployment has occurred. Repository AGENTS.md section 11 requires owner confirmation for those outward actions.

No refresh schedules, content clocks, external purchase flows or title-specific social-card generation were changed.

## Validation

- Full guard runner: 598/598 guards and one credentialed rerun passed (exit 0).
- Final editorial guard: 827 assertions across 41 records/rendered article headers and 16 hub regions passed.
- Required JSX check and guard-registry parity passed.
- Final production build with the documented placeholders passed (recorded exit 0).
- Actual locally served `/guides` HTML and all 41 built article pages matched the final registry, including explicit image-free states and illustrative disclosures.
- Diff whitespace check passed. Responsive browser visual verification remains pending; no live verification is claimed.

Upstream advanced by three non-editorial fixes during preparation. The only overlapping file is the generated guard registry; regenerate it when rebasing before any approved push. No guide/photo source overlap was found.
