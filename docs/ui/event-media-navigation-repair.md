# Event media and navigation repair

Prepared from main `4ec249a62b3d2e5c682e88ad7a3203eb146ea1c8` on 2026-09-11.
The live version endpoint returned that same revision during this investigation.
This document does not claim a release.

## Confirmed failures

- The Howl O Scream Tampa page displayed the multi-event Tampa calendar reel
  `Dc3asu4uUOI` as if it were footage of this event.
- Clicking Wayfind's facade mounted the official Instagram iframe and collapsed
  Details correctly. Instagram then offered a link labelled Watch on Instagram,
  rather than an inline media player. Wayfind cannot control that provider UI.
- The shared shell placed photos after the long information/action block and
  repeated a What it looks like heading.
- ROOST Tampa and JW Marriott photos changed from image requests to monogram
  fallbacks after the hotel rail scrolled into view. This is a real photo failure,
  not just an offscreen lazy-load state.

## Prepared changes

| Surface | New behavior |
| --- | --- |
| Both event routes | One photo-led overview card, followed by existing facts and separate actions |
| Section menu | Horizontal links to actual rendered sections; streamed stays appear when available |
| Map results | Standard IconicPlaceCard rail inside the map panel, visibly labelled as nearby, not the venue |
| Map/card identity | One ordered admission array; pin rank and card rank match; existing governed score is consistent |
| Shared sharing | Native share first; otherwise an on-demand Text message, Email, Copy link chooser |
| Creator associations | Seven dedicated posts retained; eleven roundup mentions and two venue-only posts kept as audit context |
| Instagram controls | View post wording; no promise that a Reel necessarily plays inline |
| Hotel data mapping | Retains valid same-place inventory photo URLs before falling back to a photo reference |

The association audit has 49 retrievable reported links: 45 mapped source
records and four unresolved conversation-recalled links. The mapped records
contain 55 place associations across 52 distinct place keys. The four unresolved
shortcodes are `Dc50nKNB9pJ`, `Dc_wbrxy7dr`, `DdE9KVAlB5y`, and `Dc1zpeROuEE`;
none exists in the repository or reachable Git history, and public exact-ID
search returned no attributable identity metadata. They remain unattached until
the owner supplies a creator/place label or screenshot/caption that proves the
subject. This count is complete only for records retrievable during this audit;
it does not claim access to all prior chat history or a new live viewing of every
source video.

## Checks and release gates

The shared event renderer covers paid/free, cancelled/scheduled, long text, owned
photos, row photos, and missing photos. The old shell was injected into the test
without changing working files: it failed the new photo-before-information
assertion, as required. Dedicated tests execute menu streaming/removal, focus,
share choices/cancellation, map/card identity and standard card actions.
The new checks are registered in guards.txt. The CSS shell mapping is registered
and checked, so the iconic cards cannot silently lose their styling.

All existing manifest commands were traversed locally in two segments. The CSS
mapping and guard metadata failures encountered during integration were repaired
and re-run, without exclusions or a budget increase. Browser-dependent skips and
missing live credentials are not live verification.

Local browser access to the workspace preview was blocked. A hosted preview must
still be checked at 320, 390, 430, 800, 801 and 1440 pixels, including hero/photo
failure, section jumps, horizontal map/stay rails, share chooser keyboard behavior,
and actual creator embed behavior. Production is unchanged until an authorized
release and an exact-revision live verification.

## Unresolved media

The database check found no saved photo in the checked sources for ROOST Tampa.
JW Marriott has two fresh same-place cache rows, including the exact reference
requested on the live page, but still fails in the browser. The no-spend HTTP
probe could not retrieve response headers from this environment, so a failed
route response and a dead cached image destination remain distinct unresolved
possibilities. The data-mapping repair alone does not fix these two ref-only rows.

No approved replacement Howl O Scream video or direct media file was present in
the checked sources. That event has no creator-post claim until a verified,
correctly licensed source is supplied. Guaranteed inline playback requires a
supported player or an authorized direct video file.

No paid discovery, photo purchase, database write, refresh/shuffle change, or
provider cap increase was made. Existing photo-loader PR #1280 was inspected as
a separate dependency; it was not copied or represented as already released.

## Preparation result

The layout and lazy sharing split at `776c4e1` completed the local production
build with exit 0. Its measured bundle is 497.2 KB gzip against the unchanged
498 KB limit, with only 0.8 KB headroom; hosted measurement is still required.
The final follow-up `0a80a10` changes only the unavailable/headless sharing
result from a false copied claim to failed. Its guide-share and real chooser
regressions passed after that change. No separate full build of that small
follow-up is claimed. The working tree is committed and no remote publication,
merge, or deployment has been performed in this task.
