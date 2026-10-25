"use client";

import { useEffect, useId, useRef, useState } from "react";

// --wf-sans is Inter. Visible copy comes from the server model.
const CSS = `
.boo-page{background:#0A0A0B;color:#FFFFFF;font-family:var(--wf-sans),sans-serif;padding:12px 12px 120px}
.boo-page,.boo-page button,.boo-page a,.boo-page input{font-family:var(--wf-sans),sans-serif}
.boo-inner{max-width:760px;margin:0 auto}
.boo-top,.boo-actions,.boo-filters,.boo-links,.boo-picks,.boo-chips,.boo-buyrow{display:flex;flex-wrap:wrap;gap:8px}
.boo-top{align-items:center;justify-content:space-between;margin-bottom:10px}
.boo-home,.boo-actions button,.boo-filters button,.boo-picks button,.boo-chips button,.boo-links button,.boo-send,.boo-hide,.boo-show,.boo-open{
  border:1px solid #F97316;background:#121216;color:#FFFFFF;border-radius:999px;padding:8px 12px;font-size:14px;font-weight:750;cursor:pointer;text-decoration:none;min-height:44px;display:inline-flex;align-items:center}
.boo-home.is-fill,.boo-actions button.is-fill,.boo-filters button[aria-pressed="true"],.boo-send,.boo-show{background:#F97316;color:#0A0A0B}
.boo-eyebrow{margin:0 0 6px;color:#F97316;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
.boo-page h1{margin:0 0 8px;font-size:clamp(28px,8vw,40px);font-weight:800;letter-spacing:-.03em;line-height:1.05}
.boo-lede,.boo-note{margin:0;color:#D4D4D4;font-size:15px;line-height:1.45}
.boo-note{margin-top:8px;font-size:13px;color:#FFFFFF}
.boo-stage{display:grid;grid-template-columns:132px 1fr;gap:12px;align-items:stretch;margin-top:14px}
.boo-hero-sprite{background:transparent;min-height:168px}
.boo-copy{display:flex;flex-direction:column;gap:8px;min-width:0}
.boo-badge{margin:0;display:inline-flex;align-items:center;gap:6px;background:#121216;color:#F97316;border:1px solid #F97316;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:800;letter-spacing:.06em}
.boo-bubble{margin:0;background:#121216;border:1px solid #F97316;border-radius:16px;padding:12px;color:#FFFFFF;font-size:15px;font-weight:650;line-height:1.35}
.boo-actions{margin-top:12px}
.boo-who{margin:14px 0 6px;font-size:13px;font-weight:800;color:#F97316;text-transform:uppercase;letter-spacing:.08em}
.boo-picks,.boo-chips,.boo-filters{overflow-x:auto;flex-wrap:nowrap;max-width:100%;padding-bottom:2px}
.boo-picks button,.boo-chips button,.boo-filters button{flex:none}
.boo-filters{margin:14px 0 12px}
.boo-chat{margin-top:10px;background:#121216;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:12px}
.boo-chat form{display:flex;gap:8px;margin-top:8px}
.boo-chat input{flex:1;min-width:0;min-height:44px;border-radius:12px;border:1px solid #F97316;background:#0A0A0B;color:#FFFFFF;padding:8px 10px;font-size:15px}
.boo-reply{margin:8px 0;color:#FFFFFF;font-size:15px;line-height:1.4}
.boo-rec{display:flex;flex-direction:column;gap:8px}
.boo-card{background:#121216;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:14px;margin:0 0 12px;scroll-margin:12px 0 200px}
.boo-card.is-active,.boo-card.is-hot{border-color:#F97316}
.boo-card.is-hot{box-shadow:0 0 0 2px #F97316}
.boo-card h2{margin:0;font-size:20px;font-weight:800;line-height:1.2;letter-spacing:-.02em}
.boo-where{margin:4px 0 0;color:#D4D4D4;font-size:14px;font-weight:650}
.boo-price{margin:10px 0 0;color:#F97316;font-size:22px;font-weight:800}
.boo-when{margin:4px 0 0;color:#FFFFFF;font-size:14px;line-height:1.4}
.boo-tip{margin:10px 0;color:#FFFFFF;font-size:14px;line-height:1.4}
.boo-tip span{display:block;color:#F97316;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:2px}
.boo-buyrow{align-items:stretch}
.boo-buy{flex:1.1;display:flex;align-items:center;justify-content:center;min-height:48px;border-radius:12px;background:#F97316;color:#0A0A0B;font-size:16px;font-weight:800;text-decoration:none;text-align:center;padding:8px}
.boo-nudge{flex:0.9;margin:0;border:1px solid #F97316;border-radius:12px;padding:8px;color:#FFFFFF;font-size:13px;line-height:1.35;background:#0A0A0B}
.boo-via{margin:6px 0 0;color:#D4D4D4;font-size:12px;line-height:1.35}
.boo-links{align-items:center;margin-top:8px}
.boo-links a{display:inline-flex;align-items:center;min-height:44px;color:#FFFFFF;font-size:14px;font-weight:700;text-decoration:underline;text-underline-offset:3px}
.boo-bottom-home{margin-top:8px}
.boo-fly{position:fixed;z-index:40;left:0;top:0;width:min(280px,calc(100vw - 16px));pointer-events:none;transform:translate3d(12px,calc(100vh - 220px),0)}
.boo-fly.is-chat{width:min(320px,calc(100vw - 16px))}
.boo-fly>*{pointer-events:auto}
.boo-fly.is-flying .boo-drag{filter:drop-shadow(-14px 8px 0 rgba(249,115,22,.55)) drop-shadow(-28px 16px 0 rgba(249,115,22,.28))}
.boo-fly-col{display:flex;align-items:flex-end;gap:8px}
.boo-drag{width:108px;flex:none;padding:0;border:0;background:transparent;cursor:grab;touch-action:none}
.boo-drag:active{cursor:grabbing}
.boo-fly-copy{display:flex;flex-direction:column;gap:6px;min-width:0;flex:1}
.boo-float-bubble{border:1px solid #F97316;background:#121216;color:#FFFFFF;border-radius:16px;padding:10px 12px;text-align:left;font-size:14px;font-weight:650;line-height:1.35;cursor:pointer}
.boo-hide,.boo-open{align-self:flex-start;min-height:36px;padding:4px 10px;font-size:12px}
.boo-show{position:fixed;left:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:40}
.boo-fly-chat{margin-top:6px;max-height:42vh;overflow:auto}
.boo-sprite{width:100%;height:auto;display:block;overflow:visible;animation:boo-bob 2.6s ease-in-out infinite}
.boo-hem{transform-box:fill-box;transform-origin:center;animation:boo-ripple 1.5s ease-in-out infinite}
.boo-flag{transform-box:fill-box;transform-origin:0% 100%;animation:boo-wave 1s ease-in-out infinite}
.boo-fly.is-flying .boo-sprite{animation-duration:.7s}
@keyframes boo-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
@keyframes boo-ripple{0%,100%{transform:translateY(0)}50%{transform:translateY(3px)}}
@keyframes boo-wave{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(10deg)}}
@media(prefers-reduced-motion:reduce){
  .boo-sprite,.boo-hem,.boo-flag{animation:none}
}
@media(max-width:520px){
  .boo-page{padding-bottom:240px}
  .boo-fly{width:148px}
  .boo-fly.is-chat{width:min(320px,calc(100vw - 16px))}
  .boo-fly-col{flex-direction:column;align-items:stretch}
  .boo-fly .boo-badge{display:none}
  .boo-drag{width:96px}
  .boo-float-bubble{font-size:12px;max-height:74px;overflow:hidden}
}
@media(min-width:800px){
  .boo-page{padding:28px 24px 140px}
  .boo-stage{grid-template-columns:200px 1fr}
}
`;

