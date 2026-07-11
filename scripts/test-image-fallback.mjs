// Premium redesign, Phase 3 — the image fallback chain
// (skeleton -> image -> branded artwork) as pure logic. Wired into prebuild.
// The guarantee: an image surface is NEVER a blank rectangle or a
// broken-image glyph — every input maps to exactly one of three states, and
// a missing/dead URL always ends at the branded fallback.
import { imageDisplayState } from "../lib/imageState.js";

let failures = 0;
const fail = (m) => { console.error("test-image-fallback: FAIL — " + m); failures++; };
const eq = (got, want, label) => { if (got !== want) fail(`${label}: expected "${want}", got "${got}"`); };

// No usable src -> branded fallback (never a blank frame).
eq(imageDisplayState({ src: "", errored: false, loaded: false }), "fallback", "empty src");
eq(imageDisplayState({ src: null, errored: false, loaded: false }), "fallback", "null src");
eq(imageDisplayState({ src: undefined, errored: false, loaded: false }), "fallback", "undefined src");

// A dead URL that errored -> branded fallback, regardless of loaded flag.
eq(imageDisplayState({ src: "https://dead.example/x.jpg", errored: true, loaded: false }), "fallback", "errored url");
eq(imageDisplayState({ src: "https://dead.example/x.jpg", errored: true, loaded: true }), "fallback", "errored after load");

// A real URL mid-load -> skeleton (never a blank rectangle while waiting).
eq(imageDisplayState({ src: "https://s1.ticketm.net/x.jpg", errored: false, loaded: false }), "skeleton", "loading");

// A real URL that decoded ok -> the image.
eq(imageDisplayState({ src: "https://s1.ticketm.net/x.jpg", errored: false, loaded: true }), "image", "loaded ok");

// The chain is exhaustive: for every (hasSrc, errored, loaded) combination
// the state is one of the three known values — no undefined/blank leaks.
const known = new Set(["fallback", "skeleton", "image"]);
for (const src of ["", "https://x/y.jpg"]) {
  for (const errored of [false, true]) {
    for (const loaded of [false, true]) {
      const s = imageDisplayState({ src, errored, loaded });
      if (!known.has(s)) fail(`unhandled combination src=${JSON.stringify(src)} errored=${errored} loaded=${loaded} -> ${s}`);
      // Invariant: a dead/absent image must never resolve to "image".
      if ((!src || errored) && s === "image") fail(`dead/absent image resolved to "image" (blank/broken risk): src=${JSON.stringify(src)} errored=${errored}`);
    }
  }
}

if (failures) process.exit(1);
console.log("test-image-fallback: OK — skeleton/image/branded chain is exhaustive; dead or absent URLs always fall back, never blank");
