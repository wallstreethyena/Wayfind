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
