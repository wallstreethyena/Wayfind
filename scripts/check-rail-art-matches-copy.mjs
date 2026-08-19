#!/usr/bin/env node
/**
 * check-rail-art-matches-copy — the rail tile's headline is PIXELS, not text.
 * When the copy changes and the art does not, the reader keeps reading the old
 * claim while every copy guard in the repo reports green.
 *
 * MEASURED 2026-08-16, on the live page. The trending rail was renamed from
 * "Exploding Trends Near You" to "Most Talked About Near You" because the
 * spike signal it claimed does not exist (wf_place_popularity holds 164 rows,
 * all wikipedia; restaurants and bars could never qualify). lib/rails.js was
 * updated, the alt text and aria-label were updated, and test-buzz's
 * spike-word assertion went green — it reads lib/rails.js.
 *
 * The tile still said, in baked type over a burger photograph:
 *
 *     🔥 EXPLODING TRENDS NEAR YOU
 *     Everyone's searching this. You should too.
 *     [See what's trending →]
 *
 * That is the exact unfalsifiable claim the rename removed, still shipping,
 * because public/cards-v8/trending-*.{avif,webp,jpg} was never regenerated.
 * A guard reading source cannot read a JPEG, so the two drifted silently.
 *
 * WHAT THIS DOES: pins each rail's COPY to a hash of its ART. Change the copy
 * without regenerating the art and it fires, naming the file to rebuild.
 * Change the art without touching the copy and it also fires — an art refresh
 * that quietly reintroduces old wording is the same bug pointed the other way.
 *
 * It cannot read the pixels, and does not pretend to. It asserts only that the
 * two were last changed TOGETHER, which is the property that was violated.
 * Re-point it by updating the pair below and saying what the art now reads.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";

const rails = readFileSync("lib/rails.js", "utf8");
const dayRail = readFileSync("app/components/DaypartRail.js", "utf8");
const sha = (b) => createHash("sha256").update(b).digest("hex").slice(0, 16);

// rail id -> the {copy, art} hash pair last CONFIRMED to say the same thing.
// A rail may instead carry `artStale: true` in lib/rails.js, which means its
// art is known to contradict its copy and its tile is therefore not rendered.
// Every rail with art must be in exactly one of those two states.
const PAIRS = {
  // Pin a rail here only after LOOKING at public/cards-v8/<id>-760.jpg and
  // confirming the words in the image match the words in lib/rails.js.
  //
  // BASELINE 2026-08-16: all fourteen below were opened and read at 300px
  // before being pinned. None makes a claim its rail cannot support, which is
  // the bar — the art is not required to quote the copy word for word.
  //
  // TWO WORTH THE OWNER'S EYE, recorded here rather than silently blessed.
  // Neither is false, so neither blocks; both look like copy that moved on
  // without its art:
  //   tonight  the art's eyebrow reads "THE BEST AROUND YOU", which is a
  //            DIFFERENT rail's name. The rail is "Tonight's Move".
  //   best     the art is a mood picker — "What are you in the mood for?" /
  //            "FIND MY VIBE" — while the rail is "The Best Around You" /
  //            "See the top scores". Different promise, same destination.
  //
  // `trending` is deliberately absent: its art still reads "EXPLODING TRENDS
  // NEAR YOU / Everyone's searching this." It carries artStale: true instead
  // and renders no tile until it is redrawn.
  beach: { copy: "bc2e671d898c25b0", art: "10af9b34c86feb0b" },
  best: { copy: "2bc35a61dc8196e8", art: "b43ed06222224c16" },
  // v8.16 (owner, 2026-08-19: "when I give you a card for the amazon rail use
  // it EXACTLY as I provided it"): the v8.15 tiles were REDRAWN flat mocks of
  // the owner's posters. Replaced with the owner's own artwork, byte-derived
  // from the provided PNGs (941x1672 -> 760x1350, a 1px edge trim, zero
  // redraw). Pixels re-verified by eye: birthday reads "BIRTHDAY PLANS,
  // SOLVED." on the celadon T-rex poster, breakfast "BEST BREAKFAST PICKS."
  // on the yellow coffee poster — both match the rail copy.
  // v8.15 (2026-08-18) — pixels verified by eye at pin time: the birthday tile
  // reads "BIRTHDAY PLANS, SOLVED. / Make their birthday worth remembering.",
  // the breakfast tile "BEST BREAKFAST PICKS. / HANDPICKED. LOCAL. WORTH
  // WAKING UP FOR." — both match the rail copy they were drawn for.
  // v8.17 (owner: "you also removed the top 20 trends amazon rail card") —
  // tile restored, VIEWED at pin time: burger art, baked headline "EXPLODING
  // TRENDS NEAR YOU / Everyone's searching this. You should too. / See
  // what's trending →" — matches the restored rail copy, and the drop now
  // leads with the owner's 20 curated trends (v8.12), so the claim is backed.
  trending: { copy: "687d51781c7e6ddb", art: "61663b523e17f32a" },
  birthday: { copy: "e30656dbabf938e6", art: "c62ecd24477ae8d3" },
  breakfast: { copy: "357ed5dfa8609429", art: "502233352f9fc2aa" },
  blog: { copy: "390c7f9cbf645d12", art: "3af2ada7cdef7446" },
  break: { copy: "8da3d9103f225a40", art: "23219929258396e1" },
  datenight: { copy: "0aca4828b3f1fdfd", art: "022cf3872de7c9a9" },
  drive: { copy: "3886fcf87019ef5d", art: "e338daa7257af817" },
  eat: { copy: "e76ee14790d3fb92", art: "18d7d66f30860e3d" },
  events: { copy: "df419c2fb034ec56", art: "6a652cfc337fb25e" },
  family: { copy: "947a8d48e13dac62", art: "9e64f507ce5c39e6" },
  gems: { copy: "ce723fe8321d837e", art: "f9c55fb2f617fd5e" },
  locals: { copy: "24b845b1d9114368", art: "78ea67914dee5c7b" },
  season: { copy: "5e56e55d7648c697", art: "0396a099193ec768" },
  today: { copy: "d4910f822ce738ba", art: "0ffb0528c763577d" },
  tonight: { copy: "0f47f844eddc75d2", art: "db7ea7951ebf8142" },
};

const railRow = (id) => (rails.match(new RegExp(`\\{ id: "${id}",[\\s\\S]*?\\},`)) || [""])[0];
const readerCopy = (row) =>
  (row.match(/title: "([^"]*)"/) || [])[1] + "|" +
  (row.match(/short: "([^"]*)"/) || [])[1] + "|" +
  (row.match(/\bsub: "([^"]*)"/) || [])[1] + "|" +
  (row.match(/cta: "([^"]*)"/) || [])[1];

let pass = 0;
const fail = [];
const staleIds = [];

// Every rail that HAS art must be accounted for — pinned, or declared stale.
const withArt = [...new Set(
  readdirSync("public/cards-v8").map((f) => f.replace(/-\d+\.(avif|webp|jpg)$/, ""))
)].filter((id) => railRow(id));

for (const id of withArt) {
  const row = railRow(id);
  const stale = /\bartStale: true\b/.test(row);
  const artPath = `public/cards-v8/${id}-760.jpg`;
  if (!existsSync(artPath)) { fail.push(`${artPath} is missing — the tile has copy but no fallback art`); continue; }

  const copyHash = sha(readerCopy(row));
  const artHash = sha(readFileSync(artPath));
  const pinned = PAIRS[id];

  if (stale) {
    // artStale HIDES the tile (DaypartRail filters r.artStale). The trending
    // art still reads EXPLODING TRENDS NEAR YOU and the accordion is dark, so
    // shipping the tile would advertise a surface that cannot open. The flag
    // still tracks the mismatch until the art is redrawn.
    if (pinned) {
      fail.push(`rail "${id}" is BOTH pinned and marked artStale. Pick one: if the art now matches, drop artStale; if it does not, drop the pin.`);
      continue;
    }
    // The note sits ABOVE the rail, and the flag sits on the rail's own line —
    // so look BACKWARDS from the declaration, not forwards from the flag.
    const at = rails.indexOf(`{ id: "${id}",`);
    const preamble = at > 0 ? rails.slice(Math.max(0, at - 1200), at) : "";
    if (!/artStale/.test(preamble)) {
      fail.push(`rail "${id}" is marked artStale with no note above it saying what the art actually reads. A bare flag is indistinguishable from a forgotten one.`);
      continue;
    }
    staleIds.push(id);
    pass++;
    continue;
  }

  if (!pinned) {
    fail.push(
      `rail "${id}" is neither pinned nor marked artStale.\n` +
      `      Its tile renders ${artPath}, whose headline is BAKED INTO THE IMAGE, and nothing\n` +
      `      has confirmed those pixels still match:\n` +
      `        "${readerCopy(row).split("|").join('" / "')}"\n` +
      `      Look at the image. If it matches:  ${id}: { copy: "${copyHash}", art: "${artHash}" }\n` +
      `      If it does not: add artStale: true to the rail until the art is redrawn.`
    );
    continue;
  }
  if (pinned.copy !== copyHash && pinned.art === artHash) {
    fail.push(`rail "${id}": the COPY changed but ${artPath} did not. The tile still shows the old headline in baked type — redraw the art (or mark artStale), then re-pin.`);
    continue;
  }
  if (pinned.art !== artHash && pinned.copy === copyHash) {
    fail.push(`rail "${id}": ${artPath} changed but the copy did not. Confirm the new art does not reintroduce wording the copy no longer makes, then re-pin.`);
    continue;
  }
  if (pinned.copy !== copyHash || pinned.art !== artHash) {
    fail.push(`rail "${id}": both copy and art changed. Confirm they now say the same thing, then re-pin: { copy: "${copyHash}", art: "${artHash}" }`);
    continue;
  }
  pass++;
}


if (!/if \(r\.artStale\) return null/.test(dayRail) && !/!r\.artStale/.test(dayRail)) {
  fail.push("DaypartRail must hide artStale tiles — Exploding Trends baked type must not render");
}

if (fail.length) {
  console.error(`check-rail-art-matches-copy: ${pass} pinned, ${fail.length} NEEDS ATTENTION`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-rail-art-matches-copy: OK — ${pass}/${withArt.length} rails with baked tile art are accounted for (pinned to the copy they depict, or declared artStale)`);
if (staleIds.length) {
  console.log(`  OUTSTANDING ART DEBT — ${staleIds.length} tile(s) still show a headline the copy has moved past. The reader sees the image, not lib/rails.js:`);
  for (const id of staleIds) console.log(`    ${id}  ->  redraw public/cards-v8/${id}-{380,760}.{avif,webp,jpg}, then drop artStale and pin the pair`);
}
