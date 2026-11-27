"use client";
// Code-rendered 9:16 motion preview of a community guide. Zero AI credits, no sound.
// Everything drawn comes from frameAt(timeline, t), so live playback and the recorded
// file look identical. Analytics only via the optional onEvent prop.
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  buildTimeline, frameAt, wrapLines, estimateMaxChars,
  OVERSCAN, LOGO_SRC, isAllowedPhotoUrl,
} from "../../lib/guideVideoTimeline";
import { shareOut } from "../../lib/shareOut.js";

const C = { bg: "#0D1117", card: "#1C2230", text: "#F1F5F9", muted: "#94A3B8", gold: "#FBBF24" };
const FONT = "Poppins, system-ui, -apple-system, 'Segoe UI', sans-serif";
const MIME_CHOICES = ["video/mp4;codecs=avc1.42E01E", "video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"];

// The browser's MediaRecorder, read off window so a server render or an old
// browser without it gets undefined instead of a ReferenceError.
function recorderClass() {
  return typeof window !== "undefined" && typeof window.MediaRecorder === "function" ? window.MediaRecorder : undefined;
}

function pickMime() {
  const Rec = recorderClass();
  if (!Rec || typeof Rec.isTypeSupported !== "function") return null;
  for (const m of MIME_CHOICES) { try { if (Rec.isTypeSupported(m)) return m; } catch (e) {} }
  return null;
}

// A 1x1 probe: drawing a cross origin image without CORS taints a canvas. Detect it on a
// scratch canvas so the visible canvas never becomes tainted.
function imageIsSafe(img) {
  try {
    const c = document.createElement("canvas"); c.width = c.height = 1;
    const x = c.getContext("2d"); x.drawImage(img, 0, 0, 1, 1); x.getImageData(0, 0, 1, 1);
    return true;
  } catch (e) { return false; }
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img && img.naturalWidth && imageIsSafe(img) ? img : null);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawCover(ctx, img, W, H, tf) {
  const k = Math.max(W / img.naturalWidth, H / img.naturalHeight) * OVERSCAN * tf.scale;
  const w = img.naturalWidth * k, h = img.naturalHeight * k;
  ctx.drawImage(img, (W - w) / 2 + tf.offsetX, (H - h) / 2 + tf.offsetY, w, h);
}

// Text alpha multiplies the scene's own crossfade alpha, and the previous alpha
// is restored after, so a fading scene fades its words with it.
function textBlock(ctx, lines, x, y, px, weight, color, alpha) {
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha; ctx.fillStyle = color; ctx.font = `${weight} ${px}px ${FONT}`;
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * Math.round(px * 1.18)));
  ctx.globalAlpha = prev;
}

function drawScene(ctx, W, H, scene, tf, assets, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  if (scene.type === "intro") {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, C.card); g.addColorStop(1, C.bg);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const a = tf.textOpacity;
    textBlock(ctx, [String(scene.kicker).toUpperCase()], 64, 820, 40, 700, C.gold, a);
    textBlock(ctx, scene.lines, 64, 920, scene.fontPx, 800, C.text, a);
    textBlock(ctx, [scene.sub], 64, 920 + scene.lines.length * Math.round(scene.fontPx * 1.18) + 30, 36, 500, C.muted, a);
  } else if (scene.type === "photo" || scene.type === "card") {
    const img = scene.type === "photo" ? assets.photos[scene.index] : null;
    if (img) {
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
      drawCover(ctx, img, W, H, tf);
    } else {
      const g = ctx.createLinearGradient(0, 0, W * 0.4, H); g.addColorStop(0, C.card); g.addColorStop(1, C.bg);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      textBlock(ctx, [String(scene.category || "Local pick").toUpperCase()], 64, 800, 38, 700, C.gold, tf.textOpacity);
    }
    // legibility gradient behind the lower third
    const lg = ctx.createLinearGradient(0, H * 0.55, 0, H);
    lg.addColorStop(0, "rgba(13,17,23,0)"); lg.addColorStop(1, "rgba(13,17,23,0.88)");
    ctx.fillStyle = lg; ctx.fillRect(0, H * 0.55, W, H * 0.45);
    const lh = Math.round(scene.fontPx * 1.18);
    const nameY = 1640 + (scene.lines.length > 1 ? 0 : lh * 0.5);
    const label = [scene.stopLabel, scene.dayLabel].filter(Boolean).join("   ");
    textBlock(ctx, [label.toUpperCase()], 64, nameY - 78, 36, 700, C.gold, tf.textOpacity);
    textBlock(ctx, scene.lines, 64, nameY, scene.fontPx, 800, C.text, tf.textOpacity);
  } else {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    const lw = 760, lh = Math.round(lw * (scene.logo.h / scene.logo.w));
    if (assets.logo) ctx.drawImage(assets.logo, (W - lw) / 2, 560, lw, lh);
    ctx.textAlign = "center";
    ctx.globalAlpha = alpha * Math.min(1, tf.textOpacity + 0.0);
    ctx.fillStyle = C.text; ctx.font = `800 52px ${FONT}`;
    ctx.fillText(scene.headline, W / 2, 560 + lh + 130);
    if (scene.credits.length) {
      ctx.fillStyle = C.muted; ctx.font = `500 26px ${FONT}`;
      const maxC = estimateMaxChars(26, W - 128);
      const rows = scene.credits.slice(0, 8).map((c) => wrapLines("Photo " + c, maxC, 1)[0]);
      rows.forEach((r, i) => ctx.fillText(r, W / 2, 1620 + i * 36));
    }
  }
  ctx.restore();
}

