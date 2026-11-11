"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

// One Christmas control, using the page's burgundy, cream and gold palette.
// Location is an explicit choice; opening the page never replaces Tickets.
const SORTS = [["tickets", "Tickets first"], ["near", "Closest first"]];
const CSS = `
.xm-filter-trigger{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:48px;padding:11px 19px;border:1px solid #E8B48A;border-radius:999px;background:linear-gradient(180deg,#FFE9C8,#E8C395);color:#3D0914;font:inherit;font-size:15px;font-weight:800;cursor:pointer;box-shadow:0 3px 12px #18020826;white-space:nowrap}
.xm-filter-trigger svg{flex:none}.xm-filter-caret{font-size:12px;opacity:.65}.xm-filter-badge{display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 4px;border-radius:999px;background:#630F22;color:#FFF7ED;font-size:11px}
.xm-filter-trigger:focus-visible,.xm-menu button:focus-visible,.xm-menu select:focus-visible{outline:2px solid #FFE9C8;outline-offset:3px}
.xm-menu-overlay{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;padding:24px;background:#120207b8;backdrop-filter:blur(7px)}
.xm-menu{box-sizing:border-box;display:flex;flex-direction:column;width:min(100%,520px);max-height:min(85dvh,760px);border:1px solid #E8B48A66;border-radius:24px;background:linear-gradient(160deg,#3E0C19,#230710 75%);color:#FFF7ED;box-shadow:0 24px 90px #0008;font-family:inherit;overflow:hidden}
.xm-menu-head{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:24px 24px 19px;border-bottom:1px solid #E8B48A26}.xm-menu-kicker{display:block;margin:0 0 6px;color:#E8B48A;font-size:10px;font-weight:750;letter-spacing:2px;text-transform:uppercase}.xm-menu h2{margin:0;color:#FFF7ED;font-family:Georgia,serif;font-size:25px;font-weight:500;line-height:1.2;letter-spacing:-.5px}
.xm-menu-close{display:grid;place-items:center;flex:none;width:44px;height:44px;border:1px solid #E8B48A40;border-radius:50%;background:transparent;color:#FFE9C8;font-size:24px;cursor:pointer}
.xm-menu-body{overflow-y:auto;overscroll-behavior:contain;padding:22px 24px;min-height:0}.xm-menu-group{margin:0 0 24px}.xm-menu-group:last-child{margin-bottom:0}.xm-menu-label{display:block;margin:0 0 10px;color:#E8B48A;font-size:11px;font-weight:750;letter-spacing:1.3px;text-transform:uppercase}.xm-menu-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.xm-menu-choice{min-width:0;min-height:46px;padding:11px 12px;border:1px solid #E8B48A35;border-radius:12px;background:#1802083b;color:#E5D0C6;font:inherit;font-size:13px;line-height:1.35;text-align:left;cursor:pointer;transition:background .15s,border-color .15s}.xm-menu-choice[aria-pressed="true"]{border-color:#E8B48A;background:#E8B48A20;color:#FFF7ED;font-weight:750}.xm-menu-choice:hover{border-color:#E8B48A99}.xm-menu-hint{margin:9px 0 0;color:#C9B8B0;font-size:12px;line-height:1.5}
.xm-menu-dates{display:flex;flex-wrap:wrap;gap:8px}.xm-menu-dates .xm-menu-choice{text-align:center;flex:1 0 auto;padding:10px 13px}
.xm-menu-select{box-sizing:border-box;min-width:0;width:100%;min-height:48px;padding:10px 12px;border:1px solid #E8B48A55;border-radius:12px;background:#2A0A12;color:#FFF7ED;font:inherit;font-size:14px}.xm-menu-foot{display:flex;align-items:center;gap:16px;padding:16px 24px max(16px,env(safe-area-inset-bottom));border-top:1px solid #E8B48A26;background:#230710}.xm-menu-reset{min-height:44px;padding:8px 4px;border:0;background:transparent;color:#E8B48A;font:inherit;font-size:14px;cursor:pointer}.xm-menu-done{flex:1;min-height:48px;border:1px solid #E8B48A;border-radius:12px;background:linear-gradient(180deg,#FFE9C8,#E8C395);color:#3D0914;font:inherit;font-size:15px;font-weight:800;cursor:pointer}
@media(max-width:600px){.xm-menu-overlay{align-items:flex-end;padding:0}.xm-menu{width:100%;max-height:88dvh;border-radius:24px 24px 0 0;border-bottom:0}.xm-menu-head{padding:20px 20px 17px}.xm-menu-body{padding:20px}.xm-menu-foot{padding-left:20px;padding-right:20px}}
@media(prefers-reduced-motion:reduce){.xm-menu-choice{transition:none}}
.xm-menu{position:relative}
.xm-lights{position:absolute;inset:0;pointer-events:none;z-index:2}
.xm-lights i{position:absolute;display:block;--d:radial-gradient(circle,#FF3B3B 3px,#FF3B3B00 4.5px),radial-gradient(circle,#2ECC40 3px,#2ECC4000 4.5px),radial-gradient(circle,#FFD23F 3px,#FFD23F00 4.5px),radial-gradient(circle,#3FA9FF 3px,#3FA9FF00 4.5px);background-image:var(--d);filter:drop-shadow(0 0 3px #FFE9C8aa);animation:xm-twinkle 1.6s ease-in-out infinite alternate}
.xm-lights i:nth-child(1),.xm-lights i:nth-child(3){left:18px;right:18px;height:12px;background-size:104px 12px;background-position:0 0,26px 0,52px 0,78px 0;background-repeat:repeat-x}
.xm-lights i:nth-child(1){top:2px}.xm-lights i:nth-child(3){bottom:2px;animation-delay:.8s}
.xm-lights i:nth-child(2),.xm-lights i:nth-child(4){top:18px;bottom:18px;width:12px;background-size:12px 104px;background-position:0 0,0 26px,0 52px,0 78px;background-repeat:repeat-y}
.xm-lights i:nth-child(2){right:2px;animation-delay:.4s}.xm-lights i:nth-child(4){left:2px;animation-delay:1.2s}
@keyframes xm-twinkle{from{opacity:1}to{opacity:.55}}
.xm-menu-head{position:relative;padding-top:74px}
.xm-wreath{position:absolute;left:50%;top:10px;transform:translateX(-50%);width:62px;height:62px;pointer-events:none}
.xm-menu-choice.xm-choice-wreath{position:relative;border-color:#E8B48A;box-shadow:0 0 0 2px #1F6B34,0 0 14px #FF3B3B55}
.xm-choice-wreath .xm-wreath-mini{position:absolute;right:-6px;top:-10px;width:28px;height:28px;pointer-events:none}
@media(prefers-reduced-motion:reduce){.xm-lights i{animation:none}}
`;

