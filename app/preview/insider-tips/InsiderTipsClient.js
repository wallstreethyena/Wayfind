"use client";
// The insider-tips homepage mockup (see ./page.js). One "Where are you headed?"
// box, real tip cards with photos and a save heart, and one gentle sign-up
// nudge after the first save. Saves stay in this browser under a preview-only
// key so the mockup never touches anyone's real favorites.
import { useCallback, useEffect, useRef, useState } from "react";
import { styleHtml } from "../../../lib/styleHtml.js";

const SAVE_KEY = "wf_preview_insider_saves";
const NUDGE_KEY = "wf_preview_insider_nudge_dismissed";

const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
const readSaves = () => safe(() => new Set(JSON.parse(window.localStorage.getItem(SAVE_KEY) || "[]")), new Set());

function openSignIn() {
  const door = safe(() => document.querySelector(".wf-signin-button"), null);
  if (door) { safe(() => door.click()); return; }
  window.location.href = "/?go=saved";
}

const CSS = `
.it-page{--it-bg:#040810;--it-card:#0C1320;--it-line:#1C2636;--it-text:#F5F1EA;--it-soft:#A9B3C2;--it-faint:#6F7B8C;--it-warm:#FF8A3D;--it-pink:#FF4F8B;
  color:var(--it-text);background:radial-gradient(1200px 520px at 50% -140px,rgba(255,138,61,.16),transparent 70%),var(--it-bg);
  min-height:100dvh;font-family:var(--wf-sans);padding:0 16px 72px;box-sizing:border-box;overflow-x:clip}
.it-page *{box-sizing:border-box}
.it-wrap{max-width:1080px;margin:0 auto}
.it-hero{padding:56px 0 28px;text-align:center}
.it-eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--it-soft);margin:0 0 14px}
.it-dot{width:7px;height:7px;border-radius:50%;background:linear-gradient(135deg,#FFC23D,var(--it-warm),var(--it-pink),#8A3CFF)}
.it-h1{font-family:var(--wf-display),Georgia,serif;font-weight:600;font-size:clamp(34px,7vw,60px);line-height:1.04;letter-spacing:-.02em;margin:0 0 22px}
.it-form{position:relative;max-width:640px;margin:0 auto}
.it-input{width:100%;height:60px;border-radius:999px;border:1px solid #2A3547;background:#0E1626;color:var(--it-text);font:500 17px/1 var(--wf-sans);padding:0 128px 0 24px;outline:none;transition:border-color .2s,box-shadow .2s}
.it-input::placeholder{color:var(--it-faint)}
.it-input:focus{border-color:var(--it-warm);box-shadow:0 0 0 4px rgba(255,138,61,.18)}
.it-go{position:absolute;right:6px;top:6px;height:48px;padding:0 22px;border-radius:999px;border:0;background:var(--it-warm);color:#1A0E05;font:700 16px/1 var(--wf-sans);cursor:pointer}
.it-go:disabled{opacity:.7;cursor:progress}
.it-go:focus-visible,.it-chip:focus-visible,.it-heart:focus-visible,.it-nudge button:focus-visible{outline:3px solid #FFC23D;outline-offset:2px}
.it-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin:16px auto 0;max-width:640px}
.it-chip{border:1px solid var(--it-line);background:transparent;color:var(--it-soft);border-radius:999px;padding:8px 14px;font:500 14px/1 var(--wf-sans);cursor:pointer}
.it-chip:hover{color:var(--it-text);border-color:#33415A}
.it-chip[aria-pressed="true"]{color:var(--it-text);border-color:var(--it-warm);background:rgba(255,138,61,.1)}
.it-intro{min-height:28px;margin:30px 0 18px;font-family:var(--wf-display),Georgia,serif;font-size:clamp(20px,3.2vw,26px);line-height:1.25;text-align:center}
.it-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px}
@media (max-width:640px){.it-hero{padding:36px 0 20px}.it-grid{grid-template-columns:1fr;gap:14px}.it-input{height:56px;font-size:16px;padding-right:110px}.it-go{height:44px;padding:0 18px}}
.it-card{position:relative;display:flex;flex-direction:column;background:var(--it-card);border:1px solid var(--it-line);border-radius:18px;overflow:hidden;transition:transform .2s,border-color .2s}
.it-card:hover{transform:translateY(-2px);border-color:#2C3950}
.it-card a{color:inherit;text-decoration:none}
.it-card a:focus-visible{outline:3px solid #FFC23D;outline-offset:-3px;border-radius:18px}
.it-photo{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;background:#121B2B}
.it-body{padding:14px 16px 16px;display:flex;flex-direction:column;gap:8px;flex:1}
.it-name{font-weight:700;font-size:17px;line-height:1.25;margin:0}
.it-meta{font-size:13px;color:var(--it-soft);margin:0;text-transform:capitalize}
.it-tip{font-size:16px;line-height:1.45;margin:4px 0 0;color:var(--it-text)}
.it-tip b{color:var(--it-warm);font-weight:700}
.it-tip.loading{color:transparent;background:linear-gradient(90deg,#141E2F 0%,#1D2A40 50%,#141E2F 100%);background-size:200% 100%;animation:it-shim 1.2s infinite;border-radius:8px}
@keyframes it-shim{to{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){.it-tip.loading{animation:none}.it-card,.it-card:hover{transition:none;transform:none}}
.it-credit{font-size:11px;color:var(--it-faint);margin:auto 0 0;padding-top:6px;line-height:1.35}
.it-heart{position:absolute;top:10px;right:10px;width:42px;height:42px;border-radius:50%;border:0;background:rgba(4,8,16,.62);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:grid;place-items:center;cursor:pointer;z-index:2}
.it-heart svg{width:22px;height:22px}
.it-heart[aria-pressed="true"] svg path{fill:var(--it-pink);stroke:var(--it-pink)}
.it-note{margin:26px auto 0;text-align:center;font-size:12.5px;color:var(--it-faint);max-width:560px;line-height:1.5}
.it-nudge{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);width:min(560px,calc(100vw - 32px));background:#111A2A;border:1px solid #2A3547;border-radius:16px;padding:14px 16px;display:flex;align-items:center;gap:12px;box-shadow:0 18px 40px rgba(0,0,0,.45);z-index:50}
.it-nudge p{margin:0;flex:1;font-size:14.5px;line-height:1.4;color:var(--it-text)}
.it-nudge p span{color:var(--it-soft)}
.it-nudge .yes{border:0;border-radius:999px;background:var(--it-warm);color:#1A0E05;font:700 14px/1 var(--wf-sans);padding:11px 14px;cursor:pointer;white-space:nowrap}
.it-nudge .no{border:0;background:transparent;color:var(--it-soft);font:500 13px/1 var(--wf-sans);padding:8px 4px;cursor:pointer}
@media (max-width:420px){.it-nudge{flex-wrap:wrap}.it-nudge p{flex-basis:100%}}
.it-empty{text-align:center;color:var(--it-soft);padding:30px 0}
`;

