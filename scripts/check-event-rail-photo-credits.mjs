#!/usr/bin/env node
// Every photo on an event page rail carries its own credit (owner, 2026-11-05:
// keep attribution consistent with the displayed image; a venue photograph is
// identified as a venue photograph).
//
// THE DEFECT. /florida-events/<slug> rendered the Christmas gallery photos
// (lib/christmasPlacePhotos.js) with NO credit at all: EventHeroCredit only
// prints a registry credit or a venue line, and gallery photos were neither,
// so CC BY / CC BY-SA photos (Orlando Ballet's Seneff Arts Plaza cover among
// them) showed without the attribution their licence requires, and venue
// shots sat under the event name with nothing saying they show the venue.
// Asserted on the CALL of the credit helper and the resolver, plus the
// syntactic role of the page's rail markup (comments stripped).
import assert from "node:assert/strict";
import fs from "node:fs";
import { CHRISTMAS_STATIC_GALLERY, christmasStaticPhotos, eventRailPhotoCredit } from "../lib/christmasPlacePhotos.js";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };

// Helper contract, with controls.
const v = eventRailPhotoCredit({ credit: "Photo by Farragutful, CC BY SA 4.0, via Wikimedia Commons", creditHref: "https://commons.wikimedia.org/wiki/File:X.jpg", context: "venue" });
ok(v && v.text === "Venue photo · Photo: Farragutful, CC BY SA 4.0, via Wikimedia Commons" && v.href === "https://commons.wikimedia.org/wiki/File:X.jpg", "a venue photo reads 'Venue photo · Photo: <credit>' and links its source, got " + JSON.stringify(v));
const ev = eventRailPhotoCredit({ credit: "World Equestrian Center official website", creditHref: "javascript:alert(1)" });
ok(ev && ev.text === "Photo: World Equestrian Center official website" && ev.href === null, "an event photo has no venue prefix and an unsafe href is dropped");
ok(eventRailPhotoCredit({ credit: { name: "Google author" } }) === null && eventRailPhotoCredit({}) === null && eventRailPhotoCredit(null) === null, "a photo with no stored text credit returns null (its own lane credits it)");

// Every gallery photo can be credited: none would render bare.
const bare = [];
let photos = 0;
for (const [id, list] of Object.entries(CHRISTMAS_STATIC_GALLERY)) {
  for (const p of christmasStaticPhotos(id, id)) {
    photos += 1;
    const c = eventRailPhotoCredit(p);
    if (!c || !/^(?:Venue photo · )?Photo: \S/.test(c.text) || /Photo: (?:Photo by|Photos? from)\b/i.test(c.text)) bare.push(id + " " + p.src);
  }
}
ok(photos > 300, "the resolver produced the gallery (" + photos + " photos)");
ok(bare.length === 0, "every gallery photo renders a credit line: " + bare.slice(0, 8).join("; "));
// Venue knowledge comes from the batch record: #2151 published batch 2026-11j as host venue photos.
const j = Object.values(CHRISTMAS_STATIC_GALLERY).flat().filter((e) => /\/batch-2026-11j\//.test(e.src));
ok(j.length === 79 && j.every((e) => e.context === "venue"), "all 79 batch 2026-11j photos are marked context: venue (" + j.filter((e) => e.context === "venue").length + "/" + j.length + ")");
const ballet = eventRailPhotoCredit(christmasStaticPhotos("orlando-ballet-nutcracker-2026")[0]);
ok(ballet && ballet.text.startsWith("Venue photo · Photo: Farragutful"), "the Orlando Ballet cover is credited and identified as a venue photo, got " + JSON.stringify(ballet));
const wec = christmasStaticPhotos("wec-winter-wonderland-2026");
ok(wec.length >= 5 && wec.every((p) => !eventRailPhotoCredit(p).text.startsWith("Venue photo")), "WEC's own event photos are not labelled as venue photos");

// The page renders the line inside each rail photo and does not double credit the hero.
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const page = strip(fs.readFileSync("app/florida-events/[slug]/page.js", "utf8"));
const rail = page.match(/detailPhotos\.length \? detailPhotos\.map\(\(photo, i\) => \{([\s\S]*?)\n      \}\) :/);
ok(rail, "the rail maps detailPhotos with a block body");
ok(/const credit = eventRailPhotoCredit\(photo\);/.test(rail[1]) && /<span className="wf-event-photo-credit" data-event-photo-credit="">/.test(rail[1]), "each rail photo renders its own credit span");
ok(rail[1].indexOf("<EventPlacePhoto") < rail[1].indexOf("wf-event-photo-credit"), "the credit sits inside the photo tile, after the picture");
ok(/credit=\{eventRailPhotoCredit\(detailPhotos\[0\]\) \? null : <EventHeroCredit/.test(page), "the hero credit line is suppressed when the hero photo already carries its own credit");
ok(/import \{ eventRailPhotoCredit \} from "\.\.\/\.\.\/\.\.\/lib\/christmasPlacePhotos\.js";/.test(page), "the page imports the helper");
const css = fs.readFileSync("app/components/EventExperienceStyles.js", "utf8");
ok(/\.wf-event-photo-credit\{position:absolute;[^}]*bottom:6px[^}]*white-space:nowrap[^}]*text-overflow:ellipsis/.test(css) && /\.wf-event-photo\{position:relative/.test(css), "the credit is pinned to the bottom of its own photo tile, truncated to one line");
console.log(`check-event-rail-photo-credits: OK, ${checks} assertions (${photos} gallery photos credited, ${j.length} venue photos in 11j)`);
