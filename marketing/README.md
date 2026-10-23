Wayfind marketing assets.
Slogan (locked, founder, Jul 3): "Overwhelmed with options? Let Wayfind it."
flyer-v1: 4x9in rack card @300dpi (tourist brochure rack standard). Print
notes: add 0.125in bleed at the shop, convert to CMYK there, stock 14pt+
gloss. Door-hanger variant (4.25x11 + die-cut) generates on approval.
Regenerate/tweak: this PNG is drawn by code; any copy, spacing, or color
change is a one-line edit.

## Social reels (Runway Dev)

`scripts/runway-place-reel.mjs` animates one real place photo into a 9:16
clip for TikTok / IG Reels / Shorts (Runway `image_to_video`, default
`gen4.5`, 5s, 720:1280). It does a dry run unless you pass `--confirm`.

    # 1. once: create a key at https://dev.runway.com and put
    #    RUNWAYML_API_SECRET=... in .env.local (gitignored). Never commit it.
    # 2. preview the exact request (free, no network):
    npm run runway:reel -- --image ./photo.jpg --place "Mai-Kai" --city "Fort Lauderdale"
    # 3. generate (spends credits; see https://docs.dev.runwayml.com/guides/pricing.md):
    set -a; . ./.env.local; set +a
    npm run runway:reel -- --image ./photo.jpg --place "Mai-Kai" --city "Fort Lauderdale" --confirm

The mp4 and a sidecar `.json` land in `out/runway-reels/`, which is
gitignored. Runway's output URLs expire, so the script downloads the file
right away. Rules:
- Only use photos we have the rights to, such as our own or the venue's
  with permission. Never use a creator's frame.
- The default prompt only moves the camera. It must not add people, food
  or signage the venue doesn't have.
- Label the clip as AI-animated when you post it. Point the CTA at the
  Wayfind place or guide URL so bookings go through our `/api/*/go` links.
- A failed or moderated task is still billed, and the script does not retry
  it. Change the photo or prompt before you run it again.
