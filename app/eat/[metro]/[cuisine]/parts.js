"use client";
// The list rows, client-side only so the tap can be instrumented.
//
// The owner asked to see WHICH cuisines users want, so both the chip tap (on the
// chooser sheet) and the place tap here emit an event carrying cuisine + metro.
// Without that, the chooser's whole reason for existing — telling us what people
// are actually in the mood for — produces no data.
// lib/track.js is the one-call tracker for surfaces OUTSIDE the app shell.
// home.js has its own logEvent, but it is a local function in that file and not
// importable — standalone pages use this. One call, at most one PostHog capture.
import { track } from "../../../../lib/track";

export default function CuisineListClient({ places, metro, cuisine }) {
  return (
    <ol className="wf-cl-list">
      {places.map((p, i) => (
        <li key={p.id}>
          <a
            className="wf-cl-row"
            href={"/p/" + encodeURIComponent(p.id)}
            onClick={() => {
              try {
                track("cuisine_place_open", { place_id: p.id, place_name: p.name, cuisine, metro, rank: i + 1 });
              } catch (e) {}
            }}
          >
            <div className="wf-cl-top">
              <span className="wf-cl-name">{p.name}</span>
              {/* A null score stays absent. Coercing it to 0 renders a fake red
                  0.1/10, which is worse than saying nothing. */}
              {p.score != null ? <span className="wf-cl-score">{p.score}/10</span> : null}
            </div>
            <div className="wf-cl-meta">
              {p.rating != null ? `${p.rating}★` : "No rating yet"}
              {p.reviews ? ` · ${p.reviews.toLocaleString()} reviews` : ""}
            </div>
            {p.hook ? <div className="wf-cl-hook">{p.hook}</div> : null}
          </a>
        </li>
      ))}
    </ol>
  );
}
