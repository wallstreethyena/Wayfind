"use client";

import { useEffect, useRef, useState } from "react";

// Little elves that show up now and then on /christmas-in-florida (owner
// 2026-11-11: "add elves at the page randomly being cute"). One elf at a time,
// never more: it either hangs from the string lights and swings, or peeks in
// from the side of the screen, blinks and waves, then leaves. Original art (no
// known character). Decorative only: aria-hidden, no pointer events, no text,
// and it never parks in front of words (a side peek first probes the spot and
// skips anything with text or a data-boo-clear block, the same rule Santa uses).
// Nothing renders on the server, so there is no hydration mismatch, and with
// reduced motion there are no elves at all.

const SUITS = [
  { suit: "#D92C37", trim: "#1E9A4F", hat: "#1E9A4F" },
  { suit: "#1E9A4F", trim: "#D92C37", hat: "#D92C37" },
];
// The phone wire peaks at k/9 of the width (every one is also a desktop peak).
// Peaks 1, 4 and 7 carry bows, so an elf only grabs a free peak.
const HANG_PEAKS = [2, 3, 5, 6, 8];
const HANG_MS = 6200;
const PEEK_MS = 5200;
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const between = (a, b) => a + Math.random() * (b - a);

const CSS = `
.xm-elf-wire{position:absolute;left:0;right:0;top:0;height:48px;pointer-events:none;z-index:31;overflow:hidden}
.xm-elf-hang{position:absolute;top:2px;width:30px;height:46px;margin-left:-15px;transform-origin:50% 0;animation:xm-elf-hang ${HANG_MS}ms ease-in-out both}
.xm-elf-peek{position:fixed;width:64px;height:76px;pointer-events:none;z-index:45}
.xm-elf-peek.is-left{left:0;animation:xm-elf-peek-l ${PEEK_MS}ms cubic-bezier(.3,.7,.3,1) both}
.xm-elf-peek.is-right{right:0;animation:xm-elf-peek-r ${PEEK_MS}ms cubic-bezier(.3,.7,.3,1) both}
.xm-elf-peek.is-right svg{transform:scaleX(-1)}
.xm-elf-hang svg,.xm-elf-peek svg{display:block;width:100%;height:100%;overflow:visible;filter:drop-shadow(0 3px 5px rgba(20,0,6,.45))}
.xm-elf-eyes{transform-box:fill-box;transform-origin:center;animation:xm-elf-blink 2.6s ease-in-out .9s infinite}
.xm-elf-wave{transform-box:fill-box;transform-origin:20% 90%;animation:xm-elf-wave .5s ease-in-out .9s 6 alternate}
.xm-elf-kick{transform-box:fill-box;transform-origin:50% 0;animation:xm-elf-kick .45s ease-in-out infinite alternate}
.xm-elf-kick.is-b{animation-delay:-.45s}
.xm-elf-bell{transform-box:fill-box;transform-origin:50% 0;animation:xm-elf-bell .6s ease-in-out infinite alternate}
@keyframes xm-elf-hang{
  0%{transform:translateY(-110%) rotate(0);opacity:0}
  10%{transform:translateY(6%) rotate(0);opacity:1}
  16%{transform:translateY(-3%) rotate(0)}
  22%{transform:translateY(0) rotate(9deg)}
  34%{transform:translateY(0) rotate(-9deg)}
  46%{transform:translateY(0) rotate(7deg)}
  58%{transform:translateY(0) rotate(-6deg)}
  70%{transform:translateY(0) rotate(3deg)}
  80%{transform:translateY(0) rotate(0)}
  92%{transform:translateY(-60%) rotate(0);opacity:1}
  100%{transform:translateY(-115%) rotate(0);opacity:0}
}
@keyframes xm-elf-peek-l{0%{transform:translateX(-100%)}14%,82%{transform:translateX(-42%)}20%{transform:translateX(-46%)}100%{transform:translateX(-100%)}}
@keyframes xm-elf-peek-r{0%{transform:translateX(100%)}14%,82%{transform:translateX(42%)}20%{transform:translateX(46%)}100%{transform:translateX(100%)}}
@keyframes xm-elf-blink{0%,88%,100%{transform:scaleY(1)}93%{transform:scaleY(.1)}}
@keyframes xm-elf-wave{from{transform:rotate(-16deg)}to{transform:rotate(18deg)}}
@keyframes xm-elf-kick{from{transform:rotate(-14deg)}to{transform:rotate(14deg)}}
@keyframes xm-elf-bell{from{transform:rotate(-12deg)}to{transform:rotate(12deg)}}
@media(prefers-reduced-motion:reduce){.xm-elf-wire,.xm-elf-peek{display:none}}
`;

