// EditorialLandingHero — the editorial-landing look, as a template.
//
// WHY THIS EXISTS
// /best-beaches/[metro] is the page the owner points at as the standard: serif
// headline, full-bleed editorial hero, "Stop searching. Start choosing.", then
// the quick-answer grid. It was bespoke — markup and ~70 lines of CSS inline in
// that one route. A cuisine chooser sheet is coming that must look identical,
// and the obvious way to build it is to copy this page. That produces a second
// bespoke copy, and two copies drift.
//
// This repo has already paid for that lesson twice in one day: three art maps
// each holding their own copy of the same path (#449), and a fallback photo
// duplicated across page families (#454). A shared look needs ONE
// implementation and per-surface CONTENT, not per-surface markup.
//
// CONTENT IN, LAYOUT FIXED. Every string, image and list is a prop. Nothing
// about beaches, cuisine or any other subject appears below.
//
// THE CLASS PREFIX IS A PARAMETER, and it defaults to the beach page's existing
// prefix on purpose. Re-pointing that page had to produce BYTE-IDENTICAL HTML —
// it is the reference implementation, so any visual change means the extraction
// was wrong, not that the design moved. A second surface passes its own prefix
// so two instances on one document cannot collide.
//
// The back control keeps its own global class (`wf-back-control`, styled in
// parts.js) and is NOT prefixed — the last rule below reaches into it, and that
// selector is shared by every page using BackControl.

