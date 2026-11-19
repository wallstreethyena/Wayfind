"use client";

import { useEffect, useRef, useState } from "react";
import CreatorVideoPlayer from "../../components/CreatorVideoPlayer";
import styles from "./FoodPost.module.css";

// Show the actual dish in its native, attributed post, not a photo of the park.
// Nothing is copied or rehosted. Hidden park panels must not load nine players.
//
// An iframe "load" is not proof a visitor sees the post (a removed or blocked
// post still loads a blank Instagram page), so the shared player runs in its
// confirmShown mode: the post appears only after Instagram reports it drew it.
// Until then a compact source card shows, never a tall black box; if Instagram
// never reports content, the card stays with the source link and Try again.
export default function FoodPost({ post }) {
  const host = useRef(null);
  const [visible, setVisible] = useState(false);
  const what = post.kind === "carousel" ? "food photos" : "food reel";
  useEffect(() => {
    if (!host.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "180px" });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const sourceLink = <a href={post.url} target="_blank" rel="noopener noreferrer">Open @{post.creator}’s post on Instagram ↗</a>;
  return <figure ref={host} className={styles.post} data-food-post={post.url} data-food-post-state={visible ? "player" : "idle"}>
    <figcaption className={styles.caption}>
      <span>{post.kind === "carousel" ? "Food photos" : "Food reel"}</span>
      <strong>{post.coverTitle || post.label}</strong>
      <a href={post.url} target="_blank" rel="noopener noreferrer">@{post.creator} · Original post ↗</a>
    </figcaption>
    {visible ? <CreatorVideoPlayer platform="instagram" url={post.url} label={post.label} confirmShown
      pending={<div className={styles.card} role="status"><p>Loading the {what} from @{post.creator}…</p>{sourceLink}</div>}
      unavailable={(retry) => <div className={styles.card} role="status">
        <p>This post did not load here. Instagram may be blocking it, it may have been removed, or the connection is slow.</p>
        {sourceLink}
        <button type="button" onClick={retry}>Try again</button>
      </div>} /> :
      <button type="button" className={styles.load} onClick={() => setVisible(true)}>Show {what} from @{post.creator}</button>}
    <p className={styles.note}>Original food post. Instagram controls playback.</p>
  </figure>;
}
