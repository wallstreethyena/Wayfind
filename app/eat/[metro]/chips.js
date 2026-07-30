"use client";
// The chip grid, client-side so the tap can be instrumented.
//
// THE OWNER'S QUESTION this answers: which cuisines do users actually want? The
// chooser's whole reason for existing is to tell us that, and until now the taps
// emitted nothing — so the surface could not have answered it.
//
// Every chip carries the cuisine, the metro, its tier and its honest place count,
// so a tap on a 2-place thin chip is distinguishable from a tap on a 38-place full
// one. That difference is the demand signal.
import { track } from "../../../lib/track";

export default function CuisineChips({ chips, metro, tier }) {
  if (!chips.length) return null;
  return (
    <ul className="wf-eat-chips">
      {chips.map((c, i) => (
        <li className={"wf-eat-chip" + (tier === "thin" ? " wf-eat-thin" : "")} key={c.cuisine}>
          {/* A FILTER on local inventory — /eat/<metro>/<cuisine>, never a search
              query. This used to point at /?cat=food&cuisine=… which nothing read,
              so every chip landed back on the home page. */}
          <a
            href={`/eat/${metro}/${encodeURIComponent(c.cuisine)}`}
            onClick={() => {
              try {
                track("cuisine_chip", { cuisine: c.cuisine, metro, tier, places: c.places, rank: i + 1 });
              } catch (e) {}
            }}
          >
            <span className="wf-eat-chip-name">{c.display}</span>
            <span className="wf-eat-chip-count">{c.places}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