export function editorialHeroCss(prefix = "wf-beach-premium") {
  const P = prefix;
  return `
.${P}-wrap{padding:22px 22px 8px}
.${P}-hero{
  position:relative;
  display:grid;
  grid-template-columns:minmax(0,.92fr) minmax(500px,1.08fr);
  width:min(1180px,100%);
  min-height:620px;
  margin:0 auto;
  overflow:hidden;
  border:1px solid rgba(255,255,255,.32);
  border-radius:30px;
  background:#F5EFE5;
  box-shadow:0 32px 90px rgba(0,0,0,.48),inset 0 1px rgba(255,255,255,.7);
}
.${P}-media{position:relative;min-height:620px;overflow:hidden;background:#101923}
/* v8.29.5 — 620px IS A PROMISE ABOUT CONTENT THAT IS NOT ALWAYS KEPT. The hero
   holds that height for the quick-answer grid, and the intent pages
   (/worth-the-drive, /hidden-gems, /date-night…) have no server data for it —
   so the panel drew a headline, a deck, a rule and then a hand-sized void
   above the Share button. Owner: "there is nothing there."
   When the grid is genuinely absent the whole hero tightens instead of holding
   the gap open. :has() is already used elsewhere in this codebase's CSS and
   degrades to the old height on anything that lacks it. */
.${P}-hero:not(:has(.${P}-picks)){min-height:462px}
.${P}-hero:not(:has(.${P}-picks)) .${P}-media{min-height:462px}
.${P}-media>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.${P}-media:after{
  content:"";
  position:absolute;
  inset:0;
  background:linear-gradient(180deg,rgba(2,8,15,.12),rgba(2,8,15,.08) 35%,rgba(2,8,15,.82) 100%),linear-gradient(90deg,transparent 70%,rgba(5,10,16,.16));
}
/* v6.73 — THE WORDMARK NEVER SITS INSIDE THE HERO PHOTO.
   It was position:absolute at top:24px;left:50% — dead centre of the image, which
   is exactly where a subject's face lands. Owner screenshot: the mark printed
   across a person's forehead. Art-directing every hero image does not scale and
   would break the moment someone swaps a photo, so the LAYOUT must not depend on
   where faces are. The mark now lives in a slim bar ABOVE the media box, where no
   photo can ever collide with it.
   The same bar carries the back affordance — see .${P}-back below. */
.${P}-chrome{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:0 4px 12px}
.${P}-brand{display:block;width:118px;height:38px;flex:none}
.${P}-brand img{display:block;width:100%;height:100%;object-fit:contain}
/* NO WAY BACK (owner): a visitor arriving from Google had no path into the rest
   of Wayfind except browser chrome — a dead end that ends the session instead of
   feeding the funnel. This is the top-of-page half of the fix; the continue card
   at the bottom is the other half. */
.${P}-back{
  display:inline-flex;align-items:center;gap:6px;flex:none;
  padding:7px 12px 7px 9px;border-radius:999px;
  border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.05);
  color:#CBD5E1;font-size:13px;font-weight:650;text-decoration:none;line-height:1;
  transition:border-color .15s ease,color .15s ease,background .15s ease;
}
.${P}-back:hover{border-color:rgba(232,201,122,.5);color:#F4F6F8;background:rgba(255,255,255,.09)}
.${P}-back:focus-visible{outline:2px solid #FBBF24;outline-offset:2px}
.${P}-image-copy{position:absolute;z-index:2;left:42px;right:36px;bottom:42px}
.${P}-image-kicker{display:flex;align-items:center;gap:9px;color:#FFC08F;font-size:10px;font-weight:850;letter-spacing:.2em;text-transform:uppercase}
.${P}-image-kicker:before{content:"";width:28px;height:1px;background:#F97316}
.${P}-image-title{max-width:430px;margin:13px 0 0;color:#FFF;font-family:Georgia,'Times New Roman',serif;font-size:45px;font-weight:400;letter-spacing:-.035em;line-height:.98;text-wrap:balance;text-shadow:0 3px 18px rgba(0,0,0,.52)}
.${P}-panel{display:flex;min-width:0;flex-direction:column;padding:54px 58px 38px;color:#111824;background:radial-gradient(circle at 100% 0,rgba(249,115,22,.07),transparent 33%),linear-gradient(145deg,#FBF7EF,#F3EBDD)}
.${P}-topline{display:flex;align-items:center;justify-content:space-between;gap:16px;color:#5D6878;font-size:9.5px;font-weight:850;letter-spacing:.18em;text-transform:uppercase}
.${P}-location{display:inline-flex;align-items:center;gap:7px;color:#B84E0D;letter-spacing:.12em;white-space:nowrap}
.${P}-location:before{content:"";width:7px;height:7px;border-radius:50%;background:#F97316;box-shadow:0 0 0 4px rgba(249,115,22,.12)}
.${P}-panel h1{max-width:620px;margin:28px 0 14px;color:#111824;font-family:Georgia,'Times New Roman',serif;font-size:47px;font-weight:400;letter-spacing:-.045em;line-height:1.01;text-wrap:balance}
.${P}-dek{max-width:590px;margin:0;color:#596476;font-size:14.5px;font-weight:520;line-height:1.52}
.${P}-dek strong{display:block;margin-bottom:5px;color:#B84E0D;font-size:16px;font-weight:850;letter-spacing:-.015em}
.${P}-rule{height:1px;margin:26px 0 20px;background:rgba(17,24,36,.16)}
.${P}-quick-title{margin-bottom:12px;color:#596476;font-size:9.5px;font-weight:850;letter-spacing:.17em;text-transform:uppercase}
.${P}-picks{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid rgba(17,24,36,.13)}
.${P}-pick{min-width:0;padding:12px 12px 11px 0;border-bottom:1px solid rgba(17,24,36,.13)}
.${P}-pick:nth-child(even){padding-left:18px;border-left:1px solid rgba(17,24,36,.13)}
.${P}-pick-label{display:block;margin-bottom:3px;color:#B85515;font-size:8px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
.${P}-pick-name{display:block;overflow:hidden;color:#111824;font-size:12.5px;font-weight:760;line-height:1.25;text-overflow:ellipsis;white-space:nowrap}
.${P}-footer{display:flex;align-items:center;gap:16px;margin-top:auto;padding-top:24px}
.${P}-trust{display:flex;align-items:flex-start;gap:8px;color:#6B7585;font-size:10.5px;font-weight:650;line-height:1.35}
.${P}-trust svg{flex:0 0 auto;margin-top:1px;color:#A87A21}
.${P}-hero .wf-back-control{position:absolute!important;z-index:5!important;top:18px!important;left:18px!important;margin:0!important;background:rgba(4,8,16,.54)!important;box-shadow:0 8px 24px rgba(0,0,0,.24)}
@media(max-width:860px){
  .${P}-wrap{padding:12px 12px 4px}
  .${P}-hero{grid-template-columns:1fr;min-height:0;border-radius:24px}
  .${P}-media{min-height:330px}
  .${P}-image-copy{left:24px;right:24px;bottom:26px}
  .${P}-image-title{max-width:360px;font-size:38px}
  .${P}-panel{padding:34px 30px 30px}
  .${P}-panel h1{margin-top:20px;font-size:40px}
}
@media(max-width:520px){
  .${P}-wrap{padding:0}
  .${P}-hero{border-width:0 0 1px;border-radius:0}
  .${P}-media{min-height:280px}
  .${P}-chrome{padding:0 2px 10px}.${P}-brand{width:104px;height:34px}.${P}-back{padding:8px 12px;font-size:12.5px}
  .${P}-image-copy{left:22px;right:20px;bottom:23px}
  .${P}-image-title{font-size:34px}
  .${P}-panel{padding:28px 22px 26px}
  .${P}-topline{align-items:flex-start;flex-direction:column;gap:8px}
  .${P}-panel h1{margin:18px 0 12px;font-size:36px}
  .${P}-dek{font-size:13.5px}
  .${P}-rule{margin:22px 0 18px}
  .${P}-picks{grid-template-columns:1fr}
  .${P}-pick:nth-child(even){padding-left:0;border-left:0}
  .${P}-footer{align-items:stretch;flex-direction:column-reverse;gap:13px;padding-top:21px}
}
`;
}

