"use client";

import { useEffect, useRef, useState } from "react";
import { embedSrc } from "../../../lib/videoEmbed";
import { foodPostMessage, FOOD_POST_TIMEOUT_MS } from "../../../lib/disneyFoodPostEmbed.js";
import styles from "./FoodPost.module.css";

// Show the actual dish in its native, attributed post, not a photo of the park.
// Nothing is copied or rehosted. Hidden park panels must not load nine players.
//
// An iframe "load" is not proof a visitor sees the post (a removed or blocked
// post still loads a blank Instagram page). The post is revealed only after
// Instagram itself reports it drew the content (MOUNTED / MEASURE from that
// exact frame). Until then a compact source card shows, never a tall black
// box; if Instagram never reports content, the card stays with the source link.
export default function FoodPost({ post }) {
  const host = useRef(null);
  const frame = useRef(null);
  const [visible, setVisible] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState("loading"); // loading | shown | unavailable
  const [height, setHeight] = useState(0);
  const src = embedSrc("instagram", post.url);
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

  useEffect(() => {
    if (!visible || !src) return;
    setState("loading");
    setHeight(0);
    let done = false;
    const onMessage = (event) => {
      const seen = foodPostMessage(event, frame.current && frame.current.contentWindow);
      if (!seen) return;
      done = true;
      if (seen.height) setHeight(seen.height);
      setState("shown");
    };
    window.addEventListener("message", onMessage);
    const timer = setTimeout(() => { if (!done) setState("unavailable"); }, FOOD_POST_TIMEOUT_MS);
    return () => { window.removeEventListener("message", onMessage); clearTimeout(timer); };
  }, [visible, src, attempt]);

  const sourceLink = <a href={post.url} target="_blank" rel="noopener noreferrer">Open @{post.creator}’s post on Instagram ↗</a>;
  return <figure ref={host} className={styles.post} data-food-post={post.url} data-food-post-state={visible ? state : "idle"}>
    <figcaption className={styles.caption}>
      <span>{post.kind === "carousel" ? "Food photos" : "Food reel"}</span>
      <strong>{post.coverTitle || post.label}</strong>
      <a href={post.url} target="_blank" rel="noopener noreferrer">@{post.creator} · Original post ↗</a>
    </figcaption>
    {!visible || !src ? <button type="button" className={styles.load} onClick={() => setVisible(true)} disabled={!src}>Show {what} from @{post.creator}</button> : <>
      <div className={styles.frame} data-state={state} style={state === "shown" && height ? { height } : undefined}>
        {state !== "unavailable" ? <iframe key={attempt} ref={frame} src={src} title={post.label} loading="lazy"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen
          className={styles.iframe} style={state === "shown" && height ? { height } : undefined} /> : null}
        {state === "loading" ? <div className={styles.card} role="status">
          <p>Loading the {what} from @{post.creator}…</p>{sourceLink}
        </div> : null}
        {state === "unavailable" ? <div className={styles.card} role="status">
          <p>This post did not load here. Instagram may be blocking it, it may have been removed, or the connection is slow.</p>
          {sourceLink}
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        </div> : null}
      </div>
    </>}
    <p className={styles.note}>Original food post. Instagram controls playback.</p>
  </figure>;
}
