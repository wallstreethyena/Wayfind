// Server-rendered reading navigation and typography shared by every guide.
export function GuideFacts({ facts }) {
  if (!facts || !facts.heading || !Array.isArray(facts.items) || !facts.items.length) return null;
  return (
    <section className="wf-guide-facts" aria-labelledby="guide-facts-title">
      <h2 id="guide-facts-title">{facts.heading}</h2>
      <dl>
        {facts.items.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function GuideReadingNav({ guide }) {
  if (!guide.picks?.length) return null;
  return <details className="wf-guide-outline"><summary>In this guide <span>{guide.picks.length} sections</span></summary><nav className="wf-guide-contents" aria-label="In this guide">
    <ol>{guide.picks.map((pick, i) => <li key={i}>
      <a href={"#pick-" + (i + 1)}><span aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>{pick.name}</a>
    </li>)}</ol>
  </nav></details>;
}

// The 2026 Halloween food article carries generated menu illustrations in its
// content record. They are not evidence of what a venue currently serves, so
// the article keeps its prose and real inventory cards without rendering them.
export function guidePickImage(slug, pick) {
  if (slug === "orlando-halloween-food-2026") return null;
  return pick?.image || null;
}

export const GUIDE_EDITORIAL_CSS = `
.wf-guide-editorial .wf-guide-article{max-width:780px;padding-top:30px}
.wf-guide-editorial .wf-guide-intro{font:400 23px/1.65 var(--wf-display),Georgia,serif!important;color:#eef0ed!important;margin:24px 0!important}
.wf-guide-editorial .wf-guide-teaser{color:#f9c39a!important;font-weight:500!important;border-left:2px solid #f67822;padding-left:18px}
.wf-guide-outline{margin:28px 0}.wf-guide-outline summary{cursor:pointer;min-height:44px;display:flex;align-items:center;justify-content:space-between;gap:16px;color:#e9edf3;font-weight:700}.wf-guide-outline summary::after{content:"+";font-size:22px;color:#f6a36c}.wf-guide-outline[open] summary::after{content:"−"}.wf-guide-outline summary span{margin-left:auto;font-size:12px;color:#a4afbd;font-weight:400}.wf-guide-outline summary:focus-visible{outline:2px solid #ffc394;outline-offset:4px}
.wf-guide-contents{margin:28px 0 34px;padding:24px;border:1px solid #29313c;border-radius:16px;background:#0c131e}
.wf-guide-contents-label{color:#a4afbd;text-transform:uppercase;font-size:11px;letter-spacing:2px;font-weight:700}
.wf-guide-contents ol{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 24px;list-style:none;padding:0;margin:14px 0 0}
.wf-guide-contents a{display:flex;align-items:baseline;gap:12px;padding:10px 0;color:#e9edf3;text-decoration:none;font-size:14px;line-height:1.5}
.wf-guide-contents a span{color:#edab79;font-size:12px;font-variant-numeric:tabular-nums}
.wf-guide-contents a:hover{color:#ffc394}
.wf-guide-editorial a:focus-visible,.wf-guide-editorial button:focus-visible{outline:2px solid #ffc394;outline-offset:5px}
.wf-guide-editorial .wf-guide-pick{scroll-margin-top:24px;grid-template-columns:48px minmax(0,1fr);gap:20px;padding:34px 0!important}
.wf-guide-editorial .wf-guide-number{font-size:36px;color:#b29d88}
.wf-guide-editorial .wf-guide-pick h2{font:400 30px/1.2 var(--wf-display),Georgia,serif!important;letter-spacing:-.5px;margin:8px 0 16px!important;text-wrap:balance}
.wf-guide-editorial .wf-guide-pick>div>p{font-size:17px!important;line-height:1.75!important}
.wf-guide-editorial .wf-guide-pick .wf-guide-tip{padding:14px 18px;border-left:2px solid #ce966c;background:#111b25;color:#e8c6ac!important;font-size:15px!important;line-height:1.65!important;margin:20px 0!important}
.wf-guide-editorial .wf-guide-actions a{border-radius:999px!important;min-height:44px;box-sizing:border-box;padding:10px 18px!important;display:inline-flex;align-items:center}
.wf-guide-editorial .wf-guide-faq{margin-top:36px;padding:26px 0;border-top:1px solid #29313c}
.wf-guide-editorial .wf-guide-faq>div{padding:16px 0;border-bottom:1px solid #202c39}
.wf-guide-editorial .wf-guide-faq p{line-height:1.7}
.wf-guide-facts{margin:6px 0 22px;padding:16px 16px 14px;border:1px solid #c2410c;border-radius:12px;background:#08090c;color:#fff;overflow-x:hidden}
.wf-guide-facts h2{margin:0 0 12px;font-size:12px;letter-spacing:1.6px;font-weight:800;color:#fff;text-transform:uppercase}
.wf-guide-facts dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px;margin:0}
.wf-guide-facts > dl > div{min-width:0}
.wf-guide-facts dt{font-size:11px;color:#94a3b8;font-weight:600}
.wf-guide-facts dd{margin:3px 0 0;font-size:14px;color:#fff;line-height:1.4;overflow-wrap:anywhere}
@media(max-width:360px){.wf-guide-facts dl{grid-template-columns:minmax(0,1fr)}}
.wf-guide-place-rail{margin:10px 0 8px;padding:22px 0 8px;border-top:1px solid #2d3748}
.wf-guide-place-rail-head{padding:0 2px 8px}
.wf-guide-place-rail-kicker{margin:0 0 6px;font-size:11px;letter-spacing:2px;font-weight:800;color:#f97316}
.wf-guide-place-rail-sub{margin:0 0 6px;font-size:15px;color:#e2e8f0;line-height:1.45}
.wf-guide-place-rail-secondary{margin:0;font-size:13px}
.wf-guide-place-rail-secondary a{color:#fdba74;font-weight:700;text-decoration:none}
.wf-guide-place-rail-market{margin:16px 0 8px;font-size:12px;letter-spacing:1.4px;font-weight:800;color:#94a3b8;text-transform:uppercase}
.wf-guide-place-rail .wf8-pcrail{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;padding:4px 2px 16px;-webkit-overflow-scrolling:touch}
.wf-guide-place-rail .wf-place-card-slot{list-style:none}
@media(max-width:760px){
 .wf-guide-editorial .wf-guide-article{padding-top:24px}
 .wf-guide-editorial .wf-guide-intro{font-size:20px!important;line-height:1.65!important}
 .wf-guide-contents{padding:20px;margin:24px 0}
 .wf-guide-contents ol{grid-template-columns:minmax(0,1fr);gap:0}
 .wf-guide-contents a{min-height:44px;box-sizing:border-box}
 .wf-guide-editorial .wf-guide-pick{grid-template-columns:minmax(0,1fr);gap:8px;padding:28px 0!important}
 .wf-guide-editorial .wf-guide-number{font-size:24px}
 .wf-guide-editorial .wf-guide-pick h2{font-size:27px!important}
 .wf-guide-editorial .wf-guide-card-slot{margin-left:0!important}
}
`;
