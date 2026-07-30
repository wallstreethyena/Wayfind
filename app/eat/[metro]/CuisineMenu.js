"use client";
// CuisineMenu — the cuisine chooser, rendered INSIDE the editorial hero card.
//
// The card is now the entire decision surface (owner-signed mock v3,
// docs/mocks/eat-hero-chips-mock-v3.html). The old "deepest choices here" stat
// grid and the separate dark chip section below the card are both GONE: they were
// two surfaces answering the same question, and the stat grid restated counts the
// chips already carried.
//
// TWO TIERS, ONE SYSTEM — no pills anywhere.
//   featured  the six deepest cuisines, gold-framed menu cards (2 rows of 3)
//   index     everything else, menu-style dotted-leader rows ordered by count
//
// THE SIX ARE DERIVED, NEVER LISTED. They are the top 6 by high-confidence place
// count for THIS metro, from the same wf_cuisine_chips derivation as everything
// else — so Tampa features Cuban and Orlando features Breakfast without a line of
// per-metro branching. A static array here would be a second source of truth that
// silently rots the moment inventory moves.
//
// THE INDEX MERGES BOTH FORMER TIERS. A 2-place cuisine is not hidden, it is
// listed with its honest count: an honest thin row still routes to a bookable
// place, a hidden one routes the user to Google.
//
// EVERY ELEMENT IS AN ANCHOR, not a div with a click handler as the mock's markup
// uses. The mock is a static design artefact; a real chooser must be keyboard
// reachable and must expose its destination to a screen reader. Routes are
// unchanged: /eat/<metro>/<cuisine>.
import { track } from "../../../lib/track";
// splitTiers lives in lib/ so scripts/check-cuisine-sheet.mjs can CALL it — node
// cannot import a module containing JSX, and a decision that can only be grepped
// is a decision that is not really tested.
import { splitTiers, FEATURED_COUNT } from "../../../lib/cuisineTiers";


export default function CuisineMenu({ chips, metro }) {
  const { featured, index } = splitTiers(chips);
  if (!featured.length && !index.length) return null;

  const tap = (c, tier, rank) => {
    try {
      // tier is now featured|index so we can measure whether a gold card
      // out-converts an index row. `places` stays the count field the previous
      // event used, so the 7 days of data already collected remain comparable.
      track("cuisine_chip", { cuisine: c.cuisine, metro, tier, places: c.places, rank });
    } catch (e) {}
  };

  return (
    <div className="wf-eat-menu">
      {featured.length ? (
        <>
          <div className="wf-eat-tierhead">
            <span className="wf-eat-orn" aria-hidden="true">&#10087;</span>
            <span className="wf-eat-tiert">Popular here</span>
            <span className="wf-eat-tierrule" aria-hidden="true" />
            <span className="wf-eat-tierhint">Ranked &amp; ready</span>
          </div>
          <ul className="wf-eat-featured">
            {featured.map((c, i) => (
              <li key={c.cuisine}>
                <a href={`/eat/${metro}/${encodeURIComponent(c.cuisine)}`} onClick={() => tap(c, "featured", i + 1)}>
                  <span className="wf-eat-fnum">
                    {c.places}
                    <small>places</small>
                  </span>
                  <span className="wf-eat-fname">{c.display}</span>
                  <span className="wf-eat-fgo">See the shortlist</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {index.length ? (
        <>
          <div className="wf-eat-tierhead">
            <span className="wf-eat-orn" aria-hidden="true">&#10087;</span>
            <span className="wf-eat-tiert">Also on the menu</span>
            <span className="wf-eat-tierrule" aria-hidden="true" />
            <span className="wf-eat-tierhint">Honest counts</span>
          </div>
          <ul className="wf-eat-index">
            {index.map((c, i) => (
              <li key={c.cuisine}>
                <a href={`/eat/${metro}/${encodeURIComponent(c.cuisine)}`} onClick={() => tap(c, "index", FEATURED_COUNT + i + 1)}>
                  <span className="wf-eat-iname">{c.display}</span>
                  {/* The dotted leader is decorative: it carries no information a
                      screen reader should announce between the name and count. */}
                  <span className="wf-eat-idots" aria-hidden="true" />
                  <span className="wf-eat-in">{c.places}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