// Head, hat and face, shared by both poses. (cx, cy) is the face center.
function ElfHead({ cx, cy, look }) {
  const r = 14;
  return <g>
    <path d={`M${cx - r + 1} ${cy - 3} L${cx - r - 8} ${cy - 9} L${cx - r + 2} ${cy + 5} Z`} fill="#F4C3A0" />
    <path d={`M${cx + r - 1} ${cy - 3} L${cx + r + 8} ${cy - 9} L${cx + r - 2} ${cy + 5} Z`} fill="#F4C3A0" />
    <circle cx={cx} cy={cy} r={r} fill="#F9D3B4" />
    <circle cx={cx - 8} cy={cy + 4} r="3" fill="#F28B8B" opacity=".75" />
    <circle cx={cx + 8} cy={cy + 4} r="3" fill="#F28B8B" opacity=".75" />
    <g className="xm-elf-eyes">
      <ellipse cx={cx - 5} cy={cy - 1} rx="1.9" ry="2.4" fill="#2A1610" />
      <ellipse cx={cx + 5} cy={cy - 1} rx="1.9" ry="2.4" fill="#2A1610" />
      <circle cx={cx - 4.4} cy={cy - 1.9} r=".7" fill="#fff" />
      <circle cx={cx + 5.6} cy={cy - 1.9} r=".7" fill="#fff" />
    </g>
    <circle cx={cx} cy={cy + 3} r="1.7" fill="#EFA585" />
    <path d={`M${cx - 4.5} ${cy + 6.5} Q${cx} ${cy + 10.5} ${cx + 4.5} ${cy + 6.5}`} stroke="#8A2C2C" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    <path d={`M${cx - 15} ${cy - 8} Q${cx - 8} ${cy - 30} ${cx + 10} ${cy - 33} Q${cx + 20} ${cy - 34} ${cx + 19} ${cy - 25} Q${cx + 13} ${cy - 27} ${cx + 10} ${cy - 23} Q${cx + 14} ${cy - 16} ${cx + 15} ${cy - 8} Z`} fill={look.hat} />
    <rect x={cx - 17} y={cy - 12} width="34" height="7" rx="3.5" fill="#FFF6F0" />
    <g className="xm-elf-bell"><circle cx={cx + 19} cy={cy - 23} r="3.4" fill="#F5C451" /><circle cx={cx + 18} cy={cy - 24} r="1" fill="#FFF3C4" /></g>
  </g>;
}

function HangingElf({ look }) {
  return <svg viewBox="0 -4 48 76" aria-hidden="true" focusable="false">
    <path d="M14 50 Q6 28 19 0" stroke={look.suit} strokeWidth="5" fill="none" strokeLinecap="round" />
    <path d="M34 50 Q42 28 29 0" stroke={look.suit} strokeWidth="5" fill="none" strokeLinecap="round" />
    <circle cx="19" cy="-0.5" r="3.4" fill="#F9D3B4" /><circle cx="29" cy="-0.5" r="3.4" fill="#F9D3B4" />
    <g className="xm-elf-kick"><path d="M20 62 L19 70" stroke={look.trim} strokeWidth="4" strokeLinecap="round" /><path d="M19 70 q-6 1 -6 -3" stroke="#3B1D12" strokeWidth="3.4" fill="none" strokeLinecap="round" /></g>
    <g className="xm-elf-kick is-b"><path d="M28 62 L29 70" stroke={look.trim} strokeWidth="4" strokeLinecap="round" /><path d="M29 70 q6 1 6 -3" stroke="#3B1D12" strokeWidth="3.4" fill="none" strokeLinecap="round" /></g>
    <path d="M13 63 Q12 48 24 46 Q36 48 35 63 Z" fill={look.suit} />
    <path d="M15 48 l3 3.5 l3 -3.5 l3 3.5 l3 -3.5 l3 3.5 l3 -3.5" stroke={look.trim} strokeWidth="2.4" fill="none" strokeLinejoin="round" />
    <rect x="13" y="56" width="22" height="3" fill="#2A1610" /><rect x="22" y="55.5" width="4" height="4" rx="1" fill="#F5C451" />
    <ElfHead cx={24} cy={33} look={look} />
  </svg>;
}