// Holiday wreath (owner approved 2026-11-10). Pure SVG, fixed geometry so
// server and client render the same markup.
const BULBS = ["#FF3B3B", "#2ECC40", "#FFD23F", "#3FA9FF"];
const LEAVES = Array.from({ length: 36 }, (_, i) => {
  const a = (i / 36) * Math.PI * 2, r = 40 + (i % 3) * 4;
  return { x: +(58 + Math.cos(a) * r).toFixed(1), y: +(58 + Math.sin(a) * r).toFixed(1), rot: +((a * 180) / Math.PI + 40).toFixed(1), dark: i % 2 === 1 };
});
function Wreath({ className, bulbs = 14 }) {
  return <svg className={className} viewBox="0 0 116 116" aria-hidden="true" focusable="false">
    {LEAVES.map((l, i) => <ellipse key={i} cx={l.x} cy={l.y} rx="11" ry="6" fill={l.dark ? "#1F6B34" : "#2D8A45"} transform={`rotate(${l.rot} ${l.x} ${l.y})`} />)}
    {Array.from({ length: bulbs }, (_, i) => { const a = (i / bulbs) * Math.PI * 2; return <circle key={i} cx={(58 + Math.cos(a) * 44).toFixed(1)} cy={(58 + Math.sin(a) * 44).toFixed(1)} r="5" fill={BULBS[i % 4]} />; })}
    <path d="M48 96l10-8 10 8-4 16-6-6-6 6z" fill="#C8102E" /><circle cx="58" cy="90" r="6" fill="#E01E3C" />
  </svg>;
}

function Choice({ on, text, onClick, wreath }) {
  return <button type="button" className={"xm-menu-choice" + (wreath ? " xm-choice-wreath" : "")} aria-pressed={on} onClick={onClick}>{text}{wreath ? <Wreath className="xm-wreath-mini" bulbs={8} /> : null}</button>;
}