// The shield in the trust row. Part of the look, not of any one subject.
function TrustShield() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 19 6v5c0 4.6-2.9 8-7 10-4.1-2-7-5.4-7-10V6l7-3Z" /><path d="m9.5 12 1.6 1.6 3.5-4" /></svg>
  );
}

/**
 * @param prefix       CSS class prefix. Keep the default for /best-beaches.
 * @param backControl  the BackControl element (a client island; passed in so
 *                     this stays a server component)
 * @param heroImg      full-bleed image path
 * @param imageKicker  small caps line over the image title
 * @param imageTitle   serif line ON the image
 * @param toplineLeft  small caps line above the headline
 * @param toplineRight right-aligned location pill text
 * @param headlineId   id for aria-labelledby
 * @param headline     the serif <h1> content (node, so it can interpolate)
 * @param dekLead      the bold promise line ("Stop searching. Start choosing.")
 * @param dekBody      the sentence after it
 * @param quickTitle   label above the quick-answer grid
 * @param quickPicks   [{ label, name }] — renders nothing when empty
 * @param actionSlot   the share/CTA element (a client island)
 * @param trustLines   [line1, line2] beside the shield
 */
export default function EditorialLandingHero({
  prefix = "wf-beach-premium",
  backControl = null,
  heroImg = null,
  brandHref = "/",
  // Where "back" goes. Defaults to the app root so a surface that forgets to
  // pass one still has a way out — a dead end is the bug being fixed.
  backHref = "/",
  backLabel = "Wayfind",
  imageKicker = null,
  imageTitle = null,
  toplineLeft = null,
  toplineRight = null,
  headlineId = "wf-editorial-title",
  headline = null,
  dekLead = null,
  dekBody = null,
  quickTitle = null,
  quickPicks = [],
  actionSlot = null,
  trustLines = [],
}) {
  const P = prefix;
  const picks = Array.isArray(quickPicks) ? quickPicks : [];
  return (
    <header className={`${P}-wrap`}>
      {/* Chrome bar, OUTSIDE the hero card. It has to live here rather than inside
          the card for two reasons found at 390px: inside, it inherited the cream
          panel background and the light back-link text was barely legible; and the
          wordmark must never sit over the photo (owner: the mark printed across a
          subject's forehead). A page that already supplies its own backControl
          renders THAT here instead of the default link — one back affordance per
          page, never two stacked. */}
      <div className={`${P}-chrome`}>
        {backControl || (
          <a className={`${P}-back`} href={backHref} aria-label={backLabel}>
            <span aria-hidden="true">&#8249;</span>{backLabel}
          </a>
        )}
        <a className={`${P}-brand`} href={brandHref} aria-label="Wayfind home">
          <img src="/brand/wayfind-wordmark-transparent-v2.png" alt="Wayfind" />
        </a>
      </div>
      <section className={`${P}-hero`} aria-labelledby={headlineId}>
        <div className={`${P}-media`}>
          {heroImg && <img src={heroImg} alt="" />}
          <div className={`${P}-image-copy`}>
            <div className={`${P}-image-kicker`}>{imageKicker}</div>
            <div className={`${P}-image-title`}>{imageTitle}</div>
          </div>
        </div>
        <div className={`${P}-panel`}>
          <div className={`${P}-topline`}>
            <span>{toplineLeft}</span>
            <span className={`${P}-location`}>{toplineRight}</span>
          </div>
          <h1 id={headlineId}>{headline}</h1>
          {/* No space between </strong> and the body sentence — the dek's bold
              lead is display:block, so a joining space would render as a stray
              leading space on the second line. */}
          <p className={`${P}-dek`}><strong>{dekLead}</strong>{dekBody}</p>
          <div className={`${P}-rule`} />
          {picks.length ? (
            <>
              <div className={`${P}-quick-title`}>{quickTitle}</div>
              <div className={`${P}-picks`}>
                {picks.map((pick) => (
                  <div className={`${P}-pick`} key={pick.label + pick.name}>
                    <span className={`${P}-pick-label`}>{pick.label}</span>
                    <span className={`${P}-pick-name`}>{pick.name}</span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
          <div className={`${P}-footer`}>
            {actionSlot}
            <div className={`${P}-trust`}>
              <TrustShield />
              <span>{trustLines[0]}<br />{trustLines[1]}</span>
            </div>
          </div>
        </div>
      </section>
    </header>
  );
}
