# HOLD — Cirque Italia (no ChIJ)

Official pages only. Zero Places. Do not invent.

- Official: https://cirqueitalia.com/
- About: Aquatic Spectacular; custom 35,000-gallon water stage under a traveling tent; rain curtains and fountain jets. Founded 2012, Manuel Rebecchi.
- HQ: 2903 Ninth St W, Bradenton FL 34205
- Legal: 306 Whitfield Ave, Sarasota FL 34243
- Box: 941-704-8572
- Tickets (live): Metropolis (MN/WI), Atlantis (PA/NJ/NH), Nautilus (AB / Rocky View), Paranormal (other states). No Sarasota / Bradenton / Palmetto current sit.
- Last official Gulf-coast tent: Gold Unit Palmetto FL Jan 3–6 2025 at Riviera Dunes — **past**. Do not treat as current.
- No named award on official pages. Do **not** claim Clown d'Or / medals.

## Why this is HOLD, not a card

Live sitemap https://www.gowayfind.com/sitemap.xml has 758 `/places/ChIJ…` and **zero** cirque / italia / circus hits. Repo `data/atlas/atlas-590.tsv`, `editorial-cards.json`, and owner batches 2026-08-29 a–d have **no Cirque Italia ChIJ**.

The in-app pin the owner opened is client inventory (Google nearby), not a published `/places` page. That listing is the office / legal pin (Whitfield / Bradenton), not a public tent. Sending people there is a trust bug.

## Rule

- If the pin is HQ / legal / unknown: **why EMPTY**. Do not send people to HQ.
- If a future public-tent Place ID is identified: store the sourced two-beat in `CIRQUE_ITALIA_PUBLIC_TENT_PLACE_IDS` + `CIRQUE_ITALIA_TENT_WHY` (`lib/cirqueItalia.js`).
- Proposed tent two-beat (only then): "Custom 35,000-gallon water stage under a traveling tent — acts play over the pool with rain curtains and fountain jets."