function BooSprite({ label }) {
  const raw = useId().replace(/:/g, "");
  const lens = "boo-lens-" + raw;
  return (
    <svg className="boo-sprite" viewBox="0 0 220 250" role={label ? "img" : "presentation"} aria-label={label || undefined} aria-hidden={label ? undefined : true}>
      <defs>
        <linearGradient id={lens} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1C1917" />
          <stop offset="38%" stopColor="#F97316" />
          <stop offset="72%" stopColor="#FDBA74" />
          <stop offset="100%" stopColor="#7C2D12" />
        </linearGradient>
      </defs>
      <g className="boo-flag">
        <path d="M28 96 V154" stroke="#F97316" strokeWidth="4" strokeLinecap="round" />
        <path d="M28 78 L78 96 L28 114 Z" fill="#F97316" />
        <text x="34" y="100" fill="#0A0A0B" fontSize="11" fontWeight="800">TOUR</text>
      </g>
      <path fill="#FFFFFF" d="M62 96 C62 42 158 42 158 96 L158 168 C166 180 158 196 146 188 C134 180 128 202 114 192 C100 182 94 206 80 194 C66 182 58 198 54 184 C48 168 62 168 62 168 Z" />
      <path className="boo-hem" fill="#FFFFFF" d="M62 168 C70 184 78 200 92 188 C106 176 112 204 126 190 C140 176 148 198 158 182 L158 160 L62 160 Z" />
      <path d="M68 150 C42 136 30 112 46 98" fill="none" stroke="#FFFFFF" strokeWidth="14" strokeLinecap="round" />
      <path d="M154 152 C184 140 198 122 188 104" fill="none" stroke="#FFFFFF" strokeWidth="14" strokeLinecap="round" />
      <text x="190" y="100" fill="#F97316" fontSize="14" fontWeight="800">GO</text>
      <ellipse cx="82" cy="132" rx="11" ry="6" fill="#FB7185" opacity="0.9" />
      <ellipse cx="140" cy="132" rx="11" ry="6" fill="#FB7185" opacity="0.9" />
      <path d="M92 142 Q110 162 130 142" fill="none" stroke="#0A0A0B" strokeWidth="4.5" strokeLinecap="round" />
      <g transform="rotate(-8 110 108)">
        <rect x="64" y="92" width="44" height="30" rx="10" fill={"url(#" + lens + ")"} stroke="#0A0A0B" strokeWidth="5" />
        <rect x="114" y="92" width="44" height="30" rx="10" fill={"url(#" + lens + ")"} stroke="#0A0A0B" strokeWidth="5" />
        <path d="M108 106 H114" stroke="#0A0A0B" strokeWidth="5" />
        <path d="M128 82 Q142 70 158 80" fill="none" stroke="#0A0A0B" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="150" cy="70" r="2.4" fill="#FFFFFF" />
      </g>
    </svg>
  );
}

