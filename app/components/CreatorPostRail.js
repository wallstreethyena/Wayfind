"use client";

import CreatorVideoRail from "./CreatorVideoRail";
import CheckedCreatorPost from "./CheckedCreatorPost";
import styles from "./CreatorPostRail.module.css";

// THE shared creator-post rail for guides and blogs (owner 2026-11-20: "the
// video holder are not wayfind standard ... a horizontal rail", reference
// /florida-events/roberts-christmas-wonderland-2026). Same pieces as the event
// page's "Seen from local creators": CreatorVideoRail's swipe track and arrow
// buttons, one tile per post, the creator credited on every tile and a direct
// link to the original post. scripts/check-guide-standard.mjs requires guide
// routes to show creator posts only through this component.
//
// posts: [{ url, creator, kind: "reel" | "carousel", coverTitle?, label }]
// headingLevel: the rail heading level (its tile titles go one level below),
// so a rail nested under an entry heading keeps the outline in order.
export default function CreatorPostRail({ posts = [], label, heading = "Seen from local creators", kicker = null, id, headingLevel = 3 }) {
  if (!posts.length) return null;
  const H = "h" + Math.min(6, Math.max(2, headingLevel));
  const T = "h" + Math.min(6, Math.max(2, headingLevel) + 1);
  const many = posts.length > 1;
  return <section className={styles.rail} id={id} aria-label={label}>
    <H className={styles.heading}>{heading}</H>
    <CreatorVideoRail label={label} hint={many ? "Swipe to see every creator post" : "Tap to play it here"}>
      {posts.map((post) => <article key={post.url} className={styles.tile} data-creator-tile="">
        <CheckedCreatorPost post={post} kicker={kicker} />
        <div className={styles.details}>
          <T className={styles.tileTitle}>{post.coverTitle || post.label}</T>
          <p>Seen by @{post.creator}. Instagram controls playback.</p>
          <a href={post.url} target="_blank" rel="noopener noreferrer">Watch @{post.creator}’s post on Instagram ↗</a>
        </div>
      </article>)}
    </CreatorVideoRail>
  </section>;
}
