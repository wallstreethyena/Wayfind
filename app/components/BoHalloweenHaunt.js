"use client";

import { useState } from "react";
import { captureOrQueue } from "../../lib/browserAnalytics.js";

// Premium festival program look. Inter via --wf-sans, one palette, no gradients.
// Visible copy comes from the server model and stays dash free.
const BULB_COUNT = 10;
const BULB_TONES = ["orange", "lavender"];
const WIRE_PITCH = 1200 / BULB_COUNT;
const WIRE_PATH = (() => {
  let d = "M0 10";
  for (let i = 0; i < BULB_COUNT; i += 1) {
    d += " Q" + ((i + 0.5) * WIRE_PITCH).toFixed(1) + " 46 " + ((i + 1) * WIRE_PITCH).toFixed(1) + " 10";
  }
  return d;
})();

const BOO_ART = "/images/boo/boo_v1_hype_guide.png";

function trackHauntEvent(event, props) {
  if (typeof window === "undefined") return;
  try {
    captureOrQueue(window, event, { surface: "halloween_haunts", ...props });
  } catch { /* ignore */ }
}

function openBoo() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("wf:boo-open"));
}

const CSS = `
.boo-page{
  --bg:#07060B;--surface:#110E19;--line:rgba(196,181,253,.18);
  --orange:#F97316;--lav:#C4B5FD;--cream:#F5EFE6;--muted:#9A94A8;
  background:var(--bg);
  color:var(--cream);
  font-family:var(--wf-sans),sans-serif;
  font-weight:400;
  padding:0 16px 56px;
  min-height:100dvh;
  overflow-x:clip;
  box-sizing:border-box;
}
.boo-page *,.boo-page *::before,.boo-page *::after{box-sizing:border-box}
.boo-page button,.boo-page a{font-family:inherit}
.boo-inner{max-width:720px;margin:0 auto}

/* String lights */
.boo-lights{position:relative;height:56px;margin:0 -16px;pointer-events:none;overflow:hidden}
.boo-wire{position:absolute;inset:0;width:100%;height:100%}
.boo-bulb{
  position:absolute;top:26px;width:10px;height:14px;margin-left:-5px;
  border-radius:50% 50% 55% 55%;
  animation:boo-twinkle 3.2s ease-in-out infinite;
}
.boo-bulb.is-orange{background:var(--orange);box-shadow:0 0 10px 2px rgba(249,115,22,.55)}
.boo-bulb.is-lavender{background:var(--lav);box-shadow:0 0 10px 2px rgba(196,181,253,.45)}
.boo-bulb:nth-child(3n){animation-delay:-1.1s}
.boo-bulb:nth-child(3n+1){animation-delay:-2.1s}
@keyframes boo-twinkle{0%,100%{opacity:1}50%{opacity:.62}}
@media(prefers-reduced-motion:reduce){.boo-bulb{animation:none}}

/* Top bar */
.boo-top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0 4px;min-height:48px}
.boo-home{color:var(--lav);font-size:14px;font-weight:600;text-decoration:none;min-height:44px;display:inline-flex;align-items:center}

/* Hero */
.boo-hero{padding:12px 0 8px}
.boo-hero h1{margin:0 0 12px;font-size:32px;line-height:1.15;font-weight:700;color:var(--cream);letter-spacing:-.01em}
.boo-lede{margin:0;font-size:16px;line-height:1.5;color:var(--cream)}
.boo-legal{margin:10px 0 0;font-size:12px;line-height:1.5;color:var(--muted)}
.boo-boo-row{display:flex;align-items:center;gap:12px;margin-top:22px}
.boo-art{position:relative;flex:0 0 96px;width:96px;height:96px}
.boo-art::before{
  content:"";position:absolute;inset:-12px;border-radius:50%;
  background:radial-gradient(circle,rgba(249,115,22,.22) 0%,rgba(249,115,22,0) 68%);
}
.boo-art svg{position:relative;width:96px;height:96px;display:block}
.boo-bubble{
  flex:1;min-width:0;margin:0;
  background:var(--surface);border:1px solid var(--line);border-radius:12px;
  padding:12px 14px;font-size:15px;line-height:1.4;color:var(--cream);
}
.boo-ask{
  margin-top:16px;width:100%;min-height:52px;border-radius:12px;border:0;cursor:pointer;
  background:var(--orange);color:var(--bg);font-size:16px;font-weight:700;
}

/* Picks */
.boo-picks-wrap{margin-top:28px}
.boo-picks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:stretch}
.boo-picks button{
  display:flex;align-items:center;justify-content:space-between;gap:8px;
  min-height:56px;width:100%;margin:0;padding:10px 14px;
  background:var(--surface);color:var(--cream);
  border:1px solid var(--line);border-radius:12px;cursor:pointer;
  font-size:15px;line-height:1.25;font-weight:600;text-align:left;
}
.boo-picks button:last-child:nth-child(odd){grid-column:1 / -1}
.boo-picks button .boo-arrow{flex:0 0 auto;color:var(--orange);font-size:18px;line-height:1}
.boo-picks button[aria-pressed="true"]{border-color:var(--orange)}
.boo-picks button:focus-visible,.boo-filters button:focus-visible,.boo-ask:focus-visible,.boo-buy:focus-visible,.boo-card a:focus-visible,.boo-home:focus-visible{outline:2px solid var(--lav);outline-offset:2px}

/* Vault */
#boo-vault{margin-top:32px;scroll-margin-top:12px}
.boo-filters{display:flex;flex-wrap:wrap;gap:8px}
.boo-filters button{
  min-height:44px;padding:8px 14px;border-radius:999px;cursor:pointer;
  background:transparent;color:var(--lav);border:1px solid var(--line);
  font-size:14px;font-weight:600;
}
.boo-filters button[aria-pressed="true"]{background:var(--lav);color:var(--bg);border-color:var(--lav)}
.boo-picked{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px}
.boo-picked p{margin:0;font-size:16px;font-weight:700;color:var(--cream)}
.boo-picked button{
  min-height:44px;padding:0 4px;background:none;border:0;cursor:pointer;
  color:var(--lav);font-size:14px;font-weight:600;text-decoration:underline;text-underline-offset:3px;
}
.boo-vault-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;margin-top:16px}
@media(min-width:760px){.boo-inner{max-width:960px}.boo-vault-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
.boo-card{
  display:flex;flex-direction:column;gap:10px;min-width:0;
  background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px;
  scroll-margin-top:12px;
}
.boo-city{margin:0 0 -4px;font-size:13px;color:var(--muted)}
.boo-card h2{margin:0;font-size:20px;line-height:1.25;font-weight:700;color:var(--cream);overflow-wrap:anywhere}
.boo-price{margin:0;font-size:18px;font-weight:700;color:var(--cream)}
.boo-when{margin:0;font-size:14px;line-height:1.45;color:var(--muted)}
.boo-tip{margin:0;font-size:14px;line-height:1.5;color:var(--cream)}
.boo-buy{
  display:flex;align-items:center;justify-content:center;width:100%;min-height:52px;margin-top:4px;
  background:var(--orange);color:var(--bg);border-radius:12px;
  font-size:16px;font-weight:700;text-decoration:none;text-align:center;
}
.boo-via{margin:0;font-size:12px;line-height:1.4;color:var(--muted);text-align:center}
.boo-event{
  display:flex;align-items:center;justify-content:center;min-height:44px;
  color:var(--lav);font-size:14px;font-weight:600;text-decoration:underline;text-underline-offset:3px;
}
.boo-empty{margin:16px 0 0;color:var(--muted);font-size:14px}
`;

