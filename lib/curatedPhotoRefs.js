// lib/curatedPhotoRefs.js — SERVER ONLY. Photo resource names for curated
// places that are not in wf_inventory.
//
// WHY THIS FILE EXISTS, and why the refs are NOT next to the places they
// belong to (v8.95). Chef Ron Duprat's seven picks sit in five metros the
// owned library does not cover, so /api/photo?place= had nothing to resolve
// and all seven cards shipped blank (owner, 2026-08-30: "these places are
// missing the pictures").
//
// The obvious fix — a `photoRef` field on each entry in lib/chefPicks.js —
// was written, measured, and REVERTED. chefPicks is imported by DaypartRail,
// a client component, so those seven Google resource names (~700 chars each,
// high-entropy, gzip-hostile) shipped to every phone that loads the homepage
// and took the route bundle from 494.9KB to 497.8KB gz against a 496KB
// budget. check-bundle went red, and a red prebuild blocks EVERY deploy —
// including an outage fix. A photo ref is data the SERVER needs to fetch
// bytes; the browser only ever needs the place id it already has.
//
// So the client says /api/photo?place=<id> — the same string for every card
// on the site — and the server decides where that id's ref comes from:
// wf_inventory first, this map second. Nothing here widens what a card may
// wear: lib/placePhoto photoRefOwnedByPlace still holds, and every ref below
// is asserted to belong to its own key by scripts/check-no-imageless-card.
//
// ADDING TO THIS MAP IS A LAST RESORT. A place that belongs in the owned
// library belongs in wf_inventory, where the backfill scripts can refresh it.
// This is for curated rows that are deliberately NOT inventory — testimony
// (a chef's list) rather than coverage.
export const CURATED_PHOTO_REFS = Object.freeze({
  // Fall 2026 venue-identity bridge. These four official event venues were
  // resolved after their event rows shipped without place_id. Inventory wins
  // automatically once promotion lands; until then /api/photo?place= can still
  // serve each card's own verified venue photo instead of collection artwork.
  "ChIJkyg5UW6654gRECAKyCherD8":
    "places/ChIJkyg5UW6654gRECAKyCherD8/photos/AVoNoXSPG8p-5YHb-7ODxEciNL3hzZmPUbvvN6TczIrTdlTUAdoggbnI8ZMiWEmVu6sBN6f4nPoCcIn29T7P-3SXGDqSiiDQTySvF2iInaGje--3TJ6AoaBRCij48Z7ytZp5B9wQNobft1nNQuIGytrOK_ULrKNAGI5PWxbDkF2EdA1C3-OtE9coqdTXrqoPbp2Pl-ZsZvuazNnIRZXUxi4QG_Ww3QxPB91CQ9P21ArI7kfjW_VGvt35VIVULCNnf-i_RKSyMvVA-lnsbyiLKL99eAgS8WMWp3N3XJBfRBnNPzVxUemq9YDVMFPd9_bti009VlgzKbZ3EN5rT6Ab-774uera0saFh414X2hD95Qh9DQlzT4exl_Zx8A8T67y7yZKTjWDb-F0U74yK2Z4zZ5MyOGGh9VJ33sTJmI19eWZCCWadygpqlgJ1iqg0DCseG2M",
  "ChIJ68SLYriZ54gRaJgw169KqYA":
    "places/ChIJ68SLYriZ54gRaJgw169KqYA/photos/AVoNoXSvgqHhkY8mA6ldeYZD9qTPJNamaHZj_vQ-N3F4x7XPyxHnYKhOg7Zd1OP-judF8Rnc2IrWc0GTJH3jdVziGr0RtncD8469itrWa9rLGO57rJhgGJG2EzqzaSlaK8NPISDrxPzqt5Nn4_pFEy41baUHaDTsx0jXni-KbJWCkP_j51wmMXYiYVCL0UepGMArRggOzjZiOnpeZ413PKDPWFL1P4iKMsQXXJAhsTpqdDTmzDYC5bTNcLdI3HXDok9zq2WzAQcFuFwSvjytA63SLXxr6kb7f3pBU3BmCPtgrAs-5fluE2RkXwIyeFbj7BLzVJbxm-EGVpLVdXJz6LOl9SUhbyaNQ3RBQYID6lm52cvaJQkfE9pOoH_o4FiM7VQwIFa_aszPG-qMc5C42cs35tq0cgQc-WS-eFH-ECZI4YDEiw",
  "ChIJ-aI9NvSI54gRrVByB84z-AY":
    "places/ChIJ-aI9NvSI54gRrVByB84z-AY/photos/AVoNoXQSaiDp_oejhAh7GyLG7gCDEyF3R9jS-5j0WYvIQaCIFw-wzSEJCYwKJe7q005_0k3lmL09NAeLphb2mQ0wW5wWSHTZRSWNKkb98mZHcCCdPJxXKAU0UuMUNrW5ydmekeoLFRP5V97Ms3Z_IiqosZLE70QwD8idn2Tmz6eOWFOuqRynibfkSvNqe4gfpdlUl2rfNlmIMLKQbsXZxai1qGcKKPZiNACoJMeAw5gi9U07lxTjkQi2m4t92l9h-kT_YV-Y4nqtazgUhuHdt6-KYfVag5_60LVpn7KndrSd6XhKFLKoO2kMSovJF9jHBMIYXi5iGFvBIExRkID_yyfoFQQSl3Vy6a0GVTaEsruCZDAmiO7cIIXpPvxuWljFIGP6kZ07skQ58YF-71BPEc_urOMZZfn-9Lk-BdTwY7RRtSrh6OY",
  "ChIJQZ8lbY-O54gRJSKIfjA-Wr4":
    "places/ChIJQZ8lbY-O54gRJSKIfjA-Wr4/photos/AVoNoXTLMV9xyzS3lRASsdr2l003Vg8c3FBGDYlzz3FFV-1IE_BO4TQpyq_YsD5XL3Bol2JJq1WGiK7VDJ7l75tFaLoHddBhFVK9vZMkZmPqbxrqG8XAIrH_xNYG1-nCdV5k5gg8z7Bxde74AFKM8JOTOnw4Amgktn5UhvNRx8qyvAPf73R2RMQuOM907vyWbizMA8migpYliQwWTX26uCnUbjHyFpk9N05xjKGbWWBJtvNTydUjDhCDKKzhZNzjX_0oXXM_jSzGRUq7vk4Zolkuw24qDyJFLOPfcS9_wrwUXUh2tX6YoJ88EqH6NSp5z6WXZUUqj8Wfph2dBcftyS7hmJzEAXaetXzCJriFGf-bCvpgiucIpLveb-nPEjfsv07z1prnxdI9GHdg7JKF0O1oRNlB9x02HryhgrqEdQGdCUYsMgXo",
  // 1. Cafe La Trova — Miami, FL
  "ChIJZzgtHTW32YgR-k9p8IqD5m0":
    "places/ChIJZzgtHTW32YgR-k9p8IqD5m0/photos/AVoNoXR7iqzIsfLELVARcUvwHuae8OG8UrJS9tFm7ODxjY6i7R2oZE3_OkY-P_b39XjpSQWuE31-b8P7na2bbv-UOGMry0QeDUCpjfkmLZi9elcyiJXrkoQULnG2rgeuUed7L5Q30R7HsHbq6YJNXzPRxQdvmi60j93G2wwKn66chytU1dllqU_q3b-PH8fXcHmakdD83_h0gUTl9-nPZyRoWHeyHxtN7EX1NkC9WFqNQiOd1R0O74Gp0cG47K_WTxdHWIp6nP8hpdDv07p4Xgrss-wToIvPQ22PUaxG3Yr3k_azXP_QU8bDkTf0taNaMEs1D1oi7jmzrvfx2SWFk_kahz7gB2KZrLisgU4pKjssRntXtBm_X_cwOTueklplwVKlmaKvo15RZDY04Y3MUBeN4uwrbMGKDZDxJUHkvEt2L6SZxJmWNMVadXSEixMyvlqn",
  // 2. Red Rooster Harlem — New York, NY
  "ChIJFcYLJw32wokRnP5A9xO9JqM":
    "places/ChIJFcYLJw32wokRnP5A9xO9JqM/photos/AVoNoXTnmjjRfpVYFueJKgw3qT0N77KAUzEgWmQNJNXuIRDJLqD0rdY5gL2YTEO9eN8C3keRH8j79Mwkc-U0uTZh6Cj9LranY3Pw5wPZoevi_PXQVpTt6eorO8tCs9AykhfzBaxRYMNBe86Gj-8WpNyVXVD_-9IS7gyYfLoLEPcSFZ8nllE4BYrf5PfwVhn9rMUaTOKjkPWeNhx0V08shFIQjTDu2SH3ZtcMJntsw1nw8c-YYKPzlxrT5z-4Fl4d0p_ldxjUd1uWnTj0jXT8lSdZ4ZINAsIaH3nRu2stWHA565js45N2QJ00MaXHX6pv95jf4AtZH_HSPlNrsQXo71yDz-R_snzT2j-PSgPXAdz_UC6MevFYoVeWfpvNC8bQ3VHtmWjJ7KNzVAdMB7lAxdUJKgBQ8oViWSP4sw8nWge6BRi817c_AXUj0kL3u2B3YP7z",
  // 3. Le Bernardin — New York, NY
  "ChIJV7QQ6kdZwokRax4615zpSGU":
    "places/ChIJV7QQ6kdZwokRax4615zpSGU/photos/AVoNoXQ_d33-eZBmi_uahuRRjf-2tIv7o2O8m5msp3j0QrQF2FnmbXaf8az0TqJogUjHV1lHr2bhOeMcK-6erYTlfdyBj-GoE3I3rHz4vSTTga7KFsFNiR9ACMD8JMAuBZ4X4RCbSd6KMSxPzWbdb9SkFq-u2gp3AVot8n_UyPGNgdEF4xJQe0H5uPcIzwOl04_Zld069dIsuIePJcrL8MBTwN4OQdnSz7WVDi5XBO9vWNE6uh4Ijqq5m6wqEwHjYPWtYELKVlZviwgpzli1SII8P-TJ2CH6FO-9cpsiXFOSee57VJuDt2DqnEmW6Ae5oQ17oi1MuSPrVBQlXvDIw28I2_Fg4QsWWSYHZE6lEEFcjdaLVG94H3Nikb61KlPOir99ZzDSkCUSqqvUFMJy7uA3f_rhhqT0IcZT3Q9UOcyZso4W-p2r",
  // 4. Sea Salt — Naples, FL
  "ChIJp-Z3mQzh2ogRLZyfV3MShoc":
    "places/ChIJp-Z3mQzh2ogRLZyfV3MShoc/photos/AVoNoXRwRfZgwVMBR5INH4p0QbDqJIYGTXEz-64PDqj-ZNwKBLyOgOlEPaw3bKdK0goQf9W8nCLSwNIko9sYWgkwGYJENtpNm2OnVJmkgSalDIW0rOF-sUK9VcESMh441EUmA6YC5epRMhll3QlK7x2vb0UnB1IcB8UGfOtE45b6stA06fYTWzxFBQ3IWARs3pDDG1AoVKGQEG80LfJaWrnHZ52zZ6zU8yuX1VFDgG_ZJvNFVOMGUWNN6RgHoB5gi8f-bvCkVV7QBUOGX8lr9RlD7SrDp-GiW4jqMglsinektzCcyFJmf5hsCk_uqXMeaMKxgL2WV6R2O1E6_aULTzH8hUdR-2Wlm7AucdOA6-AFFs3py3UhNJajh76cPEONkGv56hFQqKYRSvw8Dbgdc3pJiqRaLt_Q_4sSa-HVljgPumifm8g",
  // 5. Chef Creole Seasoned Restaurant — Miami, FL
  "ChIJPeQtHkOx2YgR4SI1-m0ugng":
    "places/ChIJPeQtHkOx2YgR4SI1-m0ugng/photos/AVoNoXQZrI8gVwrMKqWZinGqH5yNDIFHqjISamBMkg7y6RFIlJWtkusPKrWFq2-GTP3Eu9klh0p5EvJ9J7qGjb4oFZKoG15Ko4PVFQq7B22R6H9llACHwLezpMyWI1_02EYY-JsKJ-jKfuEwmSeWCjtSIWkGTeQMyCys2aUN5TMm1iGD431xqKVxu1ziYQ6Ot29Ew3QQHq10FxHq_Xly2R_hzHucxImXMPRjOr_nKetNytGomTyHsNf3eCw3W12E-2uLh9I8uU2e5a2QC11z_LzkNkpjhbxUIpDOcO9cT7G2pSJEfsw1560gOpS-1v__0TrH9aErlwO720nOOdYuy6-SgsqicJGFi0QkiZ7N7kFS8-nC-P07f-0EY0Obo2w0H7FulSjH7FWpw5dwxxeWzBw07rmIeOV_gorSt4W18fVvNJ4ztJq-9CsgZxLD0UNQv3mZ",
  // 6. Steak 954 — Fort Lauderdale, FL
  "ChIJGUenndMB2YgR3IXwJ2YfGIA":
    "places/ChIJGUenndMB2YgR3IXwJ2YfGIA/photos/AVoNoXQDt0ApFQ49CRl8_u-jFzUyDmm6PAApTCaykMdKPQoEsc1pwRzMGAH86xeBEXKvlOuYSMfvXkigJs8UIsNtzq1iqwwpM5c9r6BEUkXiBUMOEHyUdqVYfrQubncjnvox6RHmowTsLEb1QbjpeBJpHsSeZnSZ9iopHbWgymNmOGu_HSIfCUi_YWCO23gIEL45gbxr6vmD7QEVdcFHBkLa9fXE8u-U2vPTk_GVOTinzXH7AhPETuatZtWgoKItFyycR9sJ--kJshqKqEgdhw6Tadi_U0xjImboK9p0hJdUQCi-eu_10n1ywzEOauJhOsVU3gYlva6ISpiJhIo5SP4Xe5be46yU0dZPkqgfTgazJqQ4lyC_Kl231s4B5jV70kUmwSrd85cUvF1P07hLrvN57CUOtK-V2_FJYslJ02jYXhM",
  // 7. Roots Southern Table — Farmers Branch, TX
  "ChIJaRaBhbcnTIYRWorlkgfpBGM":
    "places/ChIJaRaBhbcnTIYRWorlkgfpBGM/photos/AVoNoXQnyVat1XdehvI6z2XAVO05J0933Gre6yJngZ-3MYKof52sfzhtm8ZJS0ZOEL5EolwaUdIM9d-5vSn2Y1vvA5TSpZVH3fX6XAgAgQWrMleZodMcxAX5roUwAZdeQRGVxtnixSmfpPlajaBhTuGBUnLEkAo8uw9Nh-jxh0-iErHRCpoLwFYabdSYNW3Be9bq7Jaykl1wNiexJioPFX1gwEHrMOHwW4bgnSJQHyQgqH7Xtm2xcCqr4wwn6MSPnLpn6UKhk_gMOkfVbkwAtJpKcm6nSpiy3-X2DlR9MYK_bS-PChlGmURYK0AhwoRiYRpAiCEFNEK556yRExBv0O25Vtxcjjl9wr0z771f_qGTquSk0bz4qxaMPtbsOLjfXTSOYjojKIizrcMFq4exsRxyb53BKlov1w_HMOQZcwW0SmM",
});
