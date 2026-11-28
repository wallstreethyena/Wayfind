"use client";

import { useEffect, useState } from "react";

// The string lights from /christmas-in-florida, shared with the site backdrop
// so both paint the same garland. CSS lives in lib/christmasBackdrop.js.
// Each bulb hangs at the bottom of a wire dip. A quadratic dip's lowest point
// is (start + 2 * control + end) / 4, so control 14 puts the desktop wire at
// 10px and control 16 puts the phone wire at 10px, right on the bulb caps
// (.xm-sway top 9px + cap 6px). The old 30 / 24 controls put the wire at 18px
// and 14px, through the glass, so the bulbs looked pinned to nothing
// (owner, 2026-11-24: "the light bulbs look off").
export const WIRE_LOW_DESK = (6 + 2 * 14 + 6) / 4;
export const WIRE_LOW_PHONE = (4 + 2 * 16 + 4) / 4;
const BULB_COUNT = 18;
const WIRE_PITCH = 1200 / BULB_COUNT;
const WIRE_PATH = (() => {
  let d = "M0 6";
  for (let i = 0; i < BULB_COUNT; i += 1) {
    d += " Q" + ((i + 0.5) * WIRE_PITCH).toFixed(1) + " 14 " + ((i + 1) * WIRE_PITCH).toFixed(1) + " 6";
  }
  return d;
})();
const PHONE_DIPS = BULB_COUNT / 2;
const PHONE_WIRE_PATH = (() => {
  const pitch = 1200 / PHONE_DIPS;
  let d = "M0 4";
  for (let i = 0; i < PHONE_DIPS; i += 1) d += " Q" + ((i + 0.5) * pitch).toFixed(1) + " 16 " + ((i + 1) * pitch).toFixed(1) + " 4";
  return d;
})();
const BULB_COLORS = [
  ["#FF4458", "#B3111F", "rgba(255,68,88,.75)", "rgba(255,68,88,.32)"],
  ["#3DDC84", "#13803F", "rgba(61,220,132,.7)", "rgba(61,220,132,.3)"],
  ["#FFC94A", "#C98A0B", "rgba(255,201,74,.78)", "rgba(255,201,74,.34)"],
  ["#4DA3FF", "#1456B8", "rgba(77,163,255,.75)", "rgba(77,163,255,.32)"],
  ["#FF7AC8", "#B02C86", "rgba(255,122,200,.75)", "rgba(255,122,200,.32)"],
  ["#FFF1D6", "#D8B27A", "rgba(255,241,214,.7)", "rgba(255,241,214,.28)"],
  ["#FF8A3D", "#C4510A", "rgba(255,138,61,.75)", "rgba(255,138,61,.32)"],
];
const LIGHT_PATTERNS = ["twinkle", "chase", "alt", "chase"];

export function FestivalLights() {
  const [pattern, setPattern] = useState("twinkle");
  useEffect(() => {
    if (typeof window === "undefined" || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) return undefined;
    let n = 0;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      n += 1;
      setPattern(LIGHT_PATTERNS[n % LIGHT_PATTERNS.length]);
    }, 6500);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="xm-lights" aria-hidden="true" data-pattern={pattern}>
      <svg className="xm-wire xm-wire-desk" viewBox="0 0 1200 36" preserveAspectRatio="none">
        <path d={WIRE_PATH} fill="none" stroke="#143B22" strokeWidth="2.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path d={WIRE_PATH} fill="none" stroke="#3E8F5A" strokeWidth="1" strokeDasharray="3 4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <svg className="xm-wire xm-wire-phone" viewBox="0 0 1200 36" preserveAspectRatio="none">
        <path d={PHONE_WIRE_PATH} fill="none" stroke="#143B22" strokeWidth="2.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path d={PHONE_WIRE_PATH} fill="none" stroke="#3E8F5A" strokeWidth="1" strokeDasharray="3 4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {Array.from({ length: BULB_COUNT }, (_, i) => (
        <span
          key={i}
          className="xm-sway"
          style={{
            left: (((i + 0.5) / BULB_COUNT) * 100).toFixed(2) + "%",
            "--lp": (((Math.floor(i / 2) + 0.5) / PHONE_DIPS) * 100).toFixed(2) + "%",
            "--d": "-" + ((i * 1.7) % 9).toFixed(1) + "s",
            "--sw": (3 + ((i * 13) % 12) / 10).toFixed(1) + "s",
          }}
        >
          <span
            className="xm-bulb"
            style={{
              "--i": i,
              "--bc": BULB_COLORS[i % BULB_COLORS.length][0],
              "--bd": BULB_COLORS[i % BULB_COLORS.length][1],
              "--bg-glow": BULB_COLORS[i % BULB_COLORS.length][2],
              "--bg-glow2": BULB_COLORS[i % BULB_COLORS.length][3],
              "--d": "-" + ((i * 1.7) % 9).toFixed(1) + "s",
              "--f": (2.6 + ((i * 37) % 30) / 10).toFixed(1) + "s",
            }}
          />
        </span>
      ))}
      {Array.from({ length: Math.floor(BULB_COUNT / 3) }, (_, k) => (
        <svg key={"bow" + k} className={"xm-bow" + (k % 2 ? " xm-bow-desk" : "")} viewBox="0 0 16 12" style={{ left: (((k * 3 + 2) / BULB_COUNT) * 100).toFixed(2) + "%", "--bp": ((((k * 3 + 2) / 2) / PHONE_DIPS) * 100).toFixed(2) + "%" }}>
          <path d="M8 6 L1.5 1.5 Q0 6 1.5 10.5 Z M8 6 L14.5 1.5 Q16 6 14.5 10.5 Z" fill="#D92C37" />
          <path d="M8 6 L5 11.5 M8 6 L11 11.5" stroke="#B3111F" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="8" cy="6" r="2" fill="#F5C451" />
        </svg>
      ))}
    </div>
  );
}