function PeekingElf({ look }) {
  return <svg viewBox="0 0 64 76" aria-hidden="true" focusable="false">
    <path d="M22 76 Q22 60 36 58 Q50 60 50 76 Z" fill={look.suit} />
    <path d="M25 62 l3 3.5 l3 -3.5 l3 3.5 l3 -3.5 l3 3.5 l3 -3.5 l3 3.5" stroke={look.trim} strokeWidth="2.4" fill="none" strokeLinejoin="round" />
    <ElfHead cx={36} cy={44} look={look} />
    <g className="xm-elf-wave">
      <path d="M50 66 Q57 58 57 48" stroke={look.suit} strokeWidth="5" fill="none" strokeLinecap="round" />
      <circle cx="57" cy="45" r="4.2" fill="#F9D3B4" />
      <path d="M54.5 41.5 v-3 M57 41 v-3.6 M59.5 41.5 v-3" stroke="#F9D3B4" strokeWidth="2" strokeLinecap="round" />
    </g>
  </svg>;
}

// True when a side peek at this height would cover words, a button, a
// data-boo-clear block, the Santa dock or an open dialog.
function coversText(side, top) {
  if (typeof document === "undefined" || !document.elementsFromPoint) return true;
  const w = window.innerWidth;
  for (const dy of [8, 30, 56]) {
    for (const dx of [4, 16, 30]) {
      const x = side === "left" ? dx : w - dx;
      const el = document.elementFromPoint(x, top + dy);
      if (!el) continue;
      if (el.closest("[data-boo-clear],button,a,input,select,label,[role=dialog],h1,h2,h3,p")) return true;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (own) return true;
    }
  }
  return false;
}

export default function ChristmasElves() {
  const [elf, setElf] = useState(null);
  const n = useRef(0);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    let timer = 0;
    const later = (ms) => { timer = window.setTimeout(run, ms); };
    function run() {
      if (document.hidden || document.querySelector("[role=dialog]")) return later(4000);
      n.current += 1;
      const look = pick(SUITS);
      const band = document.querySelector(".xm-lights");
      const atTop = !!band && band.getBoundingClientRect().bottom > 20;
      // Near the top, the wire is on screen: mostly hang there. Further down,
      // peek in from a side at a spot with no words.
      if (atTop && Math.random() < 0.6) {
        setElf({ key: n.current, kind: "hang", look, left: (pick(HANG_PEAKS) / 9) * 100 });
        window.setTimeout(() => setElf(null), HANG_MS);
        return later(HANG_MS + between(7000, 14000));
      }
      const side = Math.random() < 0.5 ? "left" : "right";
      const h = window.innerHeight;
      for (let tries = 0; tries < 10; tries += 1) {
        const top = Math.round(between(Math.max(90, h * 0.18), h - 76 - 140));
        if (top > 0 && !coversText(side, top)) {
          setElf({ key: n.current, kind: "peek", look, side, top });
          window.setTimeout(() => setElf(null), PEEK_MS);
          return later(PEEK_MS + between(7000, 14000));
        }
      }
      return later(5000);
    }
    later(between(2500, 4500));
    return () => window.clearTimeout(timer);
  }, []);
  return <>
    <style dangerouslySetInnerHTML={{ __html: CSS }} />
    {elf && elf.kind === "hang" ? <div className="xm-elf-wire" aria-hidden="true" data-xm-elf="hang">
      <span key={elf.key} className="xm-elf-hang" style={{ left: elf.left.toFixed(2) + "%" }}><HangingElf look={elf.look} /></span>
    </div> : null}
    {elf && elf.kind === "peek" ? <span key={elf.key} className={"xm-elf-peek is-" + elf.side} style={{ top: elf.top }} aria-hidden="true" data-xm-elf="peek"><PeekingElf look={elf.look} /></span> : null}
  </>;
}