function Heart({ on }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 7.9 3.6 4.5 7 4.5c2 0 3.6 1.1 5 2.9 1.4-1.8 3-2.9 5-2.9 3.4 0 5.6 3.4 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" fill={on ? "#FF4F8B" : "none"} stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" /></svg>
  );
}

function TipCard({ c, saved, onSave, loading }) {
  return (
    <article className="it-card" data-insider-card={c.id}>
      <button type="button" className="it-heart" aria-pressed={saved ? "true" : "false"} aria-label={(saved ? "Unsave " : "Save ") + c.name} onClick={() => onSave(c.id)}>
        <Heart on={saved} />
      </button>
      <a href={c.href}>
        <img className="it-photo" src={c.photo} alt={c.name} loading="lazy" decoding="async" width="640" height="480" />
        <div className="it-body">
          <h2 className="it-name">{c.name}</h2>
          <p className="it-meta">{[c.town, c.category].filter(Boolean).join(" · ")}</p>
          <p className={"it-tip" + (loading ? " loading" : "")} title={c.ai ? "Insider tip: " + c.tip : undefined}><b>Insider tip:</b> {c.line}</p>
          {c.credit ? <p className="it-credit">Photo: {c.credit}</p> : null}
        </div>
      </a>
    </article>
  );
}

