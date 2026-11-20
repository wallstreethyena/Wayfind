"use client";

import { useEffect, useRef, useState } from "react";
import CreatorVideoPlayer from "../../components/CreatorVideoPlayer";
import styles from "./page.module.css";

// Show the actual dish in its native, attributed post, not a photo of the park.
// Nothing is copied or rehosted. Hidden park panels must not load nine players.
//
// An iframe "load" event is not proof a visitor can see the post: a blocked,
// failed or logged-out embed still loads a blank frame, which painted a large
// black box (owner report, 2026-11-18). Instagram's embed posts MOUNTED (and
// MEASURE with a height) to the parent once it has drawn, so the player is
// revealed only after that signal from THIS post's frame. Until then a compact
// loading panel carries the source link (the hidden player still loads but is
// inert and takes no space, so nothing jumps); without the signal in time the
// post becomes a compact source card. A late signal still reveals the post.
const IG_ORIGIN = "https://www.instagram.com";
export const FOOD_POST_TIMEOUT_MS = 9000;

export function isInstagramRendered(data) {
  let message = data;
  if (typeof message === "string") { try { message = JSON.parse(message); } catch { return false; } }
  return message?.type === "MOUNTED" || (message?.type === "MEASURE" && Number(message.details?.height) > 150);
}

export default function FoodPost({ post }) {
  const host = useRef(null);
  const loadingLink = useRef(null);
  const [state, setState] = useState("idle"); // idle | loading | ready | unavailable
  const [attempt, setAttempt] = useState(0);
  const [focusAfter, setFocusAfter] = useState(false);
  const visible = state !== "idle";
  useEffect(() => {
    if (!host.current || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setState((now) => (now === "idle" ? "loading" : now));
        observer.disconnect();
      }
    }, { rootMargin: "180px" });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return undefined;
    const onMessage = (event) => {
      if (event.origin !== IG_ORIGIN) return;
      const frame = host.current?.querySelector("iframe");
      if (!frame || event.source !== frame.contentWindow) return;
      if (isInstagramRendered(event.data)) setState("ready");
    };
    window.addEventListener("message", onMessage);
    const timer = setTimeout(() => setState((now) => (now === "ready" ? now : "unavailable")), FOOD_POST_TIMEOUT_MS);
    return () => { window.removeEventListener("message", onMessage); clearTimeout(timer); };
  }, [visible, attempt]);
  useEffect(() => {
    if (focusAfter && state === "loading") { loadingLink.current?.focus(); setFocusAfter(false); }
  }, [focusAfter, state]);
  const retry = () => { setState("loading"); setAttempt((n) => n + 1); setFocusAfter(true); };
  const kind = post.kind === "carousel" ? "food photos" : "food reel";
  const hidden = state !== "ready";
  return <figure ref={host} className={styles.foodPost} data-food-post={post.url} data-food-post-state={state}>
    <figcaption className={styles.foodPostCaption}>
      <span>{post.kind === "carousel" ? "Food photos" : "Food reel"}</span>
      <strong>{post.coverTitle || post.label}</strong>
      <span data-food-post-credit="">@{post.creator} · Original post</span>
    </figcaption>
    {visible ? <div className={styles.foodPostShell}>
      <div className={styles.foodPostPlayer} aria-hidden={hidden ? true : undefined} inert={hidden ? "" : undefined}>
        <CreatorVideoPlayer key={attempt} platform="instagram" url={post.url} label={post.label} />
      </div>
      {state === "ready" ? <button type="button" className={styles.foodPostReload} onClick={retry}>Reload post</button> : null}
      {state === "loading" ? <div className={styles.foodPostLoading} role="status">
        <p ref={loadingLink} tabIndex={-1}>Loading the {kind} from @{post.creator}…</p>
      </div> : null}
      {state === "unavailable" ? <div className={styles.foodPostCard} role="status">
        <p><strong>The post didn’t load here.</strong> Your browser or network may be blocking it. Try again in a moment.</p>
        <div>
          <button type="button" onClick={retry}>Try again</button>
        </div>
      </div> : null}
    </div> :
      <button type="button" className={styles.loadFoodPost} onClick={() => setState("loading")}>Show {kind} from @{post.creator}</button>}
    <p className={styles.foodPostNote}>Original food post. Instagram controls playback.</p>
  </figure>;
}
