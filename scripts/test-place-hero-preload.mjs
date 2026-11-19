// Regression for the 2026-11-18 desktop LCP alert (2688ms p75): /p/<id> must
// hand the browser the detail hero in the first HTML, from the SAME gallery the
// detail panel renders, bounded so it can never slow the page, never a guess.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { heroPreloadSrc, placeHeroPreloadSrc, inventoryCoverSrc } from "../lib/inventoryDetailGallery.js";

let assertions = 0;
const ok = (condition, message) => { assert.ok(condition, message); assertions++; };
const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const V = "4c2770595b3125bfb79568a8d8092a282329bfe54a3e0641dbe95cf80daf6289";
const stored = `/api/photo/stored/ChIJwZ_GK-d-54gRm5Ahg7PZYeY?v=${V}`;

// Which URLs are preloadable.
const storedHero = heroPreloadSrc([{ src: stored }, { src: "/place-photos/x.jpg" }]);
ok(storedHero === stored, "stored versioned photo first: preloaded exactly");
ok(heroPreloadSrc([{ src: "/place-photos/batch/a.jpg" }]) === "/place-photos/batch/a.jpg", "owned same-origin photo first: preloaded");
ok(heroPreloadSrc([{ src: "/api/photo?place=ChIJx&g=2&w=640" }]) === null, "JSON photo lane (resolved later in the browser) is never preloaded");
ok(heroPreloadSrc([{ src: "/api/photo/stored/ChIJx?v=short" }]) === null, "unversioned stored path is not preloaded");
ok(heroPreloadSrc([{ src: "https://snowcatridge.com/wp-content/uploads/2021/11/SS_1.jpg" }]) === "https://snowcatridge.com/wp-content/uploads/2021/11/SS_1.jpg", "owned photo on the venue's https host is preloaded (Snowcat Ridge)");
ok(heroPreloadSrc([{ src: "http://snowcatridge.com/a.jpg" }]) === null, "plain http is never preloaded");
ok(heroPreloadSrc([{ src: "//evil.example/x.jpg" }]) === null, "protocol-relative URL is not preloaded");
ok(heroPreloadSrc([{ src: '/x.jpg" onerror="' }]) === null, "a src with quotes or spaces is refused");
ok(heroPreloadSrc([]) === null && heroPreloadSrc(null) === null, "empty gallery: no preload");

// Bounded, failure-silent server read.
const row = { place_id: "ChIJwZ_GK-d-54gRm5Ahg7PZYeY", name: "Red Coconut Club", lat: 27.9, lng: -82.4, signals: {} };
const resolved = await placeHeroPreloadSrc(row.place_id, { identity: async () => row, gallery: async () => [{ src: stored }] });
ok(resolved === stored, "inventory place resolves its hero");
const overridden = await placeHeroPreloadSrc(row.place_id, { placeParam: "ChIJotherPlace123", identity: async () => row, gallery: async () => [{ src: stored }] });
ok(overridden === null, "/p/X?place=Y renders Y on the client, so X's hero is not preloaded");
const sameParam = await placeHeroPreloadSrc(row.place_id, { placeParam: row.place_id, identity: async () => row, gallery: async () => [{ src: stored }] });
ok(sameParam === stored, "?place= naming the same place still preloads");
const t0 = Date.now();
const slow = await placeHeroPreloadSrc(row.place_id, { timeoutMs: 40, identity: () => new Promise((r) => setTimeout(() => r(row), 500)), gallery: async () => [{ src: stored }] });
ok(slow === null && Date.now() - t0 < 300, "a slow store read gives up at the timeout instead of delaying the page");
ok(await placeHeroPreloadSrc(row.place_id, { identity: async () => { throw new Error("down"); } }) === null, "a store outage is no preload, never an error");
ok(await placeHeroPreloadSrc(row.place_id, { identity: async () => ({ ...row, lat: NaN }), gallery: async () => [{ src: stored }] }) === null, "rows the details route rejects (no coordinates) get no preload either");
ok(await placeHeroPreloadSrc("../etc", { identity: async () => row, gallery: async () => [{ src: stored }] }) === null, "malformed ids are refused before any read");
ok(inventoryCoverSrc({ photo_url: "/a.jpg" }) === "/a.jpg" && inventoryCoverSrc({ photoUrl: "/b.jpg" }) === "/b.jpg" && inventoryCoverSrc(null) === "", "cover source matches the details route ladder");

// Wiring: one gallery assembler for the panel and the preload.
const route = read("app/api/places/details/route.js");
ok(/gallery = await inventoryDetailGallery\(row\);/.test(route), "details route builds its gallery through the shared assembler");
const page = read("app/p/[id]/page.js");
ok(/import \{ preload \} from "react-dom";/.test(page) && /placeHeroPreloadSrc\(id, \{ placeParam: s\(searchParams\.place\) \}\)/.test(page), "place page computes the hero preload, aware of ?place=");
ok(/Promise\.all\(\[homeShellData\(\), placeHeroPreloadSrc\(id, /.test(page), "the preload read runs in parallel with the shell data (adds no serial wait)");
ok(/preload\(heroSrc, \{ as: "image", fetchPriority: "high" \}\)/.test(page), "the hero is preloaded as a high-priority image");

console.log("test-place-hero-preload: OK — " + assertions + " assertions");
