# Discovery rail standard

Every new or changed discovery rail uses the same presentation components.
The content and ranking may vary; the layout and waiting experience do not.

Place cards follow `docs/ui/place-card-standard.md` and AGENTS.md section 14.
Their body height is 268px and their responsive width comes from the one
shared sizing contract. Wrappers must not add their own card geometry or look.

* Use `RailHeading` for the title and description. Its title uses the shared
  bold sans serif font, including Family and seasonal rails. Let long copy wrap.
* Put `RailNav` inside the heading. Counts use green, bold, tabular numbers.
  Supply `loaded` with the actual loaded count and `total` with the known total
  for paged rails. Never claim a total that the data does not establish.
* Keep keyboard accessible previous and next controls, horizontal scrolling,
  portrait media, and the existing shared place card layout.
* Use `RailLoading` while a whole rail is pending and `PlaceCardSkeleton` for
  additional card placeholders. Both use the neutral `wf-sk` shimmer.
* Do not add brand pins, mascot loaders, bouncing cards, staggered entrances,
  or custom loading keyframes. Respect reduced motion. Image decoding remains
  owned by the shared image component, separately from rail data loading.
* Keep successful empty rails hidden and failures retryable. Do not change
  deadlines, paging, ranking, location filters, caching, or booking to style a rail.

The Wayfind wordmark is a deliberate return to the main poster shelf at the
top. Back and Forward retain their own position restoration behavior.

`scripts/test-rail-visual-standard.mjs` checks the shared components and their
callers and runs in the regular guard suite. Check the rendered layout on small
and large screens before releasing further visual changes.
