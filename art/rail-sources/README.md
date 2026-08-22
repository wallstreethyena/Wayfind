# Rail tile sources

The owner-supplied posters that `scripts/make-rail-art.mjs` resamples into
`public/cards-v8/<id>-{380,760}.{avif,webp,jpg}`.

They live HERE and not under `public/` on purpose: they are build inputs, not
assets anyone should be able to fetch. `public/cards/README.md` describes that
directory as served Open Graph and hero artwork, and a 1.9 MB PNG sitting on the
CDN for nobody is exactly the kind of thing that quietly gets hotlinked.

Keeping the source at all is the point of the directory. The standing
instruction since v8.16 is "when I give you a card for the rail use it EXACTLY
as I provided it" — the v8.15 tiles were redrawn approximations and shipped
under the same filenames, and the owner correctly read that as his art never
being used. With the source committed, the ladder can be regenerated at any
width from HIS pixels rather than from someone's memory of them.

| file | rail id | added |
| --- | --- | --- |
| `cindy.png` | `cindy` — "Your Next Coffee Spot" | 2026-08-22 |

Regenerate with:

    node scripts/make-rail-art.mjs art/rail-sources/<file> <rail-id>

then re-pin the rail in `scripts/check-rail-art-matches-copy.mjs`, and bump
`RAIL_ART_V` in `lib/rails.js` if the filenames did not change.
