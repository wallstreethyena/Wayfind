"use client";

import { useEffect, useRef } from "react";

// Gentle falling snow, drawn behind the page content (z-index below it, no
// pointer events, hidden from assistive tech). Capped at 36 flakes on a phone
// and 70 on a desktop, paused while the tab is hidden, and with reduced motion
// a single still frame of flakes instead of falling snow. Shared by
// /christmas-in-florida and the site-wide backdrop (owner 2026-11-28: the site
// is red "with the snow like the christmas in florida page"). It only runs
// while the canvas is actually on screen: the site backdrop is display:none on
// pages that own a theme, so a ResizeObserver stops it there (0x0 box) and
// starts it again after a client navigation back to a themed-off page.
// Its own module so the site backdrop can load it lazily (next/dynamic,
// ssr:false) and keep it out of every page's first load JS (check-bundle).
export function ChristmasSnow() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || typeof window === "undefined") return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    const reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    let w = 0, h = 0, raf = 0, last = 0;
    let flakes = [];
    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = w < 720 ? 36 : 70;
      flakes = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h, r: 0.9 + Math.random() * 2.3,
        v: 14 + Math.random() * 26, sw: 8 + Math.random() * 16, ph: Math.random() * 6.28, a: 0.35 + Math.random() * 0.5,
      }));
    };
    const paint = (t) => {
      ctx.clearRect(0, 0, w, h);
      for (const f of flakes) {
        ctx.globalAlpha = f.a;
        ctx.fillStyle = "#FFF8EE";
        ctx.beginPath();
        ctx.arc(f.x + (reduced ? 0 : Math.sin(t / 1800 + f.ph) * f.sw), f.y, f.r, 0, 6.2832);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    const tick = (now) => {
      raf = window.requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;
      for (const f of flakes) {
        f.y += f.v * dt;
        if (f.y > h + 6) { f.y = -6; f.x = Math.random() * w; }
      }
      paint(now);
    };
    const start = () => { if (!raf && !reduced) { last = 0; raf = window.requestAnimationFrame(tick); } };
    const stop = () => { if (raf) { window.cancelAnimationFrame(raf); raf = 0; } };
    const onVisibility = () => (document.hidden || !canvas.getClientRects().length ? stop() : start());
    const onResize = () => { build(); if (reduced) paint(0); };
    const shown = () => canvas.getClientRects().length > 0;
    build();
    if (reduced) paint(0); else if (shown()) start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", onResize);
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
      if (!shown()) { stop(); return; }
      if (reduced) paint(0); else if (!document.hidden) start();
    }) : null;
    if (ro) ro.observe(canvas);
    return () => { stop(); if (ro) ro.disconnect(); document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("resize", onResize); };
  }, []);
  return <canvas ref={ref} className="xm-snow" aria-hidden="true" data-xm-snow="" />;
}
