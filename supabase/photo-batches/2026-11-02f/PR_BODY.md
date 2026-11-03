# Photos for 45 imageless place cards (batch 2026 11f)

Adds 396 verified photos (1280x853 JPEG, cover first, official venue websites first, then CC licensed Wikimedia Commons photos of the exact place) under public/place-photos/batch-2026-11f and SQL in supabase/photo-batches/2026-11-02f (apply.sql, undo.sql, before_snapshot.json, manifest.json, manifest.csv). UPDATE only on existing place_ids and only where photos and photo_gallery are still empty; no new cards. The URL allowlist already accepts this batch folder.

## How to undo

Run supabase/photo-batches/2026-11-02f/undo.sql (clears photos and photo_gallery only where they still point at batch-2026-11f), then revert this PR to remove the image files.

| place_id | name | photos | source |
|---|---|---|---|
| ChIJ-WgWlqq12YgRLqHWVu34USo | Bella Miami Beach | 13 | official site |
| ChIJ1RqNFQB954gR3YpxvP7m-Gs | Jabal Coffee House | 12 | official site |
| ChIJ7e4ZhRQ5w4gRW7u641t5TI8 | Linger Lodge Restaurant & Bar | 8 | official site |
| ChIJEVbdY68Z24gRFTJkr-rdchQ | The Perry Hotel Naples | 10 | official site |
| ChIJEzhQ2eJBw4gR73MSY69EAns | The Inn on Siesta Key | 12 | official site |
| ChIJFdsuKwDFwogRNyTrKi7NGtE | Oak & Ola | 14 | official site |
| ChIJFfA3AgDHwogRn2m2zxNrPpc | Shanghai Dumpling House | 12 | official site |
| ChIJGSNNSQDDwogRlqbKZkvMt8o | Giancarlo’s | 12 | official site |
| ChIJGe1hcGmz4IgRT3TZ75307Cw | Zero Gravity Wine Bar | 7 | official site |
| ChIJJ3vEovE8w4gR3c2-XGPuF_4 | Casa Di Pizza | 5 | official site |
| ChIJL7mUpQlqw4gRKC7OHzeArJE | Siesta Key Beach Resort and Suites | 5 | official site |
| ChIJOVlxm71bw4gRExkYoPxW28c | Tropical Villas of Venice Beach | 14 | official site |
| ChIJQTbtpGNbw4gRytP88QU-p7w | Casey Key Resort ®   Best Beach Resort ON Casey Key   Gulf Shores | 12 | official site |
| ChIJR7KXbB_LwogRc-iB55U1AHQ | Pemberton Haunted Acres | 5 | official site |
| ChIJRc3ulAERw4gRR-XKZC-_SQM | Compass Hotel Anna Maria Sound | 9 | official site |
| ChIJX_xfN8sjw4gRk4k8uynBAnQ | T4 KartPlex | 6 | official site |
| ChIJYWAVz2HfkogR1C_ap5AI570 | Florida Caverns State Park | 5 | official site |
| ChIJ_7PQ3B_FwogRe-JJpGpKs38 | Dip and Happy | 10 | official site |
| ChIJcYrqFzYQw4gR9SdE0KKBOcU | Anna Maria Island Dolphin Tours | 5 | official site |
| ChIJeV95qpHhwogRMcrsOceT8Lw | Exquisite Bistro | 10 | official site |
| ChIJj2CAFaOVwogRF2YSVVe5Uvk | The Vanilla Bean | 5 | official site |
| ChIJk2lxnh5_54gR4KAHboQfZgI | Corazon by Baires | 14 | official site |
| ChIJkwUpI8G20YgRd8VLyYig4Xs | 5 Brothers Key West Coffee & Cubanos | 6 | official site |
| ChIJoVf1MAbFwogRidvzt2obVtY | Showbar Ybor | 5 | official site |
| ChIJq6q6ujDiwogRxFvyGOkUW9A | The Urban Stillhouse | 6 | official site |
| ChIJvYrKHZ5Bw4gRiPEjBDiSWbE | Vino Bistro of Sarasota | 10 | official site |
| ChIJz5TQ0pYTw4gR83K9EyRe80k | Silver Sands Gulf Beach Resort | 11 | official site |
| ChIJzQJrFNfpwogRXVE296Q-hIM | Palmette Brasserie & Bar | 14 | official site |
| ChIJ2xLazC4t74gRvvWbcPOcRIc | Ichetucknee Springs State Park | 11 | wikimedia commons |
| ChIJF06M0-_FwogRirItJy_x26M | Ybor City Ghost Tours Co | 8 | wikimedia commons |
| ChIJK7dezdJa54gReRv7JoUKocA | Fort Christmas Historical Park | 11 | wikimedia commons |
| ChIJLaXWcqCNwogRM9JpPLc64RE | Tarpon Springs Sponge Docks | 9 | wikimedia commons |
| ChIJM5Edegyx0IgRuF7SUFDyj5o | Ernest F. Coe Visitor Center | 7 | wikimedia commons |
| ChIJPylah1XxwogR9E_DFv5PZXc | Caladesi Island State Park | 7 | wikimedia commons |
| ChIJT1AHehWA3YgRkYNkOPfOHJw | Basilica of the National Shrine of Mary, Queen of the Universe | 10 | wikimedia commons |
| ChIJWTX7kWvn3ogRRjQhNzC11RQ | Children's Museum of the Treasure Coast | 5 | wikimedia commons |
| ChIJhaIxXaNbw4gRTOeKz2fPVpI | Epiphany Cathedral | 7 | wikimedia commons |
| ChIJq2_1qUxA6IgRCarDmMlmNgQ | Three Sisters Springs | 10 | wikimedia commons |
| ChIJzR4b3G8t5ogRPsLjAS-ar1Q | Silver Springs State Park Glass Bottom Boat Tours | 14 | wikimedia commons |
| ChIJCWkQaQ9_3YgRrPmTayzd6SE | Space 220 Restaurant | 11 | official site |
| ChIJLzrMgQtbw4gRBTcGzUvOtDU | Nokomo's Sunset Hut | 6 | official site |
| ChIJM9EbYkPa5ogRVbXxSnO5Sz8 | Hard Rock Hotel Daytona Beach | 5 | official site |
| ChIJd2HY14rFwogRuH8a8LkpXXQ | Tangra Nightclub | 5 | official site |
| ChIJvSxLO-APw4gRQaKnDujbiZg | Harry's Grill | 8 | official site |
| ChIJw3Z_hMsD54gRs2E9zBypvo8 | Old Sugar Mill Pancake House | 5 | official site |

Total: 396 photos across 45 cards.