function renderFrame(ctx, tl, t, assets) {
  const f = frameAt(tl, t);
  const W = tl.width, H = tl.height;
  drawScene(ctx, W, H, f.scene, f, assets, 1);
  if (f.next) drawScene(ctx, W, H, f.next, f.nextTransform, assets, f.blend);
}

export default function GuideVideoPreview({ slug, title, city, days, stops, onEvent }) {
  const timeline = useMemo(() => buildTimeline({ title, city, days, stops }), [title, city, days, stops]);
  const canvasRef = useRef(null);
  const assetsRef = useRef({ photos: [], logo: null });
  const rafRef = useRef(0);
  const tRef = useRef(0);
  const playingRef = useRef(false);
  const recRef = useRef(null); // { recorder, stream }
  const blobRef = useRef(null); // cached recording { blob, ext, mime }
  const busyRef = useRef(false);
  const emit = useCallback((n, p) => { try { onEvent && onEvent(n, p); } catch (e) {} }, [onEvent]);

  const [playing, setPlaying] = useState(false);
  const [canRecord, setCanRecord] = useState(true);
  const [phase, setPhase] = useState("idle"); // idle | recording
  const [pct, setPct] = useState(0);
  const [note, setNote] = useState("");
  const [ready, setReady] = useState(false); // a recorded file is cached and can be saved or shared at once

  const paint = useCallback((t) => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    renderFrame(ctx, timeline, t, assetsRef.current);
  }, [timeline]);

  const stopLoop = useCallback(() => { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = 0; playingRef.current = false; setPlaying(false); }, []);

  // One real time pass; onDone fires at the end. Used by both preview and recording.
  const runPass = useCallback((onDone) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    playingRef.current = true; setPlaying(true);
    const startAt = performance.now() - tRef.current * 1000;
    const tick = (now) => {
      const t = (now - startAt) / 1000;
      tRef.current = Math.min(t, timeline.durationSec - 1e-3);
      paint(tRef.current);
      if (t >= timeline.durationSec) { rafRef.current = 0; playingRef.current = false; setPlaying(false); tRef.current = 0; if (onDone) onDone(); return; }
      if (recRef.current) setPct(Math.min(99, Math.round((t / timeline.durationSec) * 100)));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [timeline, paint]);

  // Load assets, draw the first frame, autoplay unless reduced motion.
  useEffect(() => {
    let dead = false;
    const supported = !!recorderClass() && !!(canvasRef.current && canvasRef.current.captureStream);
    setCanRecord(supported);
    blobRef.current = null;
    setReady(false);
    tRef.current = 0;
    (async () => {
      const photoScenes = timeline.scenes.filter((s) => s.type === "photo");
      const photos = [];
      await Promise.all([
        ...photoScenes.map(async (s) => { photos[s.index] = isAllowedPhotoUrl(s.photo.url) ? await loadImage(s.photo.url) : null; }),
        loadImage(LOGO_SRC).then((img) => { assetsRef.current.logo = img; }),
      ]);
      if (dead) return;
      assetsRef.current.photos = photos;
      paint(0);
      let reduce = false;
      try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
      if (!reduce) runPass();
    })();
    paint(0);
    return () => {
      dead = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const r = recRef.current;
      if (r) { try { r.recorder.state !== "inactive" && r.recorder.stop(); } catch (e) {} try { r.stream.getTracks().forEach((tr) => tr.stop()); } catch (e) {} recRef.current = null; }
    };
  }, [timeline, paint, runPass]);

  const onPlayPause = () => {
    if (phase === "recording") return;
    if (playingRef.current) { stopLoop(); return; }
    emit("guide_video_play", { slug });
    runPass();
  };

  const record = useCallback(() => {
    if (blobRef.current) return Promise.resolve(blobRef.current);
    return new Promise((resolve, reject) => {
      const canvas = canvasRef.current;
      const mime = pickMime();
      let stream;
      try { stream = canvas.captureStream(30); } catch (e) { reject(e); return; }
      let recorder;
      try { const Rec = recorderClass(); recorder = mime ? new Rec(stream, { mimeType: mime, videoBitsPerSecond: 6000000 }) : new Rec(stream); } catch (e) { reject(e); return; }
      const type = recorder.mimeType || mime || "video/webm";
      const chunks = [];
      recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
      recorder.onstop = () => {
        try { stream.getTracks().forEach((tr) => tr.stop()); } catch (e) {}
        recRef.current = null;
        const baseType = type.split(";")[0];
        const out = { blob: new Blob(chunks, { type: baseType }), ext: baseType.includes("mp4") ? "mp4" : "webm", mime: baseType };
        blobRef.current = out; resolve(out);
      };
      recRef.current = { recorder, stream };
      stopLoop(); tRef.current = 0;
      recorder.start(250);
      runPass(() => { try { recorder.stop(); } catch (e) { reject(e); } });
    });
  }, [runPass, stopLoop]);

  const makeVideo = async () => {
    if (busyRef.current) return null;
    busyRef.current = true; setPhase("recording"); setPct(0); setNote("");
    try {
      const out = await record();
      if (out.ext === "webm") setNote("Your browser saves this as WebM");
      return out;
    } catch (e) {
      // A tainted canvas cannot be captured: tell the viewer, keep the inline preview.
      setNote("This browser could not make a video file");
      setCanRecord(false);
      return null;
    } finally { busyRef.current = false; setPhase("idle"); setPct(0); paint(0); }
  };

  // Making the file takes one real time pass, which outlives the tap's user
  // activation; iOS then refuses share sheets and downloads. So the flow is two
  // taps: "Make video", then "Save video" or "Share video" on the cached file.
  const onMake = async () => {
    emit("guide_video_make", { slug });
    const out = await makeVideo();
    if (out) { setReady(true); setNote(out.ext === "webm" ? "Your video is ready. This browser saves it as WebM." : "Your video is ready."); }
  };

  const onDownload = () => {
    const out = blobRef.current; if (!out) return;
    emit("guide_video_download", { slug });
    const url = URL.createObjectURL(out.blob);
    const a = document.createElement("a"); a.href = url; a.download = `wayfind-${slug || "guide"}.${out.ext}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const onShare = async () => {
    const out = blobRef.current; if (!out) return;
    emit("guide_video_share", { slug });
    const text = `${title || "Trip guide"}${city ? `, ${city}` : ""} on Wayfind`;
    try {
      const file = new File([out.blob], `wayfind-${slug || "guide"}.${out.ext}`, { type: out.mime });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: title || "Wayfind guide", text }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    // No file sharing on this device: offer the page link through Wayfind's
    // one share sheet instead (text, email, copy, or the phone's own sheet).
    if (shareOut({ url: location.href, title: title || "Wayfind guide", text }, () => setNote("Link copied")) === "failed") setNote("Save the video, then share it from your photos.");
  };

  const label = `Preview video of ${title || "a Wayfind guide"}${city ? ` in ${city}` : ""}, ${timeline.scenes.length - 2} stops. Silent.`;
  const btn = { minHeight: 44, minWidth: 44, padding: "0 16px", borderRadius: 12, border: `1px solid ${C.muted}55`, background: C.card, color: C.text, font: `600 15px ${FONT}`, cursor: "pointer" };
  const recording = phase === "recording";

  return (
    <div style={{ width: "100%", maxWidth: 360, boxSizing: "border-box", fontFamily: "var(--wf-sans, system-ui, sans-serif)" }}>
      <div style={{ position: "relative", width: "100%", aspectRatio: "9 / 16", borderRadius: 16, overflow: "hidden", background: C.bg }}>
        <canvas ref={canvasRef} width={1080} height={1920} role="img" aria-label={label}
          style={{ display: "block", width: "100%", height: "100%" }} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10, alignItems: "center" }}>
        <button type="button" onClick={onPlayPause} disabled={recording} aria-label={playing ? "Pause preview" : "Play preview"} style={{ ...btn, background: C.gold, color: C.bg, border: "none" }}>
          {playing ? "Pause" : "Play"}
        </button>
        {canRecord && !ready && (
          <button type="button" onClick={onMake} disabled={recording} style={btn} data-guide-video-make="1">Make video</button>
        )}
        {canRecord && ready && (
          <>
            <button type="button" onClick={onDownload} style={btn}>Save video</button>
            <button type="button" onClick={onShare} style={btn}>Share video</button>
          </>
        )}
      </div>
      <p aria-live="polite" style={{ margin: "8px 0 0", minHeight: 20, color: C.muted, font: `500 13px ${FONT}` }}>
        {recording ? `Making your video… ${pct}%` : note}
      </p>
    </div>
  );
}
