// Shared presentation for curated and provider event detail pages.
// Booking controls remain their existing attributed, availability-gated components.
export const EVENT_EXPERIENCE_CSS = `
.wf-event-experience,.wf-event-experience *,.wf-event-experience *:before,.wf-event-experience *:after{box-sizing:border-box}
.wf-event-experience{background:#080b10;color:#f5f4ef;font-family:var(--wf-sans);min-height:100dvh}
.wf-event-wrap{max-width:1344px;margin:0 auto;padding:28px 48px 70px}
.wf-event-experience a:focus-visible,.wf-event-experience button:focus-visible{outline:3px solid #ff782f;outline-offset:5px}
.wf-event-brand{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-bottom:28px}
.wf-event-brand img{width:145px;height:auto}
.wf-event-hero{display:block;margin:24px auto 40px;max-width:980px;border:1px solid #27313d;border-radius:24px;background:#111821;overflow:hidden}
/* The wrapper owns portrait geometry; intrinsic image dimensions cannot stretch the rail. */
.wf-event-media{min-width:0;max-width:100%}.wf-event-media>p{padding:0 24px}
.wf-event-media h2{font-size:20px;font-weight:600;margin:0 0 16px}
.wf-event-photo-rail{display:flex;align-items:flex-start;gap:16px;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x proximity;padding:0 0 16px;max-width:100%;border-radius:18px}
.wf-event-photo-rail:focus-visible{outline:3px solid #ff782f;outline-offset:4px}
.wf-event-photo{position:relative;flex:0 0 252px;width:252px;height:448px;max-width:100%;background:#141a16;border:1px solid #27313d;border-radius:18px;overflow:hidden;min-width:0;scroll-snap-align:start}
.wf-event-photo img{display:block;width:100%;height:100%;object-fit:cover;background:#111612}
.wf-event-hero .wf-event-photo-rail{padding:0;gap:12px;border-radius:0}.wf-event-hero .wf-event-photo{height:clamp(240px,42vw,440px);border:0;border-radius:0}.wf-event-hero .wf-event-photo:first-child{flex:0 0 100%;width:100%}
.wf-event-photo-fallback{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:linear-gradient(155deg,#1B2433,#0D1117);color:#FFC08F}
.wf-event-photo-fallback span{font-size:36px;font-weight:800}
.wf-event-photo-fallback small{font-size:12px;color:#aab4c2}
.wf-event-booking{padding:30px;border:0;background:#111821;min-width:0}
.wf-event-booking>a,.wf-event-booking a[rel~="sponsored"]{max-width:100%;white-space:normal;text-align:center;overflow-wrap:anywhere;line-height:1.4!important}
.wf-event-booking h1{font-size:clamp(32px,3.5vw,48px)!important;line-height:1.07!important;letter-spacing:-1.4px;color:#f5f4ef!important;font-weight:600!important;margin:16px 0 24px!important;overflow-wrap:anywhere}
.wf-event-eyebrow{color:#ff9a55;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600}
.wf-event-date{font-size:18px;line-height:1.5;color:#d7dde5;margin:0 0 20px}
.wf-event-price{font-size:24px;line-height:1.4;font-weight:600;margin:24px 0 12px;color:#f5f4ef}
.wf-event-booking-note{font-size:13px;line-height:1.6;color:#aab4c2;margin:14px 0 0}
.wf-event-summary{display:grid;gap:12px;border-top:1px solid #27313d;padding-top:22px;margin:22px 0 0}
.wf-event-fact{display:grid;grid-template-columns:100px minmax(0,1fr);gap:14px;font-size:15px;line-height:1.5;min-width:0}
.wf-event-fact dt{color:#9eaab7;font-weight:600}
.wf-event-fact dd{margin:0;min-width:0;overflow-wrap:anywhere;color:#e6edf3}
.wf-event-reason{margin-top:24px;line-height:1.6;overflow-wrap:anywhere}
.wf-event-reason h2{font-size:19px;font-weight:600;margin:18px 0 8px}
.wf-event-reason p:last-child{margin-bottom:0!important}
.wf-event-actions{display:flex;flex-direction:column;gap:18px;border-top:1px solid #27313d;padding-top:24px;margin-top:24px;min-width:0;isolation:isolate}
.wf-event-actions>*,.wf-event-actions>section{margin:0!important;min-width:0;max-width:100%}
.wf-event-actions button{max-width:100%;white-space:normal;overflow-wrap:anywhere;line-height:1.4}
.wf-event-secondary-actions>div{display:flex;flex-wrap:wrap;gap:10px}
.wf-event-story{margin:0;line-height:1.6}
.wf-event-story-label{color:#ff9a55;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase}

.wf-event-section-nav{position:sticky;top:0;z-index:20;display:flex;gap:8px;overflow-x:auto;overscroll-behavior-x:contain;padding:12px 0;background:#080b10;border-bottom:1px solid #27313d;scrollbar-width:thin}.wf-event-section-nav[hidden]{display:none}.wf-event-section-nav a{flex:0 0 auto;padding:10px 16px;border:1px solid #394553;border-radius:999px;color:#ffad72;text-decoration:none;font-size:14px;font-weight:600;white-space:nowrap}.wf-event-section-nav a:hover{background:#231a14;border-color:#ff9a55}.wf-event-experience [data-event-section]{scroll-margin-top:88px}.wf-event-experience [data-event-section]:focus{outline:none}
.wf-event-content{max-width:820px;margin:40px auto 0;line-height:1.75}
.wf-event-experience .wfw{margin:40px 0}
.wf-event-experience .wfw-card{background:#111821;border:1px solid #27313d;box-shadow:none;border-radius:20px}
.wf-event-experience .wfw-card:before{display:none}
.wf-event-experience .wfw-head{padding:28px}
.wf-event-experience .wfw-name{font-weight:600;font-size:30px;letter-spacing:-.8px}
.wf-event-experience .wfw-k{color:#ff9a55;font-weight:600;letter-spacing:1.5px;font-size:12px}
.wf-event-experience .wfw-map{padding:0 18px 18px}
.wf-event-experience .wfev-h{height:520px}
.wf-event-experience .wfw-dir{box-shadow:none;background:#ff782f;color:#171108}
.wf-event-experience .wfw-near{padding:14px 16px 8px}
.wf-event-experience .wfw-near h3{font-size:20px;font-weight:600;margin:0 0 10px}








.wf-event-experience .wfw-foot{font-size:12px;line-height:1.4;color:#aab4c2;padding:0 20px 8px}
.wf-event-experience .wfev-you:before{animation:none}
@media(max-width:800px){.wf-event-wrap{padding:20px 20px 48px}.wf-event-hero{grid-template-columns:1fr;gap:18px;margin:20px 0 30px}.wf-event-photo{flex-basis:216px;width:216px;height:384px}.wf-event-booking{padding:24px}.wf-event-fact{grid-template-columns:86px minmax(0,1fr);gap:10px;font-size:14px}.wf-event-booking h1{font-size:36px!important}.wf-event-experience .wfw-head{padding:22px}.wf-event-experience .wfw-map{padding:0 8px 8px}.wf-event-experience .wfev-h{height:420px}.wf-event-experience .wfw-near{padding:12px 12px 6px}.wf-event-content{margin-top:30px}.wf-event-experience .wfw-foot{padding:0 14px 8px}.wf-event-brand{flex-wrap:wrap}.wf-event-experience .wfw-btn{white-space:normal;line-height:1.4}}
@media(max-width:380px){.wf-event-wrap{padding:16px 14px 40px}.wf-event-booking{padding:18px}.wf-event-booking h1{font-size:30px!important}.wf-event-fact{grid-template-columns:1fr;gap:2px}}
@media(prefers-reduced-motion:reduce){.wf-event-experience *{scroll-behavior:auto!important;transition:none!important}}
`;
export default function EventExperienceStyles(){return <style dangerouslySetInnerHTML={{__html:EVENT_EXPERIENCE_CSS}} />;}
