// lib/creatorVideosStaged.js — the CURATION BACKLOG, deliberately out of the app.
//
// v8.43. These are held creator finds whose native URLs are known, but whose
// exact branch identity or native availability is not verified: `url: ""`, plus an `evidenceUrl` (commented) pointing at where
// the find came from. Every one of them used to live in CURATED, in
// lib/creatorVideos.js, which is a CLIENT-BUNDLED module.
//
// They could never render from there. renderable() drops any video with an
// empty url, and every reader in that file — creatorVideosFor, videosByKey,
// spotsByCity, creatorStats, allCreators, regionsWithFinds, libraryStats —
// goes through it. So these entries contributed exactly nothing at runtime
// while shipping 16.2KB of unreachable data to every visitor's browser.
//
// The deploy gate is what found it: scripts/check-bundle.mjs failed on the
// route JS budget when a 93-place batch landed, and the honest fix was not to
// raise a ratchet that exists to be lowered — it was to stop shipping data
// nothing can read.
//
// WHAT CHANGED FOR A CURATOR. The old comment in creatorVideos.js promised
// that "a staged entry auto-appears AND auto-boosts the moment its url is
// filled — no other code change needed." That is no longer true, and the new
// workflow is better: fill the url here, then MOVE the entry into CURATED.
// Activating a place is now an explicit, reviewable edit rather than a silent
// one-character change that flips a venue into the live ranking — which
// matters more since v8.42, because a second creator on a place now moves it
// up the list and puts a badge on it.
//
// scripts/test-creator-corroboration.mjs asserts that CURATED holds no staged
// entries and that no runtime module imports this file, so the two can never
// quietly merge back together.
//
// NOT imported by lib/ or app/. Curation tooling only.

export const STAGED = [
  {
    "key": "wingstop-bradenton",
    "match": {
      "name": "Wingstop",
      "city": "Bradenton"
    },
    "address": "3553 1st St E, Bradenton, FL 34208",
    "category": "Food",
    "videos": [
      {
        "platform": "tiktok",
        "url": "",
        "nativeUrl": "https://www.tiktok.com/@flossakushie/video/7397214452225117486",
        "creator": "flossakushie",
        "holdReason": "Native original is an actual Wingstop counter visit and caption says Bradenton, but no exact branch address or location tag establishes staged3553 1stStE. Brand+city cannot prove this branch."
      }
    ]
  },
  {
    "key": "la-violetta-sarasota",
    "match": {
      "name": "La Violetta",
      "city": "Sarasota"
    },
    "address": "4837 Swift Rd Ste 100, Sarasota, FL 34231",
    "category": "Food",
    "videos": [
      {
        "platform": "tiktok",
        "url": "",
        "nativeUrl": "https://www.tiktok.com/@thecrazycreativeteacher/video/7560359530710764813",
        "creator": "thecrazycreativeteacher",
        "holdReason": "Exact URL recovered from the visible Airial source card, but native TikTok browser reports 'Video currently unavailable'. Unable to verify original creator/video at native source; hold attachment."
      }
    ]
  },
];
