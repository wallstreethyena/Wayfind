#!/usr/bin/env node
// scripts/test-city-card-photo-credit.mjs — a city card never shows a Google photo
// without that exact photo's visible author credit (owner, 2026-10-08).
//
// Google: "You must always credit the author when displaying photos", "clearly
// associated with the author's photo". City cards (lib/landingPage.js) showed Google
// photos with no credit. Now each card shows (1) its own photo with the credit stored
// for exactly that image, (2) else another cached photo of the same place that has
// one, (3) else a licensed photo with its licence credit, (4) else a placeholder.
//
// EXECUTED, not grepped: the real pairing (lib/cardPhotoCredit.js pairCardCredits),
// the real choice (lib/landingPage.js cardPhotoChoice) and the real IconicPlaceCard
// rendered inside and outside the real PhotoPolicyProvider. The two wiring checks on
// lib/landingPage.js are structural (a full LandingPage render needs live Supabase)
// and say so.
//
// RED-PROOF: each turns this red —
//   * pairCardCredits: pair by place id instead of by served uri
//   * pairCardCredits: drop the `pid !== c.place_id` cross-place refusal
//   * IconicPlaceCard: render googleCredit without the visible strip
//   * IconicPlaceCard: let an uncredited Google photo through the filter
//   * landingPage: render <main> outside <PhotoPolicyProvider requireGoogleCredit>
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { pairCardCredits, cardPhotoRef } from "../lib/cardPhotoCredit.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const h = React.createElement;
const GOOGLE_IMG_RX = /<img[^>]+src="[^"]*(?:\/api\/photo|googleusercontent\.com)/;

const A = "ChIJAaaaaaaaaaaaaaaaaaaa", B = "ChIJBbbbbbbbbbbbbbbbbbbb";
const nm = (pid, tag) => `places/${pid}/photos/${tag}`;
const row = (name, uri) => ({ k: `photo|${name}|640`, v: { uri } });
const U1 = "https://lh3.googleusercontent.com/place-photos/one=s4800-w640";
const U2 = "https://lh3.googleusercontent.com/place-photos/two=s4800-w640";
const U3 = "https://lh3.googleusercontent.com/place-photos/three=s4800-w640";

// ── 1. pairing is by EXACT image (served uri), never by place or photographer ──
{
  // A's card asks for its stored ref OLD; the fresh name NEW serves the same image U1 and carries the credit.
  const places = [{ id: A, photoRef: nm(A, "OLD") }];
  const rows = [row(nm(A, "OLD"), U1), row(nm(A, "NEW"), U1), row(nm(A, "OTHER"), U2)];
  const credits = [
    { photo_name: nm(A, "NEW"), place_id: A, author_name: "Kevin Roberts", author_uri: "https://maps.google.com/maps/contrib/1" },
    { photo_name: nm(A, "OTHER"), place_id: A, author_name: "Someone Else", author_uri: "https://maps.google.com/maps/contrib/2" },
  ];
  const m = pairCardCredits(places, rows, credits);
  ok(m.get(A) && m.get(A).ref === nm(A, "OLD") && m.get(A).author === "Kevin Roberts", "own photo keeps its ref and gets the credit of the name that serves the SAME image (Kevin Roberts), not another photo's");
  ok(m.get(A).href === "https://maps.google.com/maps/contrib/1", "the credit link is that author's profile");
}
{
  // Own image U3 has no credit anywhere; another cached photo of A (U2) does → the card SWITCHES to it.
  const places = [{ id: A, photoRef: nm(A, "OLD") }];
  const rows = [row(nm(A, "OLD"), U3), row(nm(A, "OTHER"), U2)];
  const credits = [{ photo_name: nm(A, "OTHER"), place_id: A, author_name: "Someone Else", author_uri: "https://maps.google.com/maps/contrib/2" }];
  const m = pairCardCredits(places, rows, credits);
  ok(m.get(A).ref === nm(A, "OTHER") && m.get(A).author === "Someone Else", "an uncredited own photo is never given another photo's credit — the card switches to the credited photo instead");
}
{
  // A credit row that names place B's photo must never credit place A.
  const places = [{ id: A, photoRef: nm(A, "OLD") }];
  const rows = [row(nm(A, "OLD"), U1)];
  const credits = [{ photo_name: nm(B, "X"), place_id: B, author_name: "Wrong Place", author_uri: "https://x" },
                   { photo_name: nm(A, "OLD"), place_id: B, author_name: "Mislabelled", author_uri: "https://y" }];
  ok(!pairCardCredits(places, rows, credits).has(A), "a credit never crosses places (foreign photo, or a row whose place_id disagrees with its photo name)");
  // Both places on the same page: a row naming A's photo but labelled place B must still not credit A.
  ok(!pairCardCredits([{ id: A, photoRef: nm(A, "OLD") }, { id: B, photoRef: nm(B, "Y") }], rows, [{ photo_name: nm(A, "OLD"), place_id: B, author_name: "Mislabelled", author_uri: "https://y" }]).has(A), "with BOTH places on the page, a credit row whose place_id disagrees with its photo name credits nobody");
}
{
  const places = [{ id: A, photoRef: nm(A, "OLD") }];
  const rows = [row(nm(A, "OLD"), U1)];
  ok(!pairCardCredits(places, rows, [{ photo_name: nm(A, "OLD"), place_id: A, author_name: "  ", author_uri: "https://z" }]).has(A), "an empty author name is not a credit");
  ok(pairCardCredits(places, rows, [{ photo_name: nm(A, "OLD"), place_id: A, author_name: "Ann", author_uri: "https://z" }]).has(A), "control: the same row with a name IS a credit");
  ok(!pairCardCredits(places, [], [{ photo_name: nm(A, "OLD"), place_id: A, author_name: "Ann", author_uri: "https://z" }]).has(A), "a credit whose photo is not cached (nothing to display) pairs with nothing");
  ok(cardPhotoRef({ photo_ref: nm(A, "OLD") }) === nm(A, "OLD") && cardPhotoRef({ photoRef: "not-a-ref" }) === null, "cardPhotoRef accepts only a real photo name");
}

