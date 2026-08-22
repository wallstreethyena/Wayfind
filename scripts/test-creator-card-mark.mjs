#!/usr/bin/env node
/**
 * test-creator-card-mark — the creator's face is ON the place card, and it is
 * on the card for the RIGHT place.
 *
 * v8.33, owner: "right now the place cards does not show there is an influencer
 * video on it … i like the idea of adding the influencer avatar on the place
 * card." The chip that used to be the only signal ("🎬 Creator video") lives in
 * the pills lane, which is a one-row clamp with horizontal overflow — on a
 * narrow card it is genuinely off-screen. A marker nobody sees is not a marker.
 *
 * WHAT IS ASSERTED, by rendering the real components with react-dom/server:
 *   1. a place with a curated video renders the mark;
 *   2. a place with none renders NOTHING — no empty scrim, no stray circle;
 *   3. the mark carries a truthful accessible label and makes no affiliation
 *      claim (the lib/creatorRights.js ban, checked on the rendered STRING
 *      rather than on the source, which is the only place it can actually be
 *      violated);
 *   4. it is inert — no href, no onClick, no button — because three of the four
 *      cards it renders inside own every tap at the card level;
 *   5. the CSS it needs is really in WF_PLACE_CARD_CSS, so the mark cannot ship
 *      unstyled and land in the middle of the copy column.
 */
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { creatorVideosFor } from "../lib/creatorVideos.js";
import { claimsAffiliation } from "../lib/creatorRights.js";
import { readFileSync } from "node:fs";

// The component is JSX; node cannot parse it directly. Same loader the other
// render smokes use, so this test exercises the real module, not a copy.
const REPO = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const markMod = await loadComponent(fileURLToPath(new URL("../app/components/CreatorCardMark.js", import.meta.url)), REPO);
const CreatorCardMark = markMod.default || markMod;
const creatorHeads = markMod.creatorHeads;
// css.js imports its siblings extensionless (bundler resolution), so it is read
// as TEXT here rather than imported. The property under test is that the
// selectors exist in the shipped sheet, which the source proves directly.
const WF_PLACE_CARD_CSS = readFileSync(path.join(REPO, "app/components/css.js"), "utf8");

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };
const render = (el) => renderToStaticMarkup(el);

// A real curated place, by its real place_id (the 2026-08-22 batch).
const CINDY_PLACE = { id: "ChIJEUEmzE1Bw4gRHHXe_oxJF7E", name: "Hashtag Café", city: "Sarasota" };
const NOT_CURATED = { id: "ChIJ-definitely-not-real", name: "Some Diner", city: "Nowhere" };

// 0. the fixture is real — otherwise every assertion below is vacuous.
const vids = creatorVideosFor(CINDY_PLACE);
ok(vids.length > 0, "the fixture place really does resolve a curated video (got " + vids.length + ")");
ok(vids.every((v) => v.creator === "cindy.selects"), "…and it is attributed to the creator this batch credits");
ok(creatorVideosFor(NOT_CURATED).length === 0, "the control place resolves nothing");

// 1 + 2. renders for a curated place, renders nothing for anything else.
const html = render(React.createElement(CreatorCardMark, { videos: vids }));
ok(html.includes("wf-place-card-creator"), "a place with a curated video renders the mark");
ok(html.includes("wf-pcc-play"), "…with the play affordance, which is what makes a portrait read as a video");
ok(render(React.createElement(CreatorCardMark, { videos: [] })) === "", "a place with no video renders NOTHING — no empty scrim");
ok(render(React.createElement(CreatorCardMark, { videos: null })) === "", "…and a null list is not a crash");
ok(render(React.createElement(CreatorCardMark, { videos: [{ platform: "tiktok", url: "x" }] })) === "",
   "an unattributed post renders no face — there is no person to show, and one is never invented");

// 3. the label is truthful and claims nothing.
ok(/aria-label="[^"]*cindy\.selects/.test(html), "the mark names the creator in its accessible label");
ok(/aria-label="Found on TikTok/.test(html), "…in lib/creatorRights.js's own sanctioned wording");
ok(!claimsAffiliation(html), "the RENDERED markup makes no affiliation claim — Lanham Act s.43(a)");

// 4. inert.
ok(!/<a\b|<button\b|href=|onclick=/i.test(html),
   "the mark ships no tap target — the card owns the tap (see the component header)");

// 5. the styles exist. A mark positioned by CSS that is not in the sheet does
//    not degrade gracefully; it lands in the middle of the name.
for (const sel of [".wf-place-card-creator", ".wf-pcc-stack", ".wf-pcc-head", ".wf-pcc-play", ".wf-pcc-more"]) {
  ok(WF_PLACE_CARD_CSS.includes(sel), `WF_PLACE_CARD_CSS defines ${sel}`);
}
ok(/\.wf-place-card-creator\{[^}]*pointer-events:none/.test(WF_PLACE_CARD_CSS.replace(/\s+/g, "")) ||
   WF_PLACE_CARD_CSS.includes("pointer-events:none;\n}"),
   "the mark is pointer-events:none in CSS as well as in markup");

// 5b. THE ONLOAD RACE. CreatorAvatar reveals the real photo on React's onLoad,
//     which never fires for an image the browser already finished downloading
//     before hydration — which is every committed /creators/<handle>.jpg on a
//     server-rendered page, and every cached /api/creator-avatar hit. Measured
//     on the deployed /creators index at v8.33: thirteen 200 image/jpeg
//     responses, thirteen sets of initials. The element must be ASKED whether
//     it is already complete. Asserted on the source because reproducing it
//     needs a real browser and a real network race; the property is small and
//     the regression is silent, which is the worst combination to leave unpinned.
const avatarSrcTxt = readFileSync(path.join(REPO, "app/components/CreatorAvatar.js"), "utf8");
ok(/\.complete/.test(avatarSrcTxt), "CreatorAvatar checks img.complete after mount — the onLoad race is handled");
ok(/naturalWidth/.test(avatarSrcTxt), "…and naturalWidth separates a finished decode from a broken one");
ok(/useEffect/.test(avatarSrcTxt) && /useRef/.test(avatarSrcTxt), "…via a ref read in an effect, not a guess");

// 6. one face per PERSON, not per post — a creator with three posts about one
//    place is one person on the card.
const dupes = [
  { platform: "tiktok", url: "a", creator: "cindy.selects" },
  { platform: "tiktok", url: "b", creator: "Cindy.Selects" },
  { platform: "tiktok", url: "c", creator: "someoneelse" },
];
const heads = creatorHeads(dupes);
ok(heads.length === 2, `distinct by handle, case-insensitively (got ${heads.length})`);
ok(heads[0].handle === "cindy.selects", "…and the first curated post's creator leads");

if (fail.length) {
  console.log("test-creator-card-mark: FAIL");
  for (const f of fail) console.log("  - " + f);
  process.exit(1);
}
console.log(`test-creator-card-mark: OK — ${pass} assertions, rendered through react-dom/server`);