export default function BoHalloweenHaunt({ model, share = null }) {
  const { chrome, filters, haunts, picks } = model;
  const [filter, setFilter] = useState("all");
  const [selectedPickId, setSelectedPickId] = useState(null);

  const selectedPick = picks.find((p) => p.id === selectedPickId) || null;
  const shown = selectedPick
    ? (selectedPick.shortlistIds || [selectedPick.hauntId]).map((id) => haunts.find((h) => h.id === id)).filter(Boolean)
    : filter === "all"
      ? haunts
      : haunts.filter((row) => row.filters.includes(filter));

  const scrollToVault = () => {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      const node = document.getElementById("boo-vault");
      if (node && typeof node.scrollIntoView === "function") node.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const pickScare = (item) => {
    setSelectedPickId(item.id);
    trackHauntEvent("boo_preference_applied", {
      pick_id: item.id,
      filter_id: item.filterId || "all",
      shortlist_count: (item.shortlistIds || []).length,
    });
    scrollToVault();
  };

  const applyFilter = (id) => {
    setSelectedPickId(null);
    setFilter(id);
    trackHauntEvent("boo_preference_applied", { filter_id: id, pick_id: "none" });
  };

  return (
    <section className="boo-page" aria-labelledby="boo-title" data-analytics-page="halloween_haunts">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="boo-lights" aria-hidden="true">
        <svg className="boo-wire" viewBox="0 0 1200 56" preserveAspectRatio="none">
          <path d={WIRE_PATH} fill="none" stroke="#9A94A8" strokeOpacity=".55" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
        {Array.from({ length: BULB_COUNT }, (_, i) => (
          <span
            key={i}
            className={"boo-bulb is-" + BULB_TONES[i % BULB_TONES.length]}
            style={{ left: (((i + 0.5) / BULB_COUNT) * 100).toFixed(2) + "%" }}
          />
        ))}
      </div>

      <div className="boo-inner">
        <div className="boo-top">
          <a className="boo-home" href="/">{chrome.home}</a>
          {share}
        </div>

        <div className="boo-hero" id="boo-hero">
          <h1 id="boo-title">{chrome.title}</h1>
          <p className="boo-lede">{"Prices, dates and hours for " + haunts.length + " Florida haunts."}</p>
          <p className="boo-legal">{chrome.disclosure}</p>
          <div className="boo-boo-row">
            <div className="boo-art">
              <svg viewBox="0 0 96 96" role="img" aria-label={chrome.videoLabel}>
                <image href={BOO_ART} x="0" y="0" width="96" height="96" preserveAspectRatio="xMidYMid meet" />
              </svg>
            </div>
            <p className="boo-bubble">Not sure where to go? Ask me and I will point you to a night.</p>
          </div>
          <button type="button" className="boo-ask" onClick={openBoo}>{chrome.ask}</button>
        </div>

        <div className="boo-picks-wrap">
          <div className="boo-picks" role="toolbar" aria-label={chrome.pick}>
            {picks.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-pressed={selectedPickId === item.id}
                onClick={() => pickScare(item)}
              >
                <span>{item.label}</span>
                <span className="boo-arrow" aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        </div>

        <div id="boo-vault" data-haunt-vault="">
          <div className="boo-filters" role="toolbar" aria-label={chrome.eyebrow}>
            {filters.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-pressed={!selectedPick && filter === item.id}
                onClick={() => applyFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {selectedPick ? (
            <div className="boo-picked" data-boo-shortlist={selectedPick.id}>
              <p>{selectedPick.label}</p>
              <button type="button" onClick={() => applyFilter("all")}>{"Show all " + haunts.length}</button>
            </div>
          ) : null}

          {shown.length ? (
            <div className="boo-vault-grid">
              {shown.map((row) => (
                <article
                  key={row.id}
                  id={"haunt-" + row.id}
                  data-haunt-id={row.id}
                  data-place-id={row.eventId || row.id}
                  className="boo-card"
                >
                  <p className="boo-city">{row.city}</p>
                  <h2>{row.name}</h2>
                  <p className="boo-price">{row.priceLabel}</p>
                  <p className="boo-when">{row.timing}</p>
                  <p className="boo-tip">{row.tip}</p>
                  <a className="boo-buy" href={row.cta.href} rel={row.cta.rel}>{row.cta.label}</a>
                  <p className="boo-via">{row.cta.via}</p>
                  <a className="boo-event" href={row.eventHref}>{chrome.eventPage}</a>
                </article>
              ))}
            </div>
          ) : (
            <p className="boo-empty">{chrome.empty}</p>
          )}
        </div>
      </div>
    </section>
  );
}
