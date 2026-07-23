# Wayfind share-card artwork

These are visual-only Open Graph assets for Wayfind share links. The copy,
location, counts, scores and calls to action remain live in the existing OG
routes; never bake copy, logos, ratings, map pins or venue claims into these
images.

## Assets

| Asset | Used for |
| --- | --- |
| `nearby-v1.png` | Default nearby, saved-list, weather and uncategorized shares |
| `stays-v1.png` | Hotels, stays, resorts and lodging shares |
| `cozy-indoor-v1.png` | Cozy indoor and rainy-day shares |
| `shopping-v1.png` | Shopping and retail shares |
| `date-night.jpg`, `night-out.jpg`, `where-to-eat.jpg`, `hidden-gems.jpg`, `outdoors.jpg`, `family-fun.jpg` | Existing experience-specific shares |
| `coupon-share.png`, `world-cup.png` | Finished specialized share cards |

Each image is 1200 × 630 and intentionally keeps the right side visually quiet
for the dynamically rendered Wayfind content. Resolve artwork through
`shareVisualFor()` in `lib/shareCards.js`; do not add image choices directly to
individual share buttons.

## Search and social behavior

The share page metadata supplies the human-readable Open Graph title,
description and image dimensions. This keeps previews legible in social feeds
while allowing Wayfind's live list and place intelligence to stay accurate.
