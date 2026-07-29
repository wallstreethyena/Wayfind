// PremiumIntentHero — the conversion-first introduction for visitors arriving
// from search. It borrows the visual language of /go/orlando without behaving
// like a modal: destination photography on the left, a warm editorial panel on
// the right, an immediate product promise, and a single route into Wayfind.
export default function PremiumIntentHero({ eyebrow, location, title, description, image, primaryHref = "/", primaryLabel = "Build my shortlist", secondaryHref = "#shortlist", secondaryLabel = "See the expert picks" }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .wf-intent-hero{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);min-height:560px;overflow:hidden;border:1px solid rgba(255,255,255,.2);border-radius:30px;background:#f6efe5;box-shadow:0 28px 90px rgba(0,0,0,.42)}
        .wf-intent-photo{position:relative;min-height:560px;overflow:hidden;background:#132235}
        .wf-intent-photo>img:first-child{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
        .wf-intent-photo:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(3,8,15,.12),rgba(3,8,15,.28) 48%,rgba(3,8,15,.86))}
        .wf-intent-brand{position:absolute;z-index:2;left:34px;top:30px;width:145px}
        .wf-intent-caption{position:absolute;z-index:2;left:38px;right:38px;bottom:36px;color:#fff;font:500 38px/1.03 Georgia,serif;letter-spacing:-.7px}
        .wf-intent-panel{padding:50px 54px 44px;color:#0d1724;display:flex;flex-direction:column;justify-content:center}
        .wf-intent-top{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:30px}
        .wf-intent-eyebrow,.wf-intent-location{font-size:11px;font-weight:900;letter-spacing:1.8px;text-transform:uppercase}
        .wf-intent-eyebrow{color:#59677b}.wf-intent-location{color:#cf5c16}
        .wf-intent-title{font:500 clamp(42px,4.5vw,67px)/.96 Georgia,serif;letter-spacing:-2.3px;margin:0 0 22px;max-width:690px}
        .wf-intent-copy{font-size:18px;line-height:1.55;color:#56647a;max-width:620px;margin:0 0 26px}
        .wf-intent-proof{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid #d7cec2;border-bottom:1px solid #d7cec2;margin:4px 0 30px}
        .wf-intent-proof>div{padding:18px 14px 18px 0;font-size:12.5px;line-height:1.35;color:#59677b}
        .wf-intent-proof strong{display:block;color:#111b29;font-size:14px;margin-bottom:4px}
        .wf-intent-actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
        .wf-intent-primary,.wf-intent-secondary{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:11px 24px;border-radius:999px;font-size:14px;font-weight:900;text-decoration:none}
        .wf-intent-primary{background:#f67822;color:#101720;box-shadow:0 12px 30px rgba(246,120,34,.24)}
        .wf-intent-secondary{border:1px solid #b8b0a6;color:#46546a}
        .wf-intent-trust{font-size:11.5px;color:#748095;margin:24px 0 0}
        @media(max-width:760px){
          .wf-intent-hero{grid-template-columns:minmax(0,1fr);min-height:0;border-radius:24px}
          .wf-intent-photo{min-height:270px}.wf-intent-brand{left:22px;top:20px;width:116px}
          .wf-intent-caption{left:24px;right:24px;bottom:22px;font-size:29px}
          .wf-intent-panel{padding:25px 24px 28px}.wf-intent-top{margin-bottom:16px}
          .wf-intent-title{font-size:clamp(21px,6.8vw,39px);letter-spacing:-1.35px;margin-bottom:14px}.wf-intent-copy{font-size:15px;line-height:1.45;margin-bottom:17px}
          .wf-intent-proof{display:flex;gap:7px;border:0;margin:0 0 20px;overflow-x:auto;padding-bottom:2px}
          .wf-intent-proof>div{flex:0 0 auto;padding:7px 11px;border:1px solid #d7cec2;border-radius:999px;font-size:0;color:transparent}
          .wf-intent-proof strong{display:inline;font-size:11.5px;margin:0;color:#344054;white-space:nowrap}
          .wf-intent-primary{width:100%;min-height:49px}.wf-intent-secondary{width:auto;min-height:40px;padding:7px 4px;border:0;text-decoration:underline;text-underline-offset:4px}
          .wf-intent-actions{justify-content:center}.wf-intent-trust{text-align:center;margin-top:15px}
        }
      ` }} />
      <header className="wf-intent-hero">
        <div className="wf-intent-photo">
          <img src={image} alt="" />
          <img className="wf-intent-brand" src="/brand/wayfind-wordmark-transparent-v2.png" alt="Wayfind" />
          <div className="wf-intent-caption">A better decision<br />is closer than you think.</div>
        </div>
        <div className="wf-intent-panel">
          <div className="wf-intent-top">
            <span className="wf-intent-eyebrow">{eyebrow}</span>
            <span className="wf-intent-location">● {location}</span>
          </div>
          <h1 className="wf-intent-title">{title}</h1>
          <p className="wf-intent-copy">{description}</p>
          <div className="wf-intent-proof">
            <div><strong>No paid placement</strong>Recommendations earn their position.</div>
            <div><strong>Less searching</strong>Three useful choices, not fifty tabs.</div>
            <div><strong>Built around you</strong>Save a preference and every visit improves.</div>
          </div>
          <div className="wf-intent-actions">
            <a className="wf-intent-primary" href={primaryHref}>{primaryLabel} →</a>
            <a className="wf-intent-secondary" href={secondaryHref}>{secondaryLabel}</a>
          </div>
          <p className="wf-intent-trust">Free to start. Your taste stays yours and is never sold.</p>
        </div>
      </header>
    </>
  );
}