export default function InsiderTipsClient({ initial, quickPicks = [], tipCount = 0 }) {
  const [answer, setAnswer] = useState(initial);
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState("");
  const [loading, setLoading] = useState(true);
  const [saves, setSaves] = useState(() => new Set());
  const [nudge, setNudge] = useState(false);
  const seq = useRef(0);

  const ask = useCallback(async (text) => {
    const my = ++seq.current;
    setLoading(true);
    setAsked(text);
    try {
      const res = await fetch("/api/preview/insider-tips?q=" + encodeURIComponent(text), { headers: { accept: "application/json" } });
      const data = res.ok ? await res.json() : null;
      if (my === seq.current && data && Array.isArray(data.cards)) setAnswer(data);
    } catch { /* keep what is on screen */ }
    if (my === seq.current) setLoading(false);
  }, []);

  useEffect(() => { setSaves(readSaves()); ask(""); }, [ask]);

  const onSave = useCallback((id) => {
    setSaves((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      safe(() => window.localStorage.setItem(SAVE_KEY, JSON.stringify([...next])));
      if (next.size > prev.size && !safe(() => window.localStorage.getItem(NUDGE_KEY), null)) setNudge(true);
      return next;
    });
  }, []);

  const dismiss = () => { setNudge(false); safe(() => window.localStorage.setItem(NUDGE_KEY, "1")); };
  const submit = (e) => { e.preventDefault(); ask(q.trim()); };
  const cards = Array.isArray(answer && answer.cards) ? answer.cards : [];

  return (
    <main className="it-page" data-insider-preview="1" data-ai={answer && answer.ai ? "on" : "off"} data-model={(answer && answer.model) || ""}>
      <style dangerouslySetInnerHTML={styleHtml(CSS)} />
      <div className="it-wrap">
        <header className="it-hero">
          <p className="it-eyebrow"><span className="it-dot" aria-hidden="true" />Insider tips from Florida locals</p>
          <h1 className="it-h1">Where are you headed?</h1>
          <form className="it-form" role="search" onSubmit={submit}>
            <label htmlFor="it-q" className="wf-sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Where are you headed?</label>
            <input id="it-q" className="it-input" type="search" enterKeyHint="search" autoComplete="off" maxLength={80}
              placeholder="Try “Sarasota” or “rainy day in Tampa”" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="it-go" type="submit" disabled={loading && !!asked}>{loading && asked ? "Looking…" : "Show me"}</button>
          </form>
          <div className="it-chips" aria-label="Popular places">
            {quickPicks.map((p) => (
              <button key={p} type="button" className="it-chip" aria-pressed={asked === p ? "true" : "false"} onClick={() => { setQ(p); ask(p); }}>{p}</button>
            ))}
          </div>
        </header>

        <section aria-live="polite" aria-busy={loading ? "true" : "false"}>
          <p className="it-intro">{answer && answer.intro}</p>
          {cards.length ? (
            <div className="it-grid">
              {cards.map((c) => <TipCard key={c.id} c={c} saved={saves.has(c.id)} onSave={onSave} loading={loading && !answer.ai} />)}
            </div>
          ) : (
            <p className="it-empty">No insider tips there yet. Try a Florida town or a quick pick above.</p>
          )}
        </section>

        <p className="it-note">
          Every place, tip and photo here is a real Wayfind pick{tipCount ? ` (one of ${tipCount} with a verified local tip)` : ""}. The friendly wording is written by AI from our verified tip.{" "}
          <button type="button" onClick={openSignIn} style={{ background: "none", border: 0, padding: 0, color: "#FF8A3D", font: "inherit", cursor: "pointer", textDecoration: "underline" }}>Make a free account</button> to keep your saves.
        </p>
      </div>

      {nudge ? (
        <div className="it-nudge" role="dialog" aria-label="Keep your saves">
          <p>Nice pick. <span>Want it on every device? It&apos;s free.</span></p>
          <button type="button" className="yes" onClick={() => { dismiss(); openSignIn(); }}>Keep my saves</button>
          <button type="button" className="no" onClick={dismiss}>Not now</button>
        </div>
      ) : null}
    </main>
  );
}
