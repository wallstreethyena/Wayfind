# Wayfind Guide Visual Standard (GVS v1)

Owner directive, 2026-09-22: "i want all of our guides to use this style
https://www.onlyinyourstate.com/florida … all of the guides need to look premium
like this and there needs to be a rule and instruction on the site that will
always leverage this standard for all of our guides … never create pictures like
that ever again" (said of tall, uneven photo strips), plus "dont change the main
page — only the guide and blogs".

This file IS that rule. Every guide and blog article on Wayfind complies with it.
`scripts/check-guide-visual-standard.mjs` enforces the machine-checkable claims
and blocks CI when a page drifts. Surfaces outside `app/guides/**` (the home app
shell, city and category landing pages) are out of scope and must not be
restyled to match.

## GVS-1. Image shapes are fixed by role, never by the photo

| Role | Ratio | Where |
| --- | --- | --- |
| Article hero | 16:9 (4:3 below 640px) | `GuideArticleHero` |
| Numbered pick photo | 16:9 | every pick in a guide body |
| Gallery tile | 1:1 | multi-photo galleries (e.g. Pinto's) |
| Index card | 16:10 | `/guides` grid |

No masonry, no `column-count`, no per-photo heights, no ratio outside this table.
A photo that does not fit its frame is cropped by `object-fit:cover`, never
allowed to set the row height.

## GVS-2. The five-rule CSS set (the `height:auto` trap)

Every ratio'd image ships all five declarations together:

```css
aspect-ratio: <role ratio>;
width: 100%;
height: auto;      /* REQUIRED */
object-fit: cover;
display: block;
```

`height:auto` is mandatory because `GuidePhoto` emits the photo's intrinsic
`width`/`height` as HTML attributes. Those attributes are a presentation hint
that gives the box a definite height, and a definite height defeats
`aspect-ratio` silently. That is exactly how the Pinto's gallery shipped as
tall strips on 2026-09-22. If you add an `aspect-ratio` to a guide image and do
not add `height:auto`, the guard fails the build.

## GVS-3. Caption and credit under every photo

Directly under the photo, 8px gap, 13px, muted, never over the image:

    Caption sentence. Photo: Credit

The credit links to the source. A license code (CC BY-SA 4.0, Unsplash License,
Pexels License, or a permission line) follows when the licence requires it. A
Google place photo carries the attribution its provider returns. Captions
describe only what is visible in the frame; a photo that does not show the named
place says so in its own words ("Illustrative photo. …"), per
`lib/guideImagePolicy.js`.

## GVS-4. Article shape

Hero → intro (the useful answer) → contents → numbered picks → plan-your-visit
facts → FAQ → related guides. Picks are numbered `01`, `02` … in the accent
colour, photo first, then prose, then the insider note. Text measure stays at or
under 68 characters (about 720px). Section rhythm is 64px desktop, 48px mobile,
on an 8px base.

## GVS-5. Photography ladder for picks (free first, honest always)

1. An owned or permission-granted photo of that exact place
   (`public/places/**`, `lib/curatedOwnedPlacePhotos.js`, credited in
   `CREDITS.md`).
2. The place's own photo, but only when Wayfind already holds it (cache or
   inventory). A guide must never trigger a paid Google lookup: a miss renders
   no photo rather than escalating to spend, and `/api/photo?ref=` is never
   used from a guide. Large place photos carry the provider's attribution in
   the caption line.
3. A licensed photo (Wikimedia CC, Unsplash, Pexels) that genuinely depicts that
   place.
4. No photo. The pick renders as a typographic block and records why
   (`imageReason`). A generic stock photo under a named place is banned: the
   place card rule "no card ships without a picture" never licenses a picture
   that is not of the place.

Illustrative stock is allowed only for an article hero, with the disclosure the
image policy already requires.

## GVS-6. Nothing renders blank

Every image box reserves its ratio before the bytes arrive, so a guide never
shows a black hole while the hero loads and never shifts layout after it does.
The hero is eager and high priority. Everything below the fold is lazy.

## GVS-7. One implementation, no local re-styling

Guides render through the shared guide components. A guide with its own folder
(Pinto's farm map, the fall explorer) keeps its custom module as a child of the
standard shell; it does not fork the shell. Raw `<img>` in `app/guides/**` is
not allowed outside `GuidePhoto`.

## GVS-8. Scope

Guides and blog articles only. The home page, the app shell and the commercial
landing pages are explicitly out of scope, by owner instruction.

## Changing this standard

Edit this file and the guard in the same commit, with the owner's decision
quoted. The guard's baseline file is a shrinking list: slugs may leave it, never
join it.
