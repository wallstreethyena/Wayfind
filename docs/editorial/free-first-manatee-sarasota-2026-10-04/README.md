# Source-grounded Manatee–Sarasota starter batch

Research date: 2026-10-04. Baseline: `0709738350181c0e3d79aba24150246b08d4d594`.

Three new descriptions are prepared in `researched-editorial.json`. They are **not published**. The existing owner publisher accepts all three offline. No application code, ranking, refresh behavior, spend gate, provider adapter, or verification flag in production was changed.

## Why this path

The paid Atlas build, retry, and refresh jobs deliberately stop in free mode before the Google/Anthropic path. This is an intentional cost policy, not a newly established recurring defect. The current owner publisher already supplies a separate zero-provider path for reviewed source-grounded packs. Turning on the paid jobs is unnecessary for this batch.

Open PR #1571 (`158388cc436e9776be4cac64887cd95472f5fd80`) owns optional tips, placeholder replacement, and descriptive local-press support. Open handoff PR #1632 (`981e6fea8453bae0baa840463c93d76dedbc9b8f`) includes that work. This pack needs none of those changes and does not compete with them. Main already includes #1634's editorial deduplication at the baseline above.

## Candidates and checked evidence

| Candidate | Exact inventory ID | Evidence |
|---|---|---|
| Quick Point Nature Preserve | `ChIJ39-Cmb5qw4gR3tlLRUM8-sw` | [Town preserve page](https://www.longboatkey.org/197/Quick-Point-Nature-Preserve), [FWC Birding Trail](https://floridabirdingtrail.com/site/quick-point-nature-preserve/) |
| Felts Audubon Preserve & The Manatee County Audubon Society Inc. | `ChIJ6_2ktsAiw4gRmtDM9D5jAts` | [Preserve operator](https://manateeaudubon.org/felts-preserve/) |
| Manatee County Agricultural Museum | `ChIJMUR20OkXw4gRzw1NgpgA3hs` | [Permanent exhibits](https://www.manateecountyagmuseum.com/permanent-exhibits), [Plan your visit](https://www.manateecountyagmuseum.com/plan-your-visit), [School-visit timing](https://www.manateecountyagmuseum.com/) |

Each source was opened and read on the research date. The pack stores original concise factual paraphrases and field-level citations. It does not copy source prose or images. Raw source redistribution and commercial resale rights have not been established; this batch is for Wayfind's editorial display.

Research excluded claims that were unnecessary or conflicted between official pages. In particular, Quick Point's published acreage/hours vary between the town, tourism page, and Birding Trail, so neither appears in its copy. Wildlife sightings are opportunities, never guarantees. The museum's [2024 operations announcement](https://www.manateeclerk.com/clerks-news/historical-resources-announcement/) describes an operator transfer, not a permanent closure; its current visit page also lists 2026 special hours. No temporary exhibit, event date, or admission price beyond current free museum entry was invented.

Madira Bickel Mound and Culverhouse were considered but omitted after direct official-page retrieval returned 403. Indexed snippets were not promoted into this batch. The initial inventory pool also contained businesses whose names include “Beach” despite non-beach primary types; those were not treated as beach candidates.

## Identity and slot checks

A read-only exact-ID query on 2026-10-04 returned exactly these three inventory rows, each `OPERATIONAL`, `needs_review=false`, category `attractions`, metro `manatee-sarasota`, and the primary type recorded in the pack. All three had no `wf_editorial` row, no inventory summary, and no inventory editorial card.

The existing publisher independently found no versioned editorial conflict and no runtime Atlas ID/alias/name or legacy-name fallback. This describes these three identities only. A missing `wf_editorial` row across the wider inventory does not establish an empty place page.

The SQL snapshot is supporting evidence, not a replacement for the canonical publisher's immediate live preflight. Recheck before any insert, and recheck the source pages if publication is delayed.

## Verification and current blocker

- Existing `scripts/publish-owned-editorial.mjs --input <pack>`: **3/3 publishable**, six checked source links, no versioned or runtime fallback conflict. This is a deterministic gate; it does not itself fetch or fact-check the pages.
- Existing `scripts/test-owned-editorial-review.mjs`: **19 assertions passed**, including negative controls for unsourced facts, unrecorded citations, occupied slots, forbidden hosts, thin prose, and incorrect insert results.
- Canonical publisher `--live`: fails with `--live requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY`. This checkout has neither publisher environment configuration nor `.env.local`. No write was attempted and no alternative write route was used.
- Google Places calls: **0**. Anthropic/model API calls: **0**. Paid data-provider spend: **$0**. Research used connected read-only inventory plus public official-source search/retrieval.
- Independent source review passed on 2026-10-04: `Codex /root/astra_oct04_lead` opened all six official sources, checked every factual field, and independently ran the offline publisher (3/3 publishable). This is an agent review, not human or Jev approval. Publication remains blocked by credentials.

## Canonical operator flow

From a configured checkout containing this pack:

```bash
node scripts/publish-owned-editorial.mjs --input docs/editorial/free-first-manatee-sarasota-2026-10-04/researched-editorial.json
node scripts/publish-owned-editorial.mjs --input docs/editorial/free-first-manatee-sarasota-2026-10-04/researched-editorial.json --live
```

After an independent reviewer checks the cited evidence and records their real attribution, use the existing guarded publisher. Its live preflight must succeed immediately before the insert:

```bash
node scripts/publish-owned-editorial.mjs --input docs/editorial/free-first-manatee-sarasota-2026-10-04/researched-editorial.json --commit --reviewed-by '<actual reviewer>'
```

Then read back the three exact IDs from `wf_editorial_servable` and verify `/api/editorial` and the public place detail surfaces. The existing publisher inserts missing rows with ignore-duplicates; it does not reclassify unknown legacy rows as verified or overwrite existing prose. Do not substitute a raw SQL insert for the unavailable publisher credentials.
