# Blog-wide editorial upgrade

## Scope and ownership

Owner request: audit and upgrade every Wayfind blog, especially mismatched hero photography and the oversized generic mobile introduction. Apply the Wayfind Blog skill. Preserve quality while minimizing repeated research and model work.

Baseline: main `274ca9c3b193524a50da1df4c1c6fc945ee526d2`, inspected 2026-09-09. The complete `GUIDES` registry has 41 articles. The before-state census is in `docs/audits/blog-editorial.json` and its readable companion. All 41 baseline production URLs returned HTTP 200; this proves availability, not fact accuracy or visual quality.

The separate `/culture`, `/florida/[town]`, and dynamic `/florida-events` collections are recorded in the census as adjacent surfaces. They are not silently counted as audited guide articles.

Work was divided into three bounded lanes:
- Sol: explicit per-guide image assignments, source/rights records, optimized local assets.
- Sol: a guide-only article masthead with specific copy, meaningful image captions, and compact reading/share actions.
- Luna: per-slug census, source/date/coverage flags, and overlap review.
- Lead: scope, integration, hub coverage, regression checks, release review.

No paid provider research, Google Places requests, or image-generation spend is required by this implementation.

## Concrete failure and repair

The previous hero selected dining art when `/date/` matched the word `Dated` in the Orlando fall-events title. Only three guides had explicit art. Every guide repeated its H1 inside a marketing description and put a large reading button after an unrelated brand slogan. The index grouped all guides but rendered only four hardcoded regions, excluding 16 guides.

The new header is a server component with scoped CSS. It presents the actual title and guide summary before the photograph on mobile. Photography is selected from a slug manifest, with subject description, dimensions, focal point, and attribution. The existing shared PremiumIntentHero remains for other surfaces; this does not redesign culture or commercial landing pages.

The index now renders every region and links every guide exactly once, with topic images and responsive cards. Existing article URLs, conversion destinations, affiliate disclosures, share behavior, and place-card contracts remain in place.

The fall guide's public title becomes “Orlando Fall Events 2026: Halloween, Festivals and Food.” Its slug is unchanged. The global date label becomes “Updated”; the code no longer pretends every content update is a factual verification or invents a publication date from an update field. Existing editorial dates are not advanced.

Ten summer editions receive a clear dated-edition notice and a route to current events. This is containment, not completion of their previous removal/refresh instruction. Retiring or comprehensively researching those articles remains a separate recorded editorial decision.

## Existing work

Open PR #1201 covers six guides' body typography, section navigation, and exact venue resolution. Do not create competing six-guide fixes or discard that work. This change adds the full-portfolio header, image mapping, hub coverage, and census. Local integration preserves #1201's exact-name matching and null-appQuery behavior; its old PremiumIntentHero description/caption hunk was superseded by GuideArticleHero.

## Release gate

Require complete image-manifest coverage and actual asset bytes, source/rights review, existing guide/share/CTA guards, the new runtime editorial guard, JSX checks, full guard runner, production build, and bundle budget. Rendered static assertions do not prove mobile appearance or native sharing.

The cloud browser inspected the old production guide. It rejected localhost with ERR_BLOCKED_BY_CLIENT. Hosted preview visual checks are therefore still required: verify actual 390px and desktop layout, title/image relevance, long titles/credits, photo loading, reading-anchor scroll, and share feedback. Never label desktop width as mobile verification.

Publication is not claimed. AGENTS.md section 11 requires owner approval before branch publication, PR changes, or deployment. Complete the local patch and checks first, then request approval for the concrete reviewed change and hosted preview.

The six-guide body typography now applies to all guide articles. Every article has native, collapsible contents linking to each stop. Venue resolution fixes from #1201 are merged locally, including exact-name matching and intentional null app queries.

## Validation results

- New guide editorial guard: 586 assertions passed across all 41 manifests, rendered mastheads, stop navigation, and 16 hub regions.
- JSX, guide schema/navigation, share, teaser, event-ticket CTA, hero chrome, art assets, and exact venue resolver checks passed. Exact resolver guard includes a failing mutation control.
- The first full suite stopped at guard 374/583 because its St. Petersburg discovery assertion required the old hardcoded region list. The assertion now calls the shared grouping function, proves the St. Petersburg guide is reachable, checks that the hub consumes the grouping, and includes a negative control removing the guide. Its 31 assertions pass. A complete rerun follows this correction.
- Required placeholder build: compiled successfully, but execution was interrupted during static generation when network approval was cancelled. This is not a completed build pass.
- Offline fallback build: passed with the Supabase URL unset, exercising the existing degraded inventory path. No application networking behavior was changed to obtain this result.
- Actual generated HTML from the offline build: 41/41 titles match the registry; assigned images and every stop anchor are present; the hub renders 41 article cards and links every guide. This does not test live inventory or visual layout.
- Bundle budget passed: homepage total 494.6 KB gzip against 498 KB, 3.4 KB headroom. This is the existing homepage budget, not a guide-specific Core Web Vitals claim.
- Final contact sheet reviewed by lead. Corrected descriptive mismatches and replaced the Winter Park archival postcard with a current streetscape context image. Nine contextual, archival, or generic-subject choices remain explicitly recorded in `docs/audits/blog-images.json`; source-specific original photography is still desirable.
- Hosted mobile/desktop visual review and the connected build remain release prerequisites. No branch push, PR publication, merge, or production deployment has been performed for this upgrade.

The next integration issue was a rail-specific source scanner interpreting `{deck}` in the article hero as a rail caption. Article/page headers are explicitly outside that rail rule's scope. The article variable is now named `introduction`; its visible wording and wrapping are preserved, and the existing rail guard is unchanged (175 assertions passed). The guide navigation count says “sections” because some entries are planning advice rather than physical stops. Final JSX/render assertions cover both adjustments.

Some repository guards explicitly skip Chromium measurements when no browser is available. Their source-level passes are retained as such; no aggregate guard result here certifies visual browser behavior.

Final local verification: the complete unmodified guard runner passed 583/583 commands plus its one credentialed CTA rerun in 445.2 seconds. The final offline Next production build passed; the final bundle remained 494.6 KB gzip against 498 KB. `git diff --check` passed. These results include the final article introduction naming and “sections” navigation label. The network-dependent placeholder build and hosted browser checks remain outstanding as described above.

Prepared publication target: extend existing draft PR #1201 on `codex/premium-six-guides` after owner confirmation. Its current head `6472b523ab744231fc17f5366dc852f82c2658e4` is an ancestor of this local branch; recheck the remote head before publishing. Keep the PR draft until the hosted review is complete.
