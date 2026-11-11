#!/usr/bin/env node
/**
 * check-home-default-poster — a cold homepage opens the first collection.
 *
 * A visitor who only saw the poster shelf said they "didn't see anything."
 * The posters stay the shelf above. The first drop poster is already open,
 * and the existing "Showing <title>" bar carries that poster's own image.
 * Nothing is drawn on the poster tiles.
 *
 * The default is one identifier. Reverting it to useState(null) puts the
 * shelf back in front of the answer. This file runs the selector and renders
 * the real component, then rejects that revert on purpose.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { firstDropPosterId } from "../lib/posterSeasons.js";
import { RAILS } from "../lib/rails.js";
import { loadComponent } from "./lib/jsxLoad.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const get = (id) => ({
  partner: { id: "partner", partner: { id: "x" } },
  page: { id: "page", opensPage: true },
  drop: { id: "drop", title: "Drop" },
  hidden: null,
}[id] || null);

ok(firstDropPosterId(["partner", "page", "drop"], get) === "drop",
  "the landing collection is the first poster that opens in place");
ok(firstDropPosterId(["partner", "page"], get) === null,
  "a track of only partner and page tiles does not invent a drop");
ok(firstDropPosterId(null, get) === null && firstDropPosterId([], () => null) === null,
  "an empty track stays closed");
ok(firstDropPosterId(["drop"], () => null) === null,
  "a missing rail record is not opened");

const railSrc = readFileSync(path.join(REPO, "app/components/DaypartRail.js"), "utf8");
const railCode = strip(railSrc);
const opensFromFeatured = (src) => {
  const code = strip(src);
  return /const \[selected, setSelected\] = useState\(openingPosterId\)/.test(code)
    && !/const \[selected, setSelected\] = useState\(null\)/.test(code)
    && /firstDropPosterId\(visiblePosterIds/.test(code);
};
ok(opensFromFeatured(railSrc), "selected state is initialised from the first drop poster");
ok(!opensFromFeatured(railSrc.replace("useState(openingPosterId)", "useState(null)")),
  "mutation control: useState(null) is the closed shelf and must fail this check");

const tileAt = railCode.indexOf("className={tileClass}");
const mbarAt = railCode.indexOf('className="wf8-mbar"');
const thumbAt = railCode.indexOf('className="wf8-mthumb"');
const closeAt = railCode.indexOf('className="wf8-mclose"');
ok(tileAt > -1 && mbarAt > tileAt && thumbAt > mbarAt && closeAt > thumbAt,
  "the poster image in the open bar sits in the existing header, after the tile markup");
ok(!railCode.slice(tileAt, mbarAt).includes("wf8-mthumb"),
  "the thumbnail is not inside a poster tile");
ok(/const tileClass = `wf8-tile\$\{selected === id \? " is-sel" : ""\}/.test(railCode),
  "the tile class string is the existing selected state, with nothing added to the poster");
ok(/Showing <b>\{selRail \? selRail\.title : ""\}<\/b>/.test(railCode),
  "the open bar still uses the existing Showing line");
ok(!/tap to explore|scroll up to|you(?:'| a)re viewing|now viewing/i.test(railCode),
  "no instructional sentence was added to the rail");
ok(/const force = defaultLanding\.current/.test(railCode) && /pcRef\.current, force \}/.test(railCode),
  "the cold open uses the shared landing with force, so the expanded view is the landing even when a sliver of it is already inside the window");

const cssRaw = readFileSync(path.join(REPO, "app/components/railMenuCss.js"), "utf8");
const css = cssRaw.replace(/\s/g, "");
ok(/\.wf8\.is-open \.wf8-mbar\{[^}]*position:sticky;top:0/.test(cssRaw),
  "the existing open bar sticks while the collection is on screen");
ok(/\.wf8-mthumb\{width:24px;height:24px/.test(css),
  "the header image is 24px, inside the existing 30px bar");
ok(!/\.wf8-tile[^{.]*\.wf8-mthumb/.test(css),
  "no poster-tile rule was added for the header image");

const { default: DaypartRail } = await loadComponent(path.join(REPO, "app/components/DaypartRail.js"), REPO);
const byId = new Map(RAILS.map((r) => [r.id, r]));
const readOpen = (html) => {
  const doc = new JSDOM(html).window.document;
  const tiles = [...doc.querySelectorAll(".wf8-track > .wf8-tile")];
  const ids = tiles.map((t) => t.getAttribute("data-id"));
  const sel = doc.querySelector(".wf8-tile.is-sel");
  return {
    open: doc.querySelector(".wf8")?.classList.contains("is-open") === true,
    ids,
    sel: sel ? sel.getAttribute("data-id") : null,
    title: doc.querySelector(".wf8-mhd b")?.textContent || "",
    thumbInBar: !!doc.querySelector(".wf8-mbar .wf8-mthumb"),
    thumbInTile: !!doc.querySelector(".wf8-tile .wf8-mthumb"),
    thumbSrc: doc.querySelector(".wf8-mbar .wf8-mthumb")?.getAttribute("src") || "",
  };
};

const cold = readOpen(renderToStaticMarkup(createElement(DaypartRail, {
  rails: RAILS, places: {}, thin: [], initialDaypart: "afternoon",
})));
const expected = firstDropPosterId(cold.ids, (id) => byId.get(id));
ok(cold.ids.length > 3, `probe: the track rendered (${cold.ids.slice(0, 4).join(", ")})`);
ok(!!expected, `probe: a drop poster exists on the track (got ${expected})`);
ok(cold.open && cold.sel === expected && cold.title === byId.get(expected).title,
  `cold render opens ${expected} (got open=${cold.open} sel=${cold.sel} title=${cold.title})`);
ok(cold.thumbInBar && !cold.thumbInTile && cold.thumbSrc.length > 0,
  "the open bar shows that poster's image and the tiles do not");

const otherId = cold.ids.find((id) => id !== expected && byId.get(id) && !byId.get(id).opensPage && !byId.get(id).partner);
const other = otherId ? byId.get(otherId) : null;
ok(!!other, "probe: a second drop poster exists to prove a shared link still wins");
if (other) {
  const shared = readOpen(renderToStaticMarkup(createElement(DaypartRail, {
    rails: RAILS, places: {}, thin: [], initialDaypart: "afternoon", initialRail: other.id,
  })));
  ok(shared.open && shared.sel === other.id && shared.title === other.title,
    `?rail= opens that collection (${other.id}), not the featured one (got ${shared.sel})`);
}

const empty = readOpen(renderToStaticMarkup(createElement(DaypartRail, { rails: [], places: {}, thin: [] })));
ok(!empty.open && !empty.thumbInBar && empty.ids.length === 0,
  "no posters means no open collection and no header image");

if (fail.length) {
  console.error("check-home-default-poster: FAIL\n" + fail.map((m) => "  " + m).join("\n"));
  process.exit(1);
}
console.log(`check-home-default-poster: OK — ${pass} assertions (cold visit opens the first drop poster; the image lives in the existing bar; poster tiles are unchanged; empty and shared-link controls hold)`);
