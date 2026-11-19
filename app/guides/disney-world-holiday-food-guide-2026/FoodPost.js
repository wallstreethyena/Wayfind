"use client";

import { useEffect, useRef, useState } from "react";
import CreatorVideoPlayer from "../../components/CreatorVideoPlayer";
import styles from "./page.module.css";

// Show the actual dish in its native, attributed post, not a photo of the park.
// Nothing is copied or rehosted. Hidden park panels must not load nine players.
export default function FoodPost({ post }) {
  const host = useRef(null);
  const [visible, setVisible] = useState(false);
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
  return <figure ref={host} className={styles.foodPost} data-food-post={post.url}>
    <figcaption className={styles.foodPostCaption}>
      <span>{post.kind === "carousel" ? "Food photos" : "Food reel"}</span>
      <strong>{post.coverTitle || post.label}</strong>
      <a href={post.url} target="_blank" rel="noopener noreferrer">@{post.creator} · Original post ↗</a>
    </figcaption>
    {visible ? <CreatorVideoPlayer platform="instagram" url={post.url} label={post.label} /> :
      <button type="button" className={styles.loadFoodPost} onClick={() => setVisible(true)}>Show {post.kind === "carousel" ? "food photos" : "food reel"} from @{post.creator}</button>}
    <p className={styles.foodPostNote}>Original food post. Instagram controls playback.</p>
  </figure>;
}
