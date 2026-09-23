> **PROPOSAL — not yet the standard.**
>
> `check-doc-ownership` makes `docs/share-card-standard.md` owner-only, and this
> lane may not modify it. Rather than bypass the guard by changing commit
> identity, the amendment below is staged here instead, exactly as
> `claude-exe-share-card-v2.md` staged the v2 merge before it.
>
> **Owner action:** append the "Rule 9" section below to
> `docs/share-card-standard.md` (after rule 8, the rail-poster exception) and
> delete this proposal. Nothing in the codebase asserts this text's presence in
> the canonical doc — `scripts/check-hero-card.mjs` enforces the RULE (the
> photo resolution order, the SSRF allowlist, the fallback-never-a-hole
> contract, the crop/scrim geometry) directly against the real code, so this
> file blocks nothing if it sits here a while. Comments in the touched files
> point here (`docs/proposals/claude-sonnet-hero-photo-standard.md`) rather
> than at a `§9` that does not exist yet in the standard itself.

# Rule 9 — The Hero Photo (amendment, owner, 2026-09-23 — v9)

Owner, verbatim: "the share cards for all of the guide and blogs needs to look
premium i dont like the way it looks right now it looks cheap i need to make
sure all of the blogs guide and everything on wayfind that is sharable looks
premium and looks good on social media." The complaint was concrete, not
vague: his own Facebook preview of `/guides/sarasota-restaurants` showed a
tiny, left-aligned PORTRAIT thumbnail next to "www.gowayfind.com" — because
`og:image` pointed straight at the reviewed guide asset, a raw 1067x1600 webp,
with no card, no crop, no brand and no legibility treatment around it. Rule
8's typographic-with-one-exception direction was right for the surfaces it
was written for; it was never applied to guides, places or events, and a
bare, uncropped photograph is not what either v7.26 or v8.23 asked for.

This amendment adds a SECOND named exception, alongside the rail poster, and
it is exactly this wide:

- A HERO PHOTO may appear on a guide, place, town or event share card,
  resolved through `lib/heroSource.js`: a guide's own reviewed image
  (`lib/guideHero.js`), a place's FREE, PERMANENT, licensed photo
  (`wf_place_photo` via `lib/freePhoto.js` — never a metered Google Places
  photo; `/api/photo` stays banned from every `og:image`), or an event's
  owned, consent-cleared photo (`lib/eventPhotos.js`). No stock photography
  borrowed to decorate a claim, no unlicensed scrape, no third-party origin
  outside a short, code-reviewed allowlist for the rare page that carries its
  own credited photo inline rather than in a registry.
- It reaches the renderer the SAME way the rail poster does: BYTES THE ROUTE
  ALREADY HAS. `app/api/og/hero/route.js` fetches the source photo, converts
  it with sharp to a JPEG (Satori decodes JPEG only — the guide registry
  stores webp), sniffs the JPEG magic bytes, and hands Satori a data URI —
  all BEFORE any `ImageResponse` is constructed. A miss at any step falls
  back to the existing typographic card, carrying this exact page's own
  title (never the generic homepage line) — a guide or list keeps its name
  and place; a place keeps its name, category, city and rating. The fallback
  is never a hole and never generic.
- The crop is the reviewed FOCAL POINT (`lib/guideHero.js`'s `position`),
  applied via Satori's own `objectFit`/`objectPosition` — the same technique
  the rail poster already proves this renderer supports — never a
  hand-cropped file. A dark scrim (bottom + left, into `#040810`, the same
  ink the rest of the brand sits on) keeps the mark, the kicker and the
  headline legible over any photo.
- The type beside the photo is a kicker (category · place) and the page's own
  headline — never a restatement the reviewed caption already makes, and
  never the card's ONLY content the way the banned raw-webp `og:image` was.

`scripts/check-hero-card.mjs` asserts every clause above; `check-share-card.mjs`
now permits exactly two `<img>` elements in `app/api/og/card.jsx` — one whose
`src` is `{m.poster}` (rule 8) and one whose `src` is `{m.hero}` (this rule) —
and still bans an `<img>` anywhere else in the OG surface.