// ── 2. the real choice in lib/landingPage.js ──
const landing = await loadComponent(path.join(ROOT, "lib/landingPage.js"), ROOT);
const { cardPhotoChoice } = landing;
ok(typeof cardPhotoChoice === "function", "lib/landingPage.js exports cardPhotoChoice");
const P = { id: A, name: "Sarbez!", photoRef: nm(A, "OLD") };
{
  const credited = cardPhotoChoice(P, { ...P, photo: "/api/photo?ref=x&nospend=1", photoNoSpend: true }, { evergreen: true, credit: { ref: nm(A, "NEW"), author: "Kevin Roberts", href: "https://maps.google.com/maps/contrib/1" } });
  ok(credited.kind === "google-credited" && credited.place.googlePhotoCredit.author === "Kevin Roberts", "credited Google photo → shown with its credit");
  ok(credited.place.photo.includes(encodeURIComponent(nm(A, "NEW"))) && credited.place.photo.includes("nospend=1"), "evergreen: the card requests EXACTLY the credited photo, still no-spend");
  const lic = cardPhotoChoice(P, { ...P }, { credit: null, free: { url: "https://upload.wikimedia.org/x.jpg", attributionText: "Jane (CC BY-SA 4.0)", attributionUrl: "https://commons.wikimedia.org/wiki/File:x.jpg" } });
  ok(lic.kind === "licensed" && lic.place.photo === "https://upload.wikimedia.org/x.jpg" && lic.place.photoRef === null && lic.licenseAttr === "Jane (CC BY-SA 4.0)", "no Google credit → the licensed photo with its licence credit");
  const none = cardPhotoChoice(P, { ...P }, { credit: null, free: null });
  ok(none.kind === "withheld" && none.place.photoWithheld === true && none.place.photoRef === null, "no credit and no licensed photo → placeholder, never an uncredited Google photo");
  const owned = cardPhotoChoice({ id: A, name: "X" }, { id: A, name: "X", photo: "/cards/owner-art.jpg" }, {});
  ok(owned.kind === "owned" && !owned.place.googlePhotoCredit, "an owned non-Google photo is left as it is (no Google credit owed)");
}

// ── 3. the real card, inside the real policy provider ──
const fx = await loadComponent(path.join(ROOT, "scripts/fixtures/photo-policy/cards.js"), ROOT);
const credPlace = { id: A, name: "Sarbez!", rating: 4.7, reviews: 900, types: ["bar"], primaryType: "bar", lat: 29.9, lng: -81.3,
  photoRef: nm(A, "NEW"), googlePhotoCredit: { author: "Kevin Roberts", href: "https://maps.google.com/maps/contrib/1" } };
const strictCred = renderToStaticMarkup(h(fx.Iconic, { strict: true, place: credPlace }));
ok(GOOGLE_IMG_RX.test(strictCred), "under the policy a CREDITED Google photo renders");
ok(/class="wf-place-card-google-credit"[^>]*href="https:\/\/maps\.google\.com\/maps\/contrib\/1"/.test(strictCred) && />Photo: Kevin Roberts</.test(strictCred), "…with the author's name as VISIBLE text, linked to their profile");
const uncred = { ...credPlace, googlePhotoCredit: undefined };
const strictUncred = renderToStaticMarkup(h(fx.Iconic, { strict: true, place: uncred }));
ok(!GOOGLE_IMG_RX.test(strictUncred) && !/wf-place-card-google-credit/.test(strictUncred), "under the policy an UNCREDITED Google photo does not render, and no credit strip floats over nothing");
const openUncred = renderToStaticMarkup(h(fx.Iconic, { strict: false, place: uncred }));
ok(GOOGLE_IMG_RX.test(openUncred), "control: the same uncredited card outside the policy still renders its photo (so the assertion above can fail)");
const withheld = renderToStaticMarkup(h(fx.Iconic, { strict: true, place: { ...uncred, photoRef: null, photo: null, photoWithheld: true } }));
ok(/no verified photo yet/i.test(withheld) && !GOOGLE_IMG_RX.test(withheld), "a withheld photo shows the honest placeholder caption");

// ── 4. wiring in lib/landingPage.js (structural: a full render needs live Supabase) ──
// Strip real comments only (JSX {/* */}, line-start block and // comments): a naive /\*...\*\/ strip
// also eats code after a "/*" inside a string (a URL glob), which is how this check first misfired.
const code = readFileSync(path.join(ROOT, "lib/landingPage.js"), "utf8").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\*[\s\S]*?\*\//gm, "").replace(/^\s*\/\/.*$/gm, "");
ok(/<PhotoPolicyProvider requireGoogleCredit>\s*<main\b/.test(code) && /<\/main>\s*<\/PhotoPolicyProvider>/.test(code), "STRUCTURAL: the whole city page renders inside <PhotoPolicyProvider requireGoogleCredit>");
ok((code.match(/await resolveCardPhotoCredits\(/g) || []).length === 1 && /cardPhotoChoice\(p, basePlace,/.test(code), "STRUCTURAL: credits are resolved once per page and every ranked card goes through cardPhotoChoice");

console.log(`test-city-card-photo-credit: OK — ${n} assertions; real pairing, real choice, real IconicPlaceCard inside/outside the real PhotoPolicyProvider (with positive controls); 2 wiring checks are structural and say so`);
