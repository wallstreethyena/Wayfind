#!/usr/bin/env node
// Owner rule (2026-11-12, Christmas image mission): credit is not permission.
// A photo copied from a news outlet (TV station, newspaper, wire) has no licence
// we can show, so no Christmas static gallery photo may carry a news credit or a
// news CDN source. The Stetson Mansion gallery (9 ABC Action News photos) was
// removed for this. Asserted on the CALL: every event id in the gallery runs
// through christmasStaticPhotos(), the function the cards and pages use.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CHRISTMAS_STATIC_GALLERY, christmasStaticPhotos } from "../lib/christmasPlacePhotos.js";
import { CHRISTMAS_STATIC_GALLERY_ADDITIONS } from "../lib/christmasStaticGalleryAdditions.js";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };

const NEWS = /\b(?:action news|news ?channel|news ?\d+|wfla|wtsp|wfts|wesh|wftv|wkmg|clickorlando|fox ?\d+|nbc ?\d*|cbs ?\d*|abc ?\d*|wsvn|wplg|local ?10|wpbf|wptv|wjxt|news4jax|first ?coast news|tampa bay times|tampabay\.com|orlando sentinel|sun[- ]sentinel|miami herald|palm beach post|herald[- ]tribune|associated press|getty|reuters|usa today)\b|brightspot(?:cdn)?\.com|gannett|scripps/i;

// Controls: the probe finds the removed credit and source, and passes a real
// licensed credit and an organizer credit.
ok(NEWS.test("ABC Action News Tampa Bay"), "control: the probe flags the removed Stetson credit");
ok(NEWS.test("https://ewscripps.brightspotcdn.com/dims4/default/x.jpg"), "control: the probe flags a news CDN source");
ok(NEWS.test("Photo by WFLA News Channel 8"), "control: the probe flags a TV station credit");
ok(!NEWS.test("bubba73, CC BY SA 3.0, via Wikimedia Commons"), "control: a Commons credit passes");
ok(!NEWS.test("Seminole Hard Rock Winterfest Boat Parade official website"), "control: an organizer credit passes");

const ids = new Set([...Object.keys(CHRISTMAS_STATIC_GALLERY), ...Object.keys(CHRISTMAS_STATIC_GALLERY_ADDITIONS || {})]);
ok(ids.size > 100, "the gallery is loaded (" + ids.size + " event ids)");
let photos = 0;
const bad = [];
let unlicensed = 0;
for (const id of ids) {
  for (const p of christmasStaticPhotos(id)) {
    photos += 1;
    const text = [p.credit, p.creditHref, p.src].filter(Boolean).join(" ");
    if (NEWS.test(text)) bad.push(id + ": " + text.slice(0, 120));
  }
  for (const e of CHRISTMAS_STATIC_GALLERY[id] || []) if (!("license" in e) && !/wikimedia|cc by|cc0|public domain/i.test(e.credit || "")) unlicensed += 1;
}
ok(photos > 300, "photos were served by the real call (" + photos + ")");
ok(bad.length === 0, "no Christmas gallery photo carries a news credit or source:\n" + bad.join("\n"));

// Stetson stays removed: no gallery, no files on disk.
ok(christmasStaticPhotos("stetson-mansion-christmas-2026-2").length === 0 && christmasStaticPhotos("stetson-mansion-christmas-2026").length === 0, "Stetson serves no static gallery");
ok(!fs.existsSync(path.join(process.cwd(), "public/events/christmas-gallery/stetson-mansion-christmas-2026-2")), "the Stetson news photo folder is gone");

console.log(`check-christmas-gallery-no-news-credit: OK: ${checks} assertions (${photos} photos across ${ids.size} events, 0 news credits; ${unlicensed} organizer-site photos still have no licence on file, tracked for owner review)`);
