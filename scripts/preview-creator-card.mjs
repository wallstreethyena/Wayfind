#!/usr/bin/env node
// preview-creator-card — NOT a guard. Renders the real IconicPlaceCard for a
// curated place and one without a video, side by side, into /tmp so the card's
// new creator mark can be LOOKED AT at real size. Run by hand.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { writeFileSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { loadComponent } from "./lib/jsxLoad.mjs";

const REPO = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const cardMod = await loadComponent(path.join(REPO, "app/components/IconicPlaceCard.js"), REPO);
const Card = cardMod.default || cardMod;

const cssSrc = readFileSync(path.join(REPO, "app/components/css.js"), "utf8");
const grab = (name) => {
  const at = cssSrc.indexOf("export const " + name + " = `");
  const start = cssSrc.indexOf("`", at) + 1;
  const end = cssSrc.indexOf("`;", start);
  return cssSrc.slice(start, end).replace(/\$\{[^}]*\}/g, "900");
};
const css = grab("WF_PLACE_CARD_CSS");

const PLACES = [
  { id: "ChIJEUEmzE1Bw4gRHHXe_oxJF7E", name: "Hashtag Café", rating: 4.9, userRatingCount: 970, primaryType: "coffee_shop", types: ["coffee_shop", "cafe"], city: "Sarasota", distMi: 6.2, priceLevel: "PRICE_LEVEL_INEXPENSIVE" },
  { id: "ChIJPSkey7Elw4gR5gvfcin8NQc", name: "Tuscan Hills Coffee Company", rating: 4.8, userRatingCount: 5, primaryType: "cafe", types: ["cafe"], city: "Parrish", distMi: 2.1 },
  { id: "ChIJ-no-video-here", name: "A Place With No Video", rating: 4.5, userRatingCount: 420, primaryType: "restaurant", types: ["restaurant"], city: "Parrish", distMi: 3.4 },
];

// Where a local `next start` is listening. Pass it as argv[2] to override; NOT
// read from the environment, because check-env-discipline §5(a) rightly bans a
// `process.env.X || "<literal>"` fallback anywhere in this repo — a hardcoded
// default that silently wins is how a preview URL ends up in production code.
const ORIGIN = process.argv[2] || "http://localhost:3777";
const PHOTO = ORIGIN + "/cards/coupon-dining-cafe-solo.jpeg";
const cards = PLACES.map((p, i) => renderToStaticMarkup(createElement(Card, { place: { ...p, photo: PHOTO }, rank: i + 1, href: "#" })))
  .join("\n")
  // the harness is served from a different port, so the avatar route needs an
  // absolute URL to resolve. Product code is untouched.
  .replaceAll('src="/api/creator-avatar', 'src="' + ORIGIN + '/api/creator-avatar');
const html = `<!doctype html><meta charset="utf-8"><title>creator mark preview</title>
<style>
  html,body{margin:0;background:#0B0E1A;color:#F1F5F9;font-family:system-ui,-apple-system,sans-serif}
  .wrap{display:flex;gap:18px;padding:24px;align-items:flex-start;flex-wrap:wrap}
  ul{list-style:none;margin:0;padding:0;width:390px}
  h2{font:600 13px/1 system-ui;color:#94A3B8;margin:0 0 10px;letter-spacing:.08em;text-transform:uppercase}
  ${css}
</style>
<div class="wrap"><ul><h2>390px column</h2>${cards}</ul>
<ul style="width:340px"><h2>340px column</h2>${cards}</ul></div>`;
writeFileSync("/tmp/wf-creator-card-preview.html", html);
console.log("wrote /tmp/wf-creator-card-preview.html");