function cleanReply(text) {
  return String(text || "").replace(/[-\u2013\u2014]/g, " ").replace(/\s{2,}/g, " ").trim();
}

export default function BoHalloweenHaunt({ model, share = null }) {
  const { chrome, lines, filters, haunts, picks, prompts } = model;
  const [filter, setFilter] = useState("all");
  const [bubble, setBubble] = useState(lines[0]);
  const [gagIndex, setGagIndex] = useState(0);
  const [activeId, setActiveId] = useState(null);
  const [hotId, setHotId] = useState(null);
  const [spinNonce, setSpinNonce] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [quipAt, setQuipAt] = useState({});
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatReply, setChatReply] = useState("");
  const [chatIds, setChatIds] = useState([]);
  const [flying, setFlying] = useState(false);
  const holdUntil = useRef(0);
  const lastSeen = useRef(null);
  const flyRef = useRef(null);
  const sideRef = useRef("left");
  const activeRef = useRef(null);
  const dragHold = useRef(false);
  const poseRef = useRef(null);

  useEffect(() => { activeRef.current = activeId; }, [activeId]);

  const speak = (text, holdMs) => {
    holdUntil.current = Date.now() + holdMs;
    setBubble(text);
  };

  const shown = filter === "all" ? haunts : haunts.filter((row) => row.filters.includes(filter));

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const nodes = document.querySelectorAll("[data-haunt-id]");
    const io = new IntersectionObserver((entries) => {
      const best = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!best) return;
      const id = best.target.getAttribute("data-haunt-id");
      if (!id || lastSeen.current === id) return;
      lastSeen.current = id;
      setActiveId(id);
      const row = haunts.find((item) => item.id === id);
      if (row && Date.now() >= holdUntil.current) setBubble(row.tip);
    }, { threshold: [0.55, 0.75] });
    nodes.forEach((node) => io.observe(node));
    return () => io.disconnect();
  }, [filter, haunts]);

  useEffect(() => {
    if (!hotId) return undefined;
    const node = document.getElementById("haunt-" + hotId);
    if (node && typeof node.scrollIntoView === "function") node.scrollIntoView({ behavior: "smooth", block: "center" });
    return undefined;
  }, [hotId, spinNonce, filter]);

  useEffect(() => {
    const node = flyRef.current;
    if (!node || dismissed) return undefined;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pose = { x: 12, y: Math.max(80, window.innerHeight - 230), vx: 0, vy: 0, targetX: 12, targetY: Math.max(80, window.innerHeight - 230) };
    poseRef.current = pose;
    let wasFlying = false;
    let landedAt = 0;
    let stopped = false;
    let raf = 0;
    const paint = (isFly, tilt) => {
      node.style.transform = "translate3d(" + pose.x + "px," + pose.y + "px,0) rotate(" + tilt + "deg)";
    };
    const place = () => {
      if (dragHold.current) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const chat = node.classList.contains("is-chat");
      const narrow = w < 520;
      const width = chat ? Math.min(320, w - 16) : (narrow ? 148 : Math.min(280, w - 16));
      pose.targetX = sideRef.current === "right" ? Math.max(8, w - width - 8) : 8;
      let y = h * 0.58;
      const cards = document.querySelectorAll("[data-haunt-id]");
      for (const card of cards) {
        const rect = card.getBoundingClientRect();
        if (rect.top < h * 0.7 && rect.bottom > 90) {
          y = Math.min(h - 200, Math.max(72, rect.top + 8));
          break;
        }
      }
      pose.targetY = y;
    };
    const step = () => {
      if (stopped) return;
      place();
      if (reduce) {
        pose.x = pose.targetX;
        pose.y = pose.targetY;
        pose.vx = 0;
        pose.vy = 0;
        paint(0, 0);
        if (wasFlying) setFlying(false);
        wasFlying = false;
        return;
      }
      pose.vx = (pose.vx + (pose.targetX - pose.x) * 0.05) * 0.76;
      pose.vy = (pose.vy + (pose.targetY - pose.y) * 0.05) * 0.76;
      pose.x += pose.vx;
      pose.y += pose.vy;
      const speed = Math.hypot(pose.vx, pose.vy);
      const isFly = speed > 0.85;
      const tilt = isFly ? Math.max(-14, Math.min(14, pose.vx * 0.28 + pose.vy * 0.06)) : 0;
      paint(isFly, tilt);
      if (isFly !== wasFlying) setFlying(isFly);
      if (wasFlying && !isFly && Date.now() > landedAt && Date.now() >= holdUntil.current) {
        landedAt = Date.now() + 2200;
        const row = haunts.find((item) => item.id === activeRef.current);
        if (row) setBubble(row.nudge || row.tip);
      }
      wasFlying = isFly;
      raf = requestAnimationFrame(step);
    };
    place();
    step();
    const onScroll = () => { if (reduce) step(); };
    window.addEventListener("scroll", onScroll, { passive: true });
    if (!reduce) raf = requestAnimationFrame(step);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, [dismissed, haunts]);

  const focusHaunt = (row) => {
    setActiveId(row.id);
    if (Date.now() >= holdUntil.current) setBubble(row.tip);
  };

  const nextGag = () => {
    const next = (gagIndex + 1) % lines.length;
    setGagIndex(next);
    speak(lines[next], 8000);
  };

  const roastPrice = () => {
    const pool = haunts.filter((row) => row.roast);
    const current = pool.find((row) => row.id === activeId);
    const pick = current || pool[Math.floor(Math.random() * pool.length)];
    setActiveId(pick.id);
    setDismissed(false);
    speak(pick.roast, 9000);
  };

  const spinDeal = () => {
    const pool = haunts.filter((row) => row.cta.kind === "affiliate");
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setFilter("all");
    setActiveId(pick.id);
    setHotId(pick.id);
    setSpinNonce((n) => n + 1);
    setDismissed(false);
    speak(pick.roast, 9000);
  };

  const pickScare = (item) => {
    const row = haunts.find((haunt) => haunt.id === item.hauntId);
    if (!row) return;
    setFilter("all");
    setActiveId(row.id);
    setHotId(row.id);
    setSpinNonce((n) => n + 1);
    setDismissed(false);
    speak(item.pitch, 10000);
  };

  const askBoo = (row) => {
    const at = quipAt[row.id] || 0;
    setQuipAt({ ...quipAt, [row.id]: at + 1 });
    setActiveId(row.id);
    setHotId(row.id);
    setDismissed(false);
    speak(row.quips[at % row.quips.length], 10000);
  };

  const showRecommendation = (data) => {
    const reply = cleanReply(data && data.reply) || lines[1];
    const ids = (data && data.recommendedIds || []).filter((id) => haunts.some((row) => row.id === id));
    setChatReply(reply);
    setChatIds(ids.length ? ids : ["howlOrlando"]);
    setChatOpen(true);
    const first = haunts.find((row) => row.id === (ids[0] || "howlOrlando"));
    if (first) {
      setFilter("all");
      setActiveId(first.id);
      setHotId(first.id);
      setSpinNonce((n) => n + 1);
    }
    speak(reply, 12000);
  };

  const askLive = async (text) => {
    const message = String(text || "").trim();
    if (!message || pending) return;
    setDraft("");
    setPending(true);
    setChatOpen(true);
    setDismissed(false);
    try {
      const res = await fetch("/api/bo-haunt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      showRecommendation(data);
    } catch {
      showRecommendation({ reply: lines[1], recommendedIds: ["howlOrlando"] });
    } finally {
      setPending(false);
    }
  };

  const onDragDown = (event) => {
    const pose = poseRef.current;
    if (!pose) return;
    dragHold.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    poseRef.current.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, ox: pose.x, oy: pose.y, moved: false };
  };
  const onDragMove = (event) => {
    const pose = poseRef.current;
    const drag = pose && pose.drag;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 8) drag.moved = true;
    pose.x = drag.ox + dx;
    pose.y = drag.oy + dy;
    pose.targetX = pose.x;
    pose.targetY = pose.y;
    pose.vx = 0;
    pose.vy = 0;
  };
  const onDragUp = (event) => {
    const pose = poseRef.current;
    const drag = pose && pose.drag;
    dragHold.current = false;
    if (!pose) return;
    pose.drag = null;
    if (!drag || drag.id !== event.pointerId) return;
    if (!drag.moved) sideRef.current = sideRef.current === "left" ? "right" : "left";
    else sideRef.current = event.clientX > window.innerWidth / 2 ? "right" : "left";
  };

  const chatBox = (compact) => (
    <div className={"boo-chat" + (compact ? " boo-fly-chat" : "")} data-boo-chat={compact ? "fly" : "hero"}>
      <p className="boo-badge">{chrome.vip}</p>
      <p className="boo-who">{chrome.chatTitle}</p>
      {pending ? <p className="boo-reply">{chrome.thinking}</p> : null}
      {chatReply ? <p className="boo-reply" data-boo-reply="">{chatReply}</p> : null}
      {chatIds.length ? (
        <div className="boo-rec">
          {chatIds.map((id) => {
            const row = haunts.find((item) => item.id === id);
            if (!row) return null;
            return <a key={id} className="boo-buy" href={row.cta.href} rel={row.cta.rel}>{row.cta.label}</a>;
          })}
        </div>
      ) : null}
      <div className="boo-chips" role="group" aria-label={chrome.chatTitle}>
        {prompts.map((prompt) => (
          <button type="button" key={prompt} onClick={() => askLive(prompt)}>{prompt}</button>
        ))}
      </div>
      <form onSubmit={(event) => { event.preventDefault(); askLive(draft); }}>
        <input
          aria-label={chrome.askPlaceholder}
          placeholder={chrome.askPlaceholder}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button className="boo-send" type="submit">{chrome.send}</button>
      </form>
    </div>
  );

  return (
    <section className="boo-page" aria-labelledby="boo-title">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="boo-inner">
        <div className="boo-top">
          <a className="boo-home" href="/">{chrome.home}</a>
          {share}
        </div>
        <div id="boo-hero">
          <p className="boo-eyebrow">{chrome.vip}</p>
          <h1 id="boo-title">{chrome.title}</h1>
          <p className="boo-lede">{chrome.host}. {chrome.lede}</p>
          <p className="boo-note">{chrome.disclosure}</p>
          <p className="boo-note">{chrome.merit}</p>
          <div className="boo-stage">
            <div className="boo-hero-sprite">
              <BooSprite label={chrome.videoLabel} />
            </div>
            <div className="boo-copy">
              <p className="boo-badge">{chrome.vip}</p>
              <p className="boo-bubble" data-boo-bubble="hero">{bubble}</p>
            </div>
          </div>
          <div className="boo-actions">
            <button type="button" onClick={nextGag}>{chrome.nextGag}</button>
            <button type="button" onClick={roastPrice}>{chrome.roast}</button>
            <button type="button" onClick={spinDeal}>{chrome.spin}</button>
            <button type="button" className="is-fill" onClick={() => { setDismissed(false); const vault = document.getElementById("boo-vault"); if (vault && vault.scrollIntoView) vault.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{chrome.hauntScroll}</button>
          </div>
          <p className="boo-who">{chrome.pick}</p>
          <p className="boo-lede">{chrome.who}</p>
          <div className="boo-picks" role="toolbar" aria-label={chrome.pick}>
            {picks.map((item) => (
              <button type="button" key={item.id} onClick={() => pickScare(item)}>{item.label}</button>
            ))}
          </div>
          {chatBox(false)}
        </div>

        <div id="boo-vault" data-haunt-vault="">
          <div className="boo-filters" role="toolbar" aria-label={chrome.eyebrow}>
            {filters.map((item) => (
              <button type="button" key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>
            ))}
          </div>
          {shown.length ? shown.map((row) => (
            <article
              key={row.id}
              id={"haunt-" + row.id}
              data-haunt-id={row.id}
              className={"boo-card" + (activeId === row.id ? " is-active" : "") + (hotId === row.id ? " is-hot" : "")}
              onMouseEnter={() => focusHaunt(row)}
              onFocus={() => focusHaunt(row)}
              onClick={() => focusHaunt(row)}
            >
              <h2>{row.name}</h2>
              <p className="boo-where">{row.where}</p>
              <p className="boo-price">{row.priceLabel}</p>
              <p className="boo-when">{row.timing}</p>
              <p className="boo-tip"><span>{chrome.boSays}</span>{row.tip}</p>
              <div className="boo-buyrow">
                <a className="boo-buy" href={row.cta.href} rel={row.cta.rel}>{row.cta.label}</a>
                <p className="boo-nudge">{row.nudge}</p>
              </div>
              <p className="boo-via">{row.cta.via}</p>
              <div className="boo-links">
                <a href={row.eventHref}>{chrome.eventPage}</a>
                <button type="button" onClick={() => askBoo(row)}>{chrome.ask}</button>
              </div>
            </article>
          )) : <p>{chrome.empty}</p>}
          <a className="boo-home is-fill boo-bottom-home" href="/">{chrome.homeBottom}</a>
        </div>
      </div>
      {dismissed ? (
        <button type="button" className="boo-show" onClick={() => setDismissed(false)}>{chrome.show}</button>
      ) : (
        <aside ref={flyRef} className={"boo-fly" + (flying ? " is-flying" : "") + (chatOpen ? " is-chat" : "")} data-boo-fly="" aria-label={chrome.floatLabel}>
          <div className="boo-fly-col">
            <button type="button" className="boo-drag" aria-label={chrome.videoLabel} onPointerDown={onDragDown} onPointerMove={onDragMove} onPointerUp={onDragUp}>
              <BooSprite label="" />
            </button>
            <div className="boo-fly-copy">
              <p className="boo-badge">{chrome.vip}</p>
              <button type="button" className="boo-float-bubble" data-boo-bubble="float" onClick={nextGag}>{bubble}</button>
              <button type="button" className="boo-open" onClick={() => setChatOpen((open) => !open)}>{chrome.openChat}</button>
              <button type="button" className="boo-hide" onClick={() => setDismissed(true)}>{chrome.hide}</button>
            </div>
          </div>
          {chatOpen ? chatBox(true) : null}
        </aside>
      )}
    </section>
  );
}
