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
  //   tonight  RESOLVED in v8.90 — the owner's own poster replaced the art
  //            whose eyebrow read "THE BEST AROUND YOU". See its pin below.
  //   best     the art is a mood picker — "What are you in the mood for?" /
  //            "FIND MY VIBE" — while the rail is "The Best Around You" /
  //            "See the top scores". Different promise, same destination.
  //
  // `trending` is deliberately absent: its art still reads "EXPLODING TRENDS
  // NEAR YOU / Everyone's searching this." It carries artStale: true instead
  // and renders no tile until it is redrawn.
  // v8.66 — both tiles are the owner's OWN posters (2026-08-26), byte-derived
  // by scripts/make-rail-art.mjs, zero redraw. Pixels read at pin time:
  //   chef reads "CURATED BY A TOP CHEF / CHEF RON DUPRAT'S TOP 7 /
  //   7 restaurants a Top Chef says are worth the trip. / Chef-approved
  //   dining picks" — the rail copy says the same four things.
  //   augtober reads "SEASONAL / AUGTOBER EVENTS NEAR YOU / Pumpkins,
  //   festivals, spooky nights & Florida fall plans worth showing up for."
  //   — matches title/short/sub.
  chef: { copy: "0b5d7b04d1dce6fd", art: "3df8871be0a36cc1" },
  augtober: { copy: "ed0931530625e1ae", art: "8148ec94da82c4b5" },
  beach: { copy: "bc2e671d898c25b0", art: "10af9b34c86feb0b" },
  best: { copy: "2bc35a61dc8196e8", art: "b43ed06222224c16" },
  // v8.33 — the featured-creator rail. Pixels opened and read before pinning:
  // the tile carries the Wayfind wordmark, a circular photo of the creator with
  // "@cindy.selects" beside it, then "Your next COFFEE SPOT?", "WE ALREADY
  // FOUND THE GOOD ONES.", three proof rows (HANDPICKED / CLOSE TO YOU / REAL
  // REVIEWS), "The best cafés near you — ranked by Wayfind." and the button
  // "FIND YOUR CAFE". Every one of those claims is one this rail can support:
  // the places really are cafés she filmed, they really are ranked by the same
  // engine as everything else, and no placement on it is paid.
  cindy: { copy: "30d97235cfc066b7", art: "4599502d37a1f184" },
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
  // v8.93.1 re-pin, CONFIRMED BY READING BOTH. The poster's baked type is
  // "TRENDING NEAR YOU / What people are searching and experiencing right
  // now."; the rail copy is short "Trending near you", sub "What people are
  // searching and experiencing right now". The old sub also claimed a COUNT
  // ("The 20 trends taking over") the rail never promised — on a quiet night
  // there are fewer than twenty verified near you, and this guard is exactly
  // the thing that should have caught a number the art does not say.
  //
  // v8.94 re-pin — SAME ART, COPY ONLY. The art hash is byte-identical to the
  // v8.93.1 line above because nothing about the poster changed; what changed
  // is the one field v8.93.1 left behind. Its own note transcribes the baked
  // headline as "TRENDING NEAR YOU" and then pins a rail still TITLED
  // "Exploding Trends Near You" — and the title is what the reader actually
  // meets, in the "Showing <rail> near <city>" drop bar, the tile alt and the
  // /r/trending <h1>. This file's bar is "no claim the rail cannot support";
  // a name the picture above it contradicts is the narrowest possible version
  // of exactly that. Pixels re-read at 760px and 380px before re-pinning:
  //     wayfind ⌖
  //     TRENDING
  //     NEAR YOU
  //     What people are searching
  //     and experiencing right now.
  // and nothing else — no CTA is baked in, which is why the rail's cta is free
  // to be plain text ("See what's trending"), the same arrangement the Date
  // Night poster already ships.
  trending: { copy: "66ecfc4ecc4065ef", art: "48aa69f9ded69316" },
  birthday: { copy: "e30656dbabf938e6", art: "c62ecd24477ae8d3" },
  breakfast: { copy: "357ed5dfa8609429", art: "502233352f9fc2aa" },
  blog: { copy: "390c7f9cbf645d12", art: "3af2ada7cdef7446" },
  break: { copy: "8da3d9103f225a40", art: "23219929258396e1" },
  // v14 (2026-08-30) — FOUNDER LOCK. 1086×1448 Adobe DATE NIGHT poster
  // (wayfind / DATE NIGHT / within 27 miles / Impress. Every time.).
  // Regenerated at 760×1013 (source 3:4, --preserve-frame). No BEST NIGHT,
  // no TONIGHT'S MOVE icon row. Rail copy unchanged (title Date Night /
  // Book date night). Pixels live in the image.
  // v8.93 re-pin, CONFIRMED BY READING BOTH. The poster's baked type is
  // "DATE NIGHT / An unforgettable night. Already planned."; the rail copy is
  // short "Already planned", sub "An unforgettable night, ranked for two".
  // The old sub ("The room matters as much as the food") described a poster
  // that no longer exists, which is exactly what this guard is for.
  datenight: { copy: "dee84f0d45e6897a", art: "1b432d0ac5e1ce24" },
  drive: { copy: "3886fcf87019ef5d", art: "e338daa7257af817" },
  eat: { copy: "e76ee14790d3fb92", art: "18d7d66f30860e3d" },
  // v8.29.16 — RE-PINNED, PIXELS READ AT 760px BEFORE PINNING (the bar this
  // file sets for itself). The tile is the owner's own poster, byte-derived from
  // his 941x1672 PNG by scripts/make-rail-art.mjs — a 1px edge trim and a
  // cover-fit resample, zero redraw. It reads:
  //     wayfind
  //     WHAT'S HAPPENING NEAR YOU?
  //     We already picked the good stuff.
  //     CONCERTS. FESTIVALS. SHOWS. POP-UPS.
  //     The best things happening near you — ranked by Wayfind.
  //     [SEE WHAT'S ON ->]
  // lib/rails.js now says the same four things (title / short / sub / cta), and
  // the axis widened from "ticketed and dated" to the DATE, because the curated
  // schedule this tile now opens includes free events and pop-ups.
  //
  // The one line worth naming out loud: "ranked by Wayfind". It is a ranking
  // claim, not a Score claim — lib/frontEvents.js eventStature really does rank
  // these, and test-event-rail-images still forbids an event card ever wearing
  // a Wayfind Score. Replaces the purple "YOUR NIGHT STARTS HERE / Local
  // events. Real experiences." art, which was off-brand and made no promise
  // about what was actually behind it.
  events: { copy: "12d73e13f0973f31", art: "70e5f6df7ebd983a" },
  family: { copy: "947a8d48e13dac62", art: "9e64f507ce5c39e6" },
  gems: { copy: "ce723fe8321d837e", art: "f9c55fb2f617fd5e" },
  locals: { copy: "24b845b1d9114368", art: "78ea67914dee5c7b" },
  season: { copy: "5e56e55d7648c697", art: "0396a099193ec768" },
  today: { copy: "d4910f822ce738ba", art: "0ffb0528c763577d" },
  // v8.90 — RE-PINNED, and this one closes a mismatch that had been recorded
  // and tolerated since the 2026-08-16 baseline: the old art's eyebrow read
  // "THE BEST AROUND YOU", which is a DIFFERENT rail's name, on a card called
  // Tonight's Move. The owner replaced it with his own poster and the two now
  // agree word for word — the art says "NIGHTLIFE / TONIGHT'S MOVE / Concerts,
  // live music, comedy & events actually worth going out for tonight / Ranked
  // for right now", and the copy is title "Tonight's Move", sub "Concerts,
  // live music, comedy & events", short "Ranked for right now".
  //
  // Read at 300px before re-pinning, which is what this file asks for.
  tonight: { copy: "852c9b81e7b9c33d", art: "a1301677f237214b" },
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
