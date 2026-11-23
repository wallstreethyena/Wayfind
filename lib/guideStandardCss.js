// The ONE stylesheet for the guide standard frame: article measure, intro,
// partner disclosure, numbered sections. Moved verbatim out of the
// app/guides/[slug] template so every guide (template or dedicated route)
// renders the same rules through app/components/GuideStandardShell.js.
// Edit here, never re-declare these selectors in a guide's own CSS.
export const GUIDE_STANDARD_CSS = `
.wf-guide-article{max-width:860px;margin:0 auto}
.wf-guide-intro{max-width:760px;font-family:Georgia,"Times New Roman",serif;font-size:21px;line-height:1.55;color:#F1F5F9}
.wf-guide-disclosure{font-size:13px;line-height:1.5;color:#94A3B8;margin:12px 0 20px;padding:0}
.wf-guide-pick{display:grid;grid-template-columns:76px minmax(0,1fr);gap:22px;position:relative;margin:0;padding:31px 4px;border-radius:0;background:transparent;border:0;border-top:1px solid #2D3748;box-shadow:none;color:#F1F5F9}
.wf-guide-pick:last-of-type{border-bottom:1px solid #2D3748}
.wf-guide-number{font:600 49px/1 Georgia,"Times New Roman",serif;color:#68778d;letter-spacing:-2px;padding-top:3px;text-shadow:0 1px 18px rgba(104,119,141,.14)}
.wf-guide-pick h2{font-size:31px;color:#F1F5F9!important}
.wf-guide-pick>p{color:#94A3B8!important}
@media(max-width:760px){
 .wf-guide-article{padding-top:2px}
 .wf-guide-intro{font-size:17px!important;line-height:1.5!important;margin:14px 2px 16px!important}
 .wf-guide-disclosure{margin:10px 2px 16px!important;padding:0 0 10px!important;font-size:12.5px!important;line-height:1.5!important}
 .wf-guide-pick{grid-template-columns:35px minmax(0,1fr);gap:11px;padding:21px 2px!important}
 .wf-guide-number{font-size:29px;letter-spacing:-1px;color:#7f8da1}
 .wf-guide-pick h2{font-size:22px!important;line-height:1.15!important;margin:3px 0 8px!important}
 .wf-guide-pick p{font-size:14px!important;line-height:1.5!important;margin-bottom:10px!important}
 .wf-guide-pick .wf-guide-tip{font-size:13px!important;margin:6px 0 2px!important}
}
/* Live deal cards (app/guides/[slug]/GuideDealCards.js), shared by template
   guides and GuideStandardShell guides so a ticket card is styled everywhere.
   Sized so the whole card is one tap target on a phone, and min-width:0 on the
   text column stops a long merchant name forcing the grid wider than the viewport. */
.wf-gd-wrap{margin:34px 0 0}
.wf-gd-h{font-size:22px;color:#F1F5F9;margin:0 2px 12px}
.wf-gd-list{list-style:none;margin:0;padding:0}
.wf-gd-card{display:grid;grid-template-columns:96px minmax(0,1fr);gap:14px;align-items:start;text-decoration:none;color:inherit;background:#141c27;border:1px solid #2D3748;border-radius:14px;padding:12px;margin:0 0 10px;transition:border-color .15s ease}
.wf-gd-card:hover{border-color:#FBBF24}
.wf-gd-photo{position:relative;display:block;width:fit-content}.wf-gd-img{width:96px;height:96px;object-fit:cover;border-radius:10px;display:block;background:#0d131b}.wf-gd-credit{position:absolute;left:4px;right:4px;bottom:4px;margin:0;color:rgba(255,255,255,.6);font-size:9px;font-weight:500;line-height:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 2px rgba(0,0,0,.65)}
.wf-gd-body{min-width:0}
.wf-gd-top{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.wf-gd-title{font-size:16px;font-weight:750;color:#F1F5F9;overflow-wrap:anywhere}
.wf-gd-badge{flex:none;font-size:11px;font-weight:750;color:#0B0F14;background:#FBBF24;border-radius:999px;padding:2px 8px}
.wf-gd-merchant{font-size:12.5px;color:#94A3B8;margin-top:3px;overflow-wrap:anywhere}
.wf-gd-details{font-size:13.5px;color:#c8d1dd;line-height:1.45;margin:7px 0 0;overflow-wrap:anywhere}
.wf-gd-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:9px;flex-wrap:wrap}
.wf-gd-loc{font-size:12px;color:#94A3B8;min-width:0;overflow-wrap:anywhere}
.wf-gd-cta{flex:none;font-size:13px;font-weight:750;color:#FBBF24}
.wf-gd-ends{font-size:12.5px;color:#94A3B8;margin-top:5px}
.wf-gd-disc{font-size:12.5px;color:#94A3B8;line-height:1.45;margin:12px 2px 0}
@media(max-width:760px){
.wf-gd-card{grid-template-columns:72px minmax(0,1fr);gap:11px;padding:10px}
.wf-gd-img{width:72px;height:72px}
.wf-gd-h{font-size:19px}
}
`;
