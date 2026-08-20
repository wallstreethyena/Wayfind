# Guide hero art — licence record

Self-hosted, never hotlinked. One file per guide slug; `app/guides/[slug]/page.js`
resolves it through `GUIDE_HERO_ART` before falling back to the keyword branches.

| File | Source | Photographer | Licence |
|---|---|---|---|
| `things-to-do-in-sarasota-florida.jpg` | Unsplash `v0ipCnvovM0` | Nathan Mullet | Unsplash Licence (free, commercial use, no attribution required) |
| `gulf-coast-brunch-and-date-night.jpg` | Unsplash `O2shKYWys8M` | Doğu Tuncer | Unsplash Licence (free, commercial use, no attribution required) |

Resized to 1600px on the long edge at quality 72 (`sips`), which is the width the
guide hero panel renders at on a 2x desktop display.

## Not shipped, and why
- The Pinecraft / Amish guide image the owner sent is an **Unsplash+** file (the
  screenshot carries the Unsplash+ watermark). That is a paid licence tied to a
  subscription; shipping the watermarked file, or an unlicensed copy of it, is not
  something this repo will do. Needs either the owner's Unsplash+ download or a
  free equivalent.
- The magical-dining guide image is a photograph of Cinderella Castle at Walt
  Disney World. The photograph itself may be freely licensed, but the castle is a
  registered Disney trademark and the guide is about a Visit Orlando restaurant
  programme, not a Disney park. Flagged before use.
