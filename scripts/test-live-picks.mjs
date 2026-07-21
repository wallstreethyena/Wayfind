// scripts/test-live-picks.mjs — lock test for the Live Picks scorer (lib/livePicks.js).
// Pure + deterministic (no network). Pins category priority + the honest ranking so a future
// edit can't silently reorder or start fabricating popularity. Wire into prebuild.
import { categorize, rankLivePicks } from "../lib/livePicks.js";
let n = 0, fail = 0;
const ok = (c, m) => { n++; if (!c) { fail++; console.error("FAIL:", m); } };
const ctx = { todayStr: "2026-07-21", center: { lat: 27.34, lng: -82.53 } };
// id is prefixed to "tm_<id>" like the real events route; destructure so overrides don't clobber it
const ev = ({ id, ...o }) => ({ id: "tm_" + (id ?? "x"), date: "2026-07-22", status: "onsale", price: "$40", lat: 27.34, lng: -82.53, ...o });

ok(categorize(ev({ segment: "Music", genre: "Rock" })) === "concert", "music → concert");
ok(categorize(ev({ segment: "Music", name: "Sarasota Food Festival" })) === "festival", "festival by name");
ok(categorize(ev({ segment: "Arts & Theatre", genre: "Comedy" })) === "comedy", "arts+comedy → comedy");
ok(categorize(ev({ segment: "Arts & Theatre", genre: "Musical" })) === "broadway", "musical → broadway");
ok(categorize(ev({ segment: "Sports", genre: "Baseball" })) === "sports", "sports categorized");

const r1 = rankLivePicks([ev({ id: "a", segment: "Arts & Theatre", genre: "Theatre" }), ev({ id: "b", segment: "Music", genre: "Pop" })], ctx);
ok(r1.hero.id === "tm_b" && r1.hero.category === "concert", "concert is hero over show");

const r2 = rankLivePicks([ev({ id: "s", segment: "Sports", genre: "NFL" }), ev({ id: "c", segment: "Music" })], ctx);
ok(r2.all.every((e) => e.category !== "sports"), "sports excluded from live picks");

const r3 = rankLivePicks([ev({ id: "x", segment: "Music", status: "cancelled" }), ev({ id: "y", segment: "Music" })], ctx);
ok(r3.all.length === 1 && r3.hero.id === "tm_y", "cancelled excluded");

const r4 = rankLivePicks([ev({ id: "far", segment: "Music", lat: 28.5, lng: -82.5 }), ev({ id: "near", segment: "Music", lat: 27.34, lng: -82.53 })], ctx);
ok(r4.hero.id === "tm_near", "closer event wins within category");

const demandMap = { tm_hot: { opens: 5, ticketOuts: 3 } };
const r5 = rankLivePicks([ev({ id: "hot", segment: "Music" }), ev({ id: "cold", segment: "Music" })], { ...ctx, demandMap });
ok(r5.hero.id === "tm_hot", "first-party demand boost breaks a tie");

console.log(`test-live-picks: ${n - fail}/${n} passed`);
if (fail) process.exit(1);
