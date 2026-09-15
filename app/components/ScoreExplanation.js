"use client";
import { useEffect, useState } from "react";
import { visibleScoreMath } from "../../lib/scoreExplanation.js";

const number = (n) => (n / 10).toFixed(1);
const box = { marginBottom: 16, border: "1px solid #394047", borderRadius: 12, padding: "12px 14px", color: "#dce0e4", fontSize: 13, lineHeight: 1.6 };
export default function ScoreExplanation({ place }) {
  const receipt = visibleScoreMath(place);
  const [research, setResearch] = useState(null);
  const id = String(place?.id || place?.place_id || "");
  useEffect(() => {
    setResearch(null);
    if (!id) return;
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => controller.abort(), 8000);
    fetch("/api/score-verdict?id=" + encodeURIComponent(id), { signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error("unavailable"); return r.json(); })
      .then((r) => { if (active) setResearch({ id, ...r }); })
      .catch(() => { if (active) setResearch({ id, state: "unavailable" }); })
      .finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [id]);
  const result = research?.id === id ? research : null;
  const verdict = result?.state === "ready" && result.verdict?.placeId === id ? result.verdict : null;
  if (!id && !receipt) return null;
  return (
    <>
      {receipt ? (
        <details style={box}>
          <summary style={{ cursor: "pointer", fontWeight: 750, color: "#fff" }}>Why this score?</summary>
          <p>This score starts at {number(receipt.start)} out of 10{receipt.origin === "reviews" ? ", using a review average adjusted for review count" : " from the scoring inputs available for this place"}. The adjustments below produce the number on your card.</p>
          <dl style={{ margin: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><dt>Starting score</dt><dd style={{ margin: 0 }}>{number(receipt.start)}</dd></div>
            {receipt.steps.map((s) => <div key={s.key} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><dt>{s.label}</dt><dd style={{ margin: 0, whiteSpace: "nowrap" }}>{s.delta > 0 ? "+" : ""}{number(s.delta)}</dd></div>)}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontWeight: 800 }}><dt>Wayfind Score</dt><dd style={{ margin: 0 }}>{number(receipt.score)} / 10</dd></div>
          </dl>
          {receipt.origin === "stored" ? <p>The earlier breakdown of the starting score is unavailable.</p> : null}
          <p style={{ marginBottom: 0 }}>Ranked lists put higher Wayfind Scores first. Equal scores can use context and review count to break ties. Editorial recommendations are separate from this calculation.</p>
        </details>
      ) : null}
      {id ? <section aria-label="Sourced Wayfind take" style={box}>
        <strong>Wayfind's take</strong>
        {verdict ? <>
          {verdict.sentences.map((s, i) => <p key={i}>{s.text} {s.sourceIds.map((sourceId) => { const source = verdict.sources.find((x) => x.id === sourceId); return source ? <a key={sourceId} href={source.url} target="_blank" rel="noreferrer" style={{ color: "#ffbb80" }}>Source</a> : null; })}</p>)}
          <small>{verdict.coverage === "venue_information" ? "Based on venue information; independent review consensus has not been assessed." : verdict.coverage === "firsthand" ? "Based on firsthand observations." : "Based on independent sources."} Checked {verdict.reviewedAt.slice(0, 10)}.</small>
        </> : <p role="status">{!result ? "Checking for a sourced verdict…" : result.state === "not_researched" ? "A sourced verdict has not been prepared for this place yet." : result.state === "needs_review" ? "The verdict needs a fresh source check before we show it." : "The sourced verdict is temporarily unavailable."}</p>}
      </section> : null}
    </>
  );
}
