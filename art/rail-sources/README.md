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
| `datenight.png` | `datenight` — BEST NIGHT. / EVERY DETAIL. | 2026-08-29 |

Regenerate with:

    node scripts/make-rail-art.mjs art/rail-sources/<file> <rail-id>

Date Night is 2:3, not 9:16 — regenerate it with `--preserve-frame` so the
ladder keeps the full poster (no cover crop):

    node scripts/make-rail-art.mjs art/rail-sources/datenight.png datenight --preserve-frame

then re-pin the rail in `scripts/check-rail-art-matches-copy.mjs`, and bump
`RAIL_ART_V` in `lib/rails.js` if the filenames did not change.
