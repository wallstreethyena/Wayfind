# The Wayfind Share-Card Standard (global marketing rule — owner, 2026-07-22)

Every share card this site emits is a marketing asset. A card earns the share:
the user has to WANT to send it. These rules are build-enforced (check-share-assets).

1. IMAGE-LED, REAL. Full-bleed photo of the ACTUAL subject — the top place's
   best real image (daily hero-images cron / ?img= passthrough), never generic
   art when a real photo is known. Dark legibility gradient into #040810.
2. ONE HOOK. One idea per card, hook-first, human tension or a concrete claim
   the page proves ("One beach beat them all."). No clichés, no clickbait, no
   invented urgency, nothing the landing page can't verify.
3. ONE CTA. A single gold (#E8C97A) pill, imperative, uppercase, bottom-right
   ("SEE THE WINNER", "SEE THE RANKING").
4. CANONICAL BRAND ROW. Official logo asset (its baked #040810 band) +
   gowayfind.com, bottom-left. The orange pin mark must be visible.
5. LIMITED TEXT, MOBILE-FIRST. Eyebrow, headline, one promise line, brand row,
   CTA — nothing else. High contrast; readable at 300px wide.
6. TRUTHFUL NUMBERS ONLY. Any figure on a card is the real metric or absent.
7. PLATFORM-NATIVE LINKS. Shared URLs carry the image ref (?img=) and identify
   their surface so the unfurl matches what the sharer saw.

8. THE ONE IMAGE (amendment, owner, 2026-08-19 — v8.23). Rule 1 above stayed
   image-led in words while the v7.26 build went typographic and BANNED every
   photograph, and that ban is still right for photography. It is not right for
   the rail tiles: the owner drew them, their headline is baked into their own
   pixels, and they ARE the surface being shared — so a preview that redraws
   that headline in Archivo previews a different object than the one the sender
   tapped ("when it goes as a text message are we able to optimize the image to
   make it look like the actual card?").

   The exception is exactly this wide, and no wider:

   · ONE image may appear on a share card: a /cards-v8 rail poster, resolved
     through lib/rails.js. No stock, no place photo, no brand art, no
     hand-written data URI, no third-party origin.
   · It reaches the renderer as BYTES THE ROUTE ALREADY HAS.
     fetchRailPoster() is awaited before any ImageResponse is constructed and
     the body is sniffed for the JPEG magic, so the failure the ban was really
     about — a fetch that dies after the 200 headers are streaming, leaving a
     zero-byte image the CDN pins — cannot occur. A miss falls back to the
     typographic card.
   · The type beside the poster may NOT restate it (rule 5, and v8.1's "dont
     write nothign on top of the card"). It carries the one claim the artwork
     cannot make: that the link ranks around whoever opens it.

   scripts/check-rail-share.mjs asserts every clause; check-share-card.mjs
   still bans an <img> everywhere else, and permits exactly one, in one file,
   whose src is the model field.

9. THE HERO PHOTO (amendment, owner, 2026-09-23 — v9). Owner, verbatim: "the
   share cards for all of the guide and blogs needs to look premium i dont
   like the way it looks right now it looks cheap i need to make sure all of
   the blogs guide and everything on wayfind that is sharable looks premium
   and looks good on social media." His Facebook preview of
   /guides/sarasota-restaurants was a tiny portrait thumbnail beside
   "www.gowayfind.com", because og:image pointed at a raw 1067x1600 webp with
   no card around it. Rule 8's one-image exception was never applied to
   guides, places, towns or events. Approved into this standard by the owner
   on 2026-09-23 ("I also approve updating the share card rulebook so the
   documentation matches the photo based share card standard that is
   actually shipped. Preserve the premium hero photo design.").

   This is a SECOND named exception, alongside the rail poster, and no wider:

   · A HERO PHOTO may appear on a guide, place, town or event share card,
     resolved SERVER-SIDE BY kind + id through lib/heroSource.js: a guide's
     reviewed image (lib/guideHero.js, or heroSource's DEDICATED_GUIDE_HEROES
     entry for a guide that ships its own route), a place's free, permanent,
     licensed photo (wf_place_photo; never a metered Google Places photo), or
     an event's owned, consent-cleared photo. The route reads NO photo source
     from the query string: there is no ?src= and no ?pos=, so a caller can
     never put another image under the Wayfind mark. /api/photo never appears
     in any og:image.
   · It reaches the renderer as BYTES THE ROUTE ALREADY HAS, exactly like rule
     8: app/api/og/hero/route.js fetches the photo, converts it with sharp to
     JPEG, sniffs the JPEG magic and hands Satori a data URI before any
     ImageResponse is built. Any miss falls back to the typographic card with
     THIS page's own title (a place keeps its name, category, city and rating),
     never a hole and never the generic homepage line.
   · The design is the premium hero: 1200x630, full-bleed photo cropped at the
     reviewed focal point, a dark scrim (bottom and left, into #040810) so the
     mark, the uppercase kicker (category · place) and the page's own headline
     stay legible over any photo, 72px safe margins. Output is image/jpeg.
   · A rating on any card names its source ("Google reviews"); the stars are
     Google's, not Wayfind's.
   · Caching: a page's og:image carries v=<photo reviewedAt>.<HERO_CARD_DESIGN_V>
     (lib/heroCard.js). The route serves the year-long immutable cache ONLY
     when v ends with the current design version; anything else gets the short
     live cache. Bump HERO_CARD_DESIGN_V on every visual change so every card
     already cached by the CDN, Facebook or X is replaced.

   scripts/check-hero-card.mjs asserts every clause above against the code and
   asserts this rule 9 text is present here; check-share-card.mjs permits
   exactly two <img> elements in app/api/og/card.jsx, one whose src is
   {m.poster} (rule 8) and one whose src is {m.hero} (this rule), and still
   bans an <img> anywhere else in the OG surface.
