"use client";

import CreatorVideoRail from "./CreatorVideoRail";
import CheckedCreatorPost from "./CheckedCreatorPost";
import { isEmbeddable } from "../../lib/videoEmbed";
import styles from "./CreatorPostRail.module.css";

// THE shared creator-post rail for guides and blogs (owner 2026-11-20: "the
// video holder are not wayfind standard ... a horizontal rail", reference
// /florida-events/roberts-christmas-wonderland-2026). Same pieces as the event
// page's "Seen from local creators": CreatorVideoRail's swipe track and arrow
// buttons, one tile per post, the creator credited on every tile and a direct
// credit as text. Owner 2026-11-20: visitors are never sent to Instagram, so
// only posts Instagram plays inside Wayfind are shown (lib/videoEmbed.js
// isEmbeddable) and there is no link out. scripts/check-guide-standard.mjs
// requires guide routes to show creator posts only through this component.
//
// posts: [{ url, creator, kind: "reel" | "carousel", coverTitle?, label }]
// headingLevel: the rail heading level (its tile titles go one level below),
// so a rail nested under an entry heading keeps the outline in order.
export default function CreatorPostRail({ posts = [], label, heading = "Seen from local creators", kicker = null, id, headingLevel = 3 }) {
  const shown = posts.filter((post) => isEmbeddable("instagram", post.url));
  if (!shown.length) return null;
  const H = "h" + Math.min(6, Math.max(2, headingLevel));
  const T = "h" + Math.min(6, Math.max(2, headingLevel) + 1);
  const many = shown.length > 1;
  return <section className={styles.rail} id={id} aria-label={label}>
    <H className={styles.heading}>{heading}</H>
    <CreatorVideoRail label={label} hint={many ? "Swipe to see every creator post" : "Tap to play it here"}>
      {shown.map((post) => <article key={post.url} className={styles.tile} data-creator-tile="">
        <CheckedCreatorPost post={post} kicker={kicker} />
        <div className={styles.details}>
          <T className={styles.tileTitle}>{post.coverTitle || post.label}</T>
          <p>Seen by @{post.creator}. Plays here on Wayfind; Instagram controls playback.</p>
        </div>
      </article>)}
    </CreatorVideoRail>
  </section>;
}
