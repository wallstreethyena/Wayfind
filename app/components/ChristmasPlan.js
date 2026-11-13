"use client";
// "My Christmas plan": the Christmas events the visitor saved (the Save heart on
// every card), with a "Share my plan" button that makes the link
// /christmas-in-florida?plan=id,id. Opening such a link shows that plan for a
// friend to vote on ("I'm in"), without signing in. Ids are checked by the
// server (/api/christmas/browse?ids=, unknown ids dropped). Votes need the
// wf_christmas_plan_votes table: until it exists the API says available false
// and the vote buttons are simply not shown; sharing keeps working.
import { useEffect, useState } from "react";
import { openShareFlow } from "../../lib/shareFlow.js";
import { removeSavedContent, useSavedContentIds } from "../../lib/contentCardActions.js";
import { styleHtml } from "../../lib/styleHtml.js";

const CSS = `
.xp-plan{margin:22px 0 4px;padding:16px;border:1px solid #E8B48A55;border-radius:18px;background:linear-gradient(160deg,#3E0C19,#230710 80%);color:#FFF7ED}
.xp-plan h2{margin:0;color:#FFF7ED;font-family:Georgia,serif;font-size:22px;font-weight:500;line-height:1.2}
.xp-sub{margin:5px 0 0;color:#E1C6B6;font-size:13px;line-height:1.45}
.xp-list{display:grid;gap:10px;margin:14px 0 0;padding:0;list-style:none}
.xp-item{display:flex;gap:12px;align-items:center;padding:10px;border:1px solid #E8B48A33;border-radius:14px;background:#18020826}
.xp-thumb{flex:none;width:64px;height:64px;border-radius:10px;object-fit:cover;background:#2A0A12}
.xp-main{min-width:0;flex:1}
.xp-name{display:block;color:#FFF7ED;font-family:Georgia,serif;font-size:16px;line-height:1.25;text-decoration:none}
.xp-meta{display:block;margin-top:3px;color:#E1C6B6;font-size:13px;line-height:1.4}
.xp-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.xp-btn{min-height:44px;padding:0 14px;border:1px solid #E8B48A;border-radius:12px;background:transparent;color:#FFE9C8;font:inherit;font-size:14px;font-weight:700;cursor:pointer}
.xp-btn[aria-pressed="true"]{background:linear-gradient(180deg,#FFE9C8,#E8C395);color:#3D0914}
.xp-btn:focus-visible,.xp-share:focus-visible{outline:2px solid #FFE9C8;outline-offset:3px}
.xp-quiet{border-color:transparent;color:#E8B48A;font-weight:500}
.xp-share{margin-top:14px;min-height:48px;padding:0 22px;border:2px solid #E8B48A;border-radius:12px;background:linear-gradient(180deg,#FFE9B8,#F5C451);color:#4A0610;font:inherit;font-size:15px;font-weight:800;cursor:pointer}
.xp-share:disabled{opacity:.6;cursor:default}
`;
const VOTER_KEY = "wf_christmas_voter_v1";

function voterToken() {
  try {
    let v = localStorage.getItem(VOTER_KEY) || "";
    if (!/^[a-f0-9]{32}$/.test(v)) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      v = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(VOTER_KEY, v);
    }
    return v;
  } catch { return ""; }
}
export function planLink(origin, ids) {
  return origin + "/christmas-in-florida?plan=" + ids.map(encodeURIComponent).join(",");
}
function photoOf(card) {
  const t = card.ticketRow && Array.isArray(card.ticketRow.photos) ? card.ticketRow.photos[0] : null;
  if (t && t.src) return t.src;
  return card.image && !/\/cards-v8\//.test(card.image) ? card.image : "";
}

function Thumb({ src }) {
  const [dead, setDead] = useState(false);
  if (!src || dead) return null;
  return <img className="xp-thumb" src={src} alt="" loading="lazy" decoding="async" onError={() => setDead(true)} />;
}

