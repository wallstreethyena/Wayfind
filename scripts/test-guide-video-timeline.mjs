#!/usr/bin/env node
import assert from "node:assert/strict";
import { buildTimeline, frameAt, wrapLines, estimateMaxChars, TITLE_FONT_PX, MAX_DURATION_SEC, isAllowedPhotoUrl } from "../lib/guideVideoTimeline.js";

const mk = (n, withPhoto = true) => Array.from({ length: n }, (_, i) => ({
  name: `Spot ${i + 1}`, category: "Beach", dayNumber: 1 + (i % 2),
  photo: withPhoto ? { url: `/photos/p${i}.jpg`, credit: `Credit ${i % 3}` } : null,
}));
const base = { title: "Hidden springs weekend", city: "Sarasota", days: 2 };

// duration bound + scene count + cap
for (const n of [0, 1, 4, 8, 12]) {
  const tl = buildTimeline({ ...base, stops: mk(n) });
  assert.ok(tl.durationSec <= MAX_DURATION_SEC, `duration ${tl.durationSec}`);
  assert.equal(tl.scenes.length, Math.min(n, 8) + 2, `scene count for ${n}`);
  assert.equal(tl.scenes[0].type, "intro");
  assert.equal(tl.scenes.at(-1).type, "end");
  assert.equal(tl.fps, 30); assert.equal(tl.width, 1080); assert.equal(tl.height, 1920);
}

// forward-only motion
{
  const tl = buildTimeline({ ...base, stops: mk(8) });
  for (const sc of tl.scenes.filter((s) => s.type === "photo")) {
    let prev = null;
    for (let k = 0; k < 60; k++) {
      const f = frameAt(tl, sc.start + (sc.dur * 0.999 * k) / 59);
      assert.equal(f.scene, sc);
      if (prev) {
        assert.ok(f.scale >= prev.scale - 1e-12, "scale non decreasing");
        const dx = f.offsetX - prev.offsetX, dy = f.offsetY - prev.offsetY;
        assert.ok(dx * sc.dir >= -1e-12, "x drift one direction");
        assert.ok(dy <= 1e-12, "y drift one direction");
      }
      prev = f;
    }
    assert.ok(Math.abs(frameAt(tl, sc.start).scale - 1) < 1e-9, "starts at 1.00");
    assert.ok(prev.scale > 1.07 && prev.scale <= 1.08 + 1e-9, "ends near 1.08");
  }
  // crossfade never longer than 0.35s
  let blended = 0;
  for (let t = 0; t < tl.durationSec; t += 1 / 30) if (frameAt(tl, t).blend > 0) blended++;
  assert.ok(blended / 30 <= 0.36 * tl.scenes.length, "crossfade bounded");
}

// null photo -> card, never a photo
{
  const stops = mk(3); stops[1].photo = null; stops[2].photo = { url: "http://evil.example/x.jpg", credit: "Bad" };
  const tl = buildTimeline({ ...base, stops });
  assert.equal(tl.scenes[2].type, "card"); assert.equal(tl.scenes[2].photo, null);
  assert.equal(tl.scenes[3].type, "card", "disallowed url treated as null");
  assert.ok(!tl.scenes.at(-1).credits.includes("Bad"));
  assert.ok(isAllowedPhotoUrl("https://www.gowayfind.com/a.jpg") && isAllowedPhotoUrl("https://gowayfind.com/a.jpg") && !isAllowedPhotoUrl("//x.com/a.jpg"));
}

// credits deduped, each used once
{
  const tl = buildTimeline({ ...base, stops: mk(8) });
  const c = tl.scenes.at(-1).credits;
  assert.deepEqual([...c].sort(), ["Credit 0", "Credit 1", "Credit 2"]);
  assert.equal(new Set(c).size, c.length);
}

// empty stops
{
  const tl = buildTimeline({ ...base, stops: [] });
  assert.equal(tl.scenes.length, 2);
  assert.deepEqual(tl.scenes.at(-1).credits, []);
  assert.equal(buildTimeline({}).scenes.length, 2);
  assert.ok(frameAt(tl, 999).scene.type === "end" && frameAt(tl, -5).scene.type === "intro");
}

// text wrapping
{
  const maxChars = estimateMaxChars(TITLE_FONT_PX);
  const long = "The Extraordinarily Long Named Springs and Family Beach Preserve of Southwest Florida Gulf Coast Region";
  const lines = wrapLines(long, maxChars);
  assert.ok(lines.length <= 2);
  assert.ok(lines.every((l) => l.length <= maxChars), "no overflow");
  assert.ok(lines.at(-1).endsWith("…"), "ellipsis on overflow");
  assert.deepEqual(wrapLines("Short name", maxChars), ["Short name"]);
  const giant = wrapLines("A".repeat(300), maxChars);
  assert.ok(giant.length <= 2 && giant.every((l) => l.length <= maxChars) && giant.at(-1).endsWith("…"));
  assert.ok(!wrapLines("Fort-Myers — Beach", 40).join(" ").match(/[-—]/), "no dashes");
  const tl = buildTimeline({ ...base, stops: [{ name: long, category: "x", dayNumber: 1, photo: null }] });
  assert.ok(tl.scenes[1].lines.length <= 2 && tl.scenes[1].lines.every((l) => l.length <= maxChars));
}

console.log("PASS guide video timeline: duration, scene count, forward-only motion, cards, credits, wrapping");
