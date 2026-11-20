"use client";

import { useEffect, useRef, useState } from "react";
import CreatorVideoPlayer from "./CreatorVideoPlayer";
import styles from "./CreatorPostRail.module.css";

// One creator post tile for the shared guide creator rail (CreatorPostRail).
// It looks like the event page's creator tile: a Wayfind cover with the
// creator's handle and a play mark. Nothing loads from the provider until the
// reader taps.
//
// An iframe "load" event is not proof a visitor can see the post: a blocked,
// failed or logged-out embed still loads a blank frame, which painted a large
// black box (owner report, 2026-11-18). Instagram's embed posts MOUNTED (and
// MEASURE with a height) to the parent once it has drawn, so the player is
// revealed only after that signal from THIS post's frame. Until then the cover
// stays in place with a loading note (never a link out to Instagram) (the hidden player is
// inert and takes no space, so nothing jumps); without the signal in time the
// cover shows a short "didn't load here" card. A late signal still reveals it.
const IG_ORIGIN = "https://www.instagram.com";
export const CREATOR_POST_TIMEOUT_MS = 9000;

export function isInstagramRendered(data) {
  let message = data;
  if (typeof message === "string") { try { message = JSON.parse(message); } catch { return false; } }
  return message?.type === "MOUNTED" || (message?.type === "MEASURE" && Number(message.details?.height) > 150);
}

export default function CheckedCreatorPost({ post, kicker = null }) {
  const host = useRef(null);
  const loadingLink = useRef(null);
  const [state, setState] = useState("idle"); // idle | loading | ready | unavailable
  const [attempt, setAttempt] = useState(0);
  const [focusAfter, setFocusAfter] = useState(false);
  const started = state !== "idle";
  useEffect(() => {
    if (!started) return undefined;
    const onMessage = (event) => {
      if (event.origin !== IG_ORIGIN) return;
      const frame = host.current?.querySelector("iframe");
      if (!frame || event.source !== frame.contentWindow) return;
      if (isInstagramRendered(event.data)) setState("ready");
    };
    window.addEventListener("message", onMessage);
    const timer = setTimeout(() => setState((now) => (now === "ready" ? now : "unavailable")), CREATOR_POST_TIMEOUT_MS);
    return () => { window.removeEventListener("message", onMessage); clearTimeout(timer); };
  }, [started, attempt]);
  useEffect(() => {
    if (focusAfter && state === "loading") { loadingLink.current?.focus(); setFocusAfter(false); }
  }, [focusAfter, state]);
  // The tapped cover unmounts, so focus moves to the loading note.
  const start = () => { setState("loading"); setAttempt((n) => n + 1); setFocusAfter(true); };
  const retry = start;
  const photos = post.kind === "carousel";
  const kind = photos ? "photos" : "reel";
  const title = post.coverTitle || post.label;
  const hidden = state !== "ready";
  const cover = <>
    <span className={styles.coverEyebrow}>THE @{post.creator} EDIT</span>
    <span className={styles.coverTitle}>{kicker ? <span>{kicker}</span> : null}{title}</span>
  </>;
  return <div ref={host} className={styles.post} data-creator-post={post.url} data-creator-post-state={state}>
    {started ? <div className={styles.player} aria-hidden={hidden ? true : undefined} inert={hidden ? "inert" : undefined}>
      <CreatorVideoPlayer key={attempt} platform="instagram" url={post.url} label={post.label} />
    </div> : null}
    {state === "idle" ? <button type="button" className={styles.cover} onClick={start} aria-label={(photos ? "View post" : "Play in Wayfind") + ": @" + post.creator + "’s " + kind + ", " + title}>
      {cover}
      <span className={styles.play} aria-hidden="true">{photos ? "▦" : "▶"}</span>
    </button> : null}
    {state === "loading" ? <div className={styles.cover} role="status">
      {cover}
      <span className={styles.coverNote}>
        <span ref={loadingLink} tabIndex={-1}>Loading the {kind} from @{post.creator}…</span>
      </span>
    </div> : null}
    {state === "unavailable" ? <div className={styles.cover} role="status">
      {cover}
      <span className={styles.coverNote}>
        <span><strong>The post didn’t load here.</strong> Your browser or network may be blocking it. Try again in a moment.</span>
        <span className={styles.coverActions}>
          <button type="button" onClick={retry}>Try again</button>
        </span>
      </span>
    </div> : null}
    {state === "ready" ? <button type="button" className={styles.reload} onClick={retry}>Reload post</button> : null}
  </div>;
}
