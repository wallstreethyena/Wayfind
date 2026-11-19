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
`;