export default function ChristmasPlan() {
  const saved = useSavedContentIds("event");
  const [urlIds, setUrlIds] = useState(null);
  const [cards, setCards] = useState(null);
  const [votes, setVotes] = useState(null); // { counts, mine } when the table exists, else null
  const [voter, setVoter] = useState("");
  useEffect(() => {
    try { setUrlIds(new URLSearchParams(window.location.search).get("plan") || ""); } catch { setUrlIds(""); }
    setVoter(voterToken());
  }, []);
  const shared = !!urlIds;
  const wanted = shared ? urlIds : saved.ids.slice(0, 12).join(",");
  const ready = urlIds !== null && (shared || saved.hydrated);
  useEffect(() => {
    if (!ready || !wanted) { setCards(null); setVotes(null); return undefined; }
    const controller = new AbortController();
    fetch("/api/christmas/browse?ids=" + encodeURIComponent(wanted), { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("status " + r.status))))
      .then((json) => setCards(Array.isArray(json.cards) ? json.cards : []))
      .catch((e) => { if (e?.name !== "AbortError") setCards([]); });
    return () => controller.abort();
  }, [ready, wanted]);
  const ids = (cards || []).map((c) => c.id);
  const idsKey = ids.join(",");
  useEffect(() => {
    if (!idsKey || !voter) { setVotes(null); return undefined; }
    const controller = new AbortController();
    fetch("/api/christmas/plan-votes?plan=" + encodeURIComponent(idsKey) + "&voter=" + voter, { signal: controller.signal })
      .then((r) => r.json())
      .then((json) => setVotes(json && json.available === true ? { counts: json.counts || {}, mine: json.mine || [] } : null))
      .catch(() => setVotes(null));
    return () => controller.abort();
  }, [idsKey, voter]);

  if (!ready || !wanted || cards === null) return null;
  if (!cards.length) return shared ? <section className="xp-plan" data-christmas-plan="shared"><style dangerouslySetInnerHTML={styleHtml(CSS)} /><h2>A Christmas plan</h2><p className="xp-sub">None of the events in this link are on the list right now. Browse below to build your own.</p></section> : null;

  const share = () => {
    try { openShareFlow({ title: "My Christmas plan", text: "Here is my Christmas plan in Florida. Tell me which ones you are in for.", url: planLink(window.location.origin, ids) }); } catch {}
  };
  const toggleVote = (id) => {
    if (!votes) return;
    const on = !votes.mine.includes(id);
    setVotes((v) => v && ({ counts: { ...v.counts, [id]: Math.max(0, (v.counts[id] || 0) + (on ? 1 : -1)) }, mine: on ? [...v.mine, id] : v.mine.filter((x) => x !== id) }));
    fetch("/api/christmas/plan-votes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: idsKey, item: id, voter, on }) })
      .then((r) => r.json()).then((json) => { if (!json || json.available !== true) setVotes(null); }).catch(() => setVotes(null));
  };
  return <section className="xp-plan" aria-labelledby="xp-heading" data-boo-clear="" data-christmas-plan={shared ? "shared" : "mine"} data-plan-votes={votes ? "on" : "off"}>
    <style dangerouslySetInnerHTML={styleHtml(CSS)} />
    <h2 id="xp-heading">{shared ? "A Christmas plan to vote on" : "My Christmas plan"}</h2>
    <p className="xp-sub">{shared ? (votes ? "Tap I'm in on the ones you want to do." : "Here is the plan a friend shared with you.") : "The events you saved with the heart, all in one place."}</p>
    <ul className="xp-list">
      {cards.map((card) => {
        const photo = photoOf(card);
        const href = card.detailHref && String(card.detailHref).startsWith("/") ? card.detailHref : (/^https:\/\//.test(card.url || "") ? card.url : null);
        const when = (card.ticketRow && card.ticketRow.when) || card.when || "";
        const mine = votes ? votes.mine.includes(card.id) : false;
        const count = votes ? votes.counts[card.id] || 0 : 0;
        return <li className="xp-item" key={card.id}>
          <Thumb src={photo} />
          <div className="xp-main">
            {href ? <a className="xp-name" href={href}>{card.title || card.name}</a> : <span className="xp-name">{card.title || card.name}</span>}
            <span className="xp-meta">{[card.city, when].filter(Boolean).join(" · ")}</span>
            <div className="xp-acts">
              {votes ? <button type="button" className="xp-btn" aria-pressed={mine} onClick={() => toggleVote(card.id)}>{mine ? "You are in" : "I'm in"}{count ? " · " + count : ""}</button> : null}
              {!shared ? <button type="button" className="xp-btn xp-quiet" onClick={() => removeSavedContent("event", card.id)}>Remove</button> : null}
            </div>
          </div>
        </li>;
      })}
    </ul>
    <button type="button" className="xp-share" onClick={share}>{shared ? "Share this plan" : "Share my plan"}</button>
  </section>;
}
