# Shared photo loading audit

Base and observed production revision: `885a78d14c5f4ef2b30289886b3b0b21835d8eed`.

## Evidence

The owner supplied Cafés (Jersey Bagels, Joy Coffee) and Night out / Clubs (Joyland, Eyz Wide Shut) screenshots. Several cards show the loading surface; Eyz Wide Shut shows the branded error fallback. These are different states and cannot all be counted as one proven cause.

`FallbackImg` in `app/home.js` reset `loaded` whenever either `src` or `fallbackSrc` changed. Changing only the backup URL after a primary photo loaded hid that primary permanently because its unchanged DOM image did not emit another load. The original function fails the new executable regression test on this case. It also had no completed-image reconciliation and no deadline for a stalled visible request.

Consumers include main category/subcategory place cards, menu lunch picks, detail heroes/gallery/video thumbnails, hook detail sheets, Surprise, map event previews, and favorites thumbnails. Other card renderers have their own error handling and were not changed or claimed fully audited in the browser.

A no-spend production probe for Joy Coffee (`ChIJ1U_vFp0Xw4gRGKl6mJGJ9UI`, width 640, `x-wayfind-photo-probe: 1`) returned `302`, `x-wayfind-photo-result: inventory-ref-cache`. Its final URL returned `200 image/jpeg`, 55,982 bytes. This proves an existing usable photo is available for that venue, not that its exact screenshot request has been reproduced.

Live browser Food results initially had pending lazy photos, then Hashtag Café, Le Mans Kitchen, and Empanadas Valrico completed with natural width 640. Browser operations repeatedly timed out, preventing reliable café/club reproduction or a complete live menu census. Pending offscreen lazy images alone are not evidence of failure.

## Repair

Keep outcomes by actual image URL. Reconcile `complete` and `naturalWidth` after mounting/changing the active URL. Try an available backup immediately when the primary is absent. Promote only visible native lazy images to eager loading. After 15 continuous visible seconds without completion, use the existing fallback chain. Disconnect observers and clear timers when the source, outcome, visibility, or component changes.

No photo source, provider budget, ranking, refresh interval, or cache lifetime changes. This does not repair an unavailable upstream photo or prove all fallback pins are fixed.

## Verification

- New executable component lifecycle guard passes; original component fails the loaded-primary/fallback-update assertion.
- Five additional checks mounted the actual function through React DOM: load, fallback-only update, cached completion, primary error to backup, and final error to artwork.
- Existing house-card photo test: 50 assertions passed.
- Existing photo error fallback guard: 23 assertions passed.
- JSX check passed.
- All 616 manifest checks plus one credentialed rerun passed across the initial run and explicit resumed runs. Registry registration was corrected; a temporary-file ENOSPC failure was rerun with TMPDIR=/dev/shm. No guard was skipped or weakened.
- Guard manifest, honesty, and regenerated registry checks passed.
- Production build compiled but the process was killed with exit 137 during page-data collection. Full production build and preview visual acceptance remain release gates.
- Not pushed, merged, deployed, or verified as repaired in production.

## Event hotel follow-up

Fetched the live HHN event HTML and found six hotel image requests. The exact Riviera Resort and Animal Kingdom Lodge requests both return `404`, reason `probe-no-spend`, at widths 640, 800, and 1200 with the explicit no-spend header. This is evidence that the free serving ladder did not find an image for those requests; it does not prove that normal requests are denied a paid grant, nor that no image exists anywhere. `EventStayCards` uses `IconicPlaceCard`, which already handles image errors as monograms and is not fixed by the `FallbackImg` change. Backend cache inspection is a separate required follow-up before claiming these images restored.

Read-only production database verification subsequently found, for each of the two exact hotel IDs: an inventory photo reference; no signals.photo_url/photoUrl/photo; zero wf_place_photo rows across all statuses; zero photo-family cache rows across the exact recovery-key range with no width or expiry restriction. This supports missing available photo assets, not a width-selection or expired-reference recovery defect. No database writes or paid acquisition were performed. Restoring those hotel photos requires verified same-venue photo acquisition into the existing free-photo pipeline; client lifecycle changes alone cannot restore them.

## Owner follow-up: budget, quality, and cache (2026-09-11)

Owner requested 5,000/month, interpreted as photo requests (the existing cap's
unit), not dollars. The production configuration change is
`GOOGLE_PHOTOS_MONTH_CAP=5000` with `WAYFIND_PHOTOS_PAID=1`; keep other SKU budgets
and the global gate unchanged. Production env write capability is not exposed in
this session. No deployed environment variable or ledger cap was changed. Updating
only the ledger row would not configure the caller's enforced ceiling. A new
deployment is required after the production environment change. Added executable
proof that the configured 5,000 limit reaches the atomic ledger, refuses denied
requests, and does not increase any other SKU's allowance.

Photo selection fixes: absent/malformed scores are unknown, a worse clean image
cannot replace a better clean primary, effect replay and later candidate arrivals
resume selection, in-flight requests are shared, and alternates are bounded to five.
The existing primary-first scoring gate remains. This fixes selection logic; it
cannot guarantee photographic quality when suitable source candidates are absent.
No live AI scoring or paid photo retrieval was performed for this change.

Both event page types use EventExperienceStyles. Their nearby photos were forced
into 9:16 portrait frames. Changed the shared frame to 4:3 and positioned the image
inside it so the intended aspect ratio determines its height. This reduces the
severe crop of ordinary venue photographs without requesting additional pixels or
substituting another venue.

Correction to earlier caching advice: current official Places photo documentation
explicitly prohibits caching photo names. Maps Service Terms section 14.3's 30-day
allowance concerns latitude/longitude, not a blanket photo allowance. Accordingly
this patch does NOT extend Google-photo caching to 30 days. Existing cache behavior
needs a separate provider-policy remediation; this patch does not certify it.
Wayfind-owned or separately licensed images can use a 30-day cache where their
license permits it. Sources:
- https://developers.google.com/maps/documentation/places/web-service/place-photos
- https://cloud.google.com/maps-platform/terms/maps-service-terms
- https://vercel.com/docs/environment-variables/managing-environment-variables

The latest attachment c7e08ab5-0d47-425d-a340-76cb996678bc.png failed transfer;
no file-level visual inspection was possible.

### Follow-up validation

Rebased all changes onto main 66171afe74646c203cba6f233a61e05e967ab0d4.
617 manifest checks + 1 credentialed rerun passed in segmented execution: first
556 in the full runner, then remaining 61 after adding direct production refOf
boundary tests to the executable selector harness to satisfy guard classification.
No guard was skipped or exempted. JSX check exited 0. The placeholder-configured
Next build compiled in 19.2s, generated 544/544 pages, collected traces and printed
its final route report; the tool lost the process completion status, so its exit
code was not captured. Live visual verification remains pending deployment.
Logs: /dev/shm/wayfind-quality-guards.log,
/dev/shm/wayfind-quality-guards-resumed.log,
/dev/shm/wayfind-quality-jsx.log, /dev/shm/wayfind-quality-build.log.

### Publication coordination

Before publication, main advanced to 1f0bf59 (#1275 hotel booking). Rebased cleanly;
loader, selection, 5000-cap and registry checks pass afterward. Open PR #1278 owns
the event portrait-rail standard and #1279 owns creator playback collapse. Removed
this branch's EventExperienceStyles change to preserve the owner's tall-card
standard and avoid competing with #1278. The earlier 4:3 proposal is superseded;
this PR now repairs loading and source selection without changing event geometry.
Owner approved branch publication and opening the PR. Merge/deployment and live
acceptance are separate remaining steps; production budget is still not changed.