export default function ChristmasFilter({ query, facets, onSet, onNear, onClearNear, onReset }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef(null), dialog = useRef(null), close = useRef(null);
  const near = query.lat != null && query.lat !== "";
  const dates = Array.isArray(facets.dates) ? facets.dates : [];
  const regions = Array.isArray(facets.regions) ? facets.regions : [];
  const pills = Array.isArray(facets.pills) ? facets.pills : [];
  const label = near ? "Closest first" : "Tickets";
  const active = [query.category, query.when || query.date, query.region].filter(Boolean).length;

  useEffect(() => {
    if (!open) return undefined;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    close.current?.focus();
    window.dispatchEvent(new CustomEvent("wf:dialog", { detail: { open: true } }));
    const onKey = (event) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
      if (event.key !== "Tab") return;
      const controls = dialog.current?.querySelectorAll('button:not([disabled]),select:not([disabled]),[tabindex="0"]');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = oldOverflow;
      window.dispatchEvent(new CustomEvent("wf:dialog", { detail: { open: false } }));
      trigger.current?.focus();
    };
  }, [open]);

  return <div data-christmas-filter="" data-collection-filter="">
    <style dangerouslySetInnerHTML={{ __html: CSS }} />
    <button ref={trigger} type="button" className="xm-filter-trigger" aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? id : undefined} onClick={() => setOpen(true)}>
      <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v5a2 2 0 0 0 0 4v5H4v-5a2 2 0 0 0 0-4V5Z"/><path d="M15 5v3m0 3v2m0 3v3"/></svg>
      {label}{active ? <span className="xm-filter-badge" aria-label={active + " filters on"}>{active}</span> : null}
      <span aria-hidden="true" className="xm-filter-caret">▾</span>
    </button>
    {open ? createPortal(<div className="xm-menu-overlay" onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div ref={dialog} id={id} className="xm-menu" role="dialog" aria-modal="true" aria-labelledby={id + "-title"} data-boo-clear="">
        <div className="xm-lights" aria-hidden="true"><i /><i /><i /><i /></div>
        <div className="xm-menu-head"><Wreath className="xm-wreath" /><div><span className="xm-menu-kicker">Christmas in Florida</span><h2 id={id + "-title"}>Christmas, your way</h2></div><button ref={close} type="button" className="xm-menu-close" aria-label="Close filter" onClick={() => setOpen(false)}>×</button></div>
        <div className="xm-menu-body">
          <div className="xm-menu-group" role="group" aria-label="Category"><span className="xm-menu-label">Experience</span><div className="xm-menu-options">
            <Choice on={!query.category} text="All Christmas choices" onClick={() => onSet("category", "")} />
            {pills.map((pill) => <Choice key={pill.id} on={query.category === pill.id} text={pill.label} wreath={pill.id === "popup-bars"} onClick={() => onSet("category", pill.id)} />)}
          </div></div>
          <div className="xm-menu-group" role="group" aria-label="Sort by"><span className="xm-menu-label">Order</span><div className="xm-menu-options">
            {SORTS.map(([key, text]) => <Choice key={key} on={key === "near" ? near : !near} text={text} onClick={key === "near" ? onNear : onClearNear} />)}
          </div><p className="xm-menu-hint">{near ? "Choices closest to you." : "Tickets first, with popular choices leading."}</p></div>
          <div className="xm-menu-group" role="group" aria-label="When"><span className="xm-menu-label">When</span><div className="xm-menu-dates">
            <Choice on={!query.when && !query.date} text="Any time" onClick={() => onSet("when", "")} />
            {dates.map((date) => <Choice key={date.id} on={query.when === date.id} text={date.label} onClick={() => onSet("when", date.id)} />)}
          </div></div>
          <div className="xm-menu-group"><label htmlFor={id + "-region"} className="xm-menu-label">Where</label><select id={id + "-region"} className="xm-menu-select" aria-label="Region" value={query.region || ""} onChange={(event) => onSet("region", event.target.value)}><option value="">All of Florida</option>{regions.map((region) => <option key={region} value={region}>{region}</option>)}</select></div>
        </div>
        <div className="xm-menu-foot">{onReset ? <button type="button" className="xm-menu-reset" onClick={onReset}>Reset</button> : null}<button type="button" className="xm-menu-done" onClick={() => setOpen(false)}>Show Christmas plans</button></div>
      </div>
    </div>, document.body) : null}
  </div>;
}
