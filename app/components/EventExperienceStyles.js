// Shared presentation for curated and provider event detail pages.
// Booking controls remain their existing attributed, availability-gated components.
export const EVENT_EXPERIENCE_CSS = `
.wf-event-experience,.wf-event-experience *,.wf-event-experience *:before,.wf-event-experience *:after{box-sizing:border-box}
.wf-event-experience{background:#080b10;color:#f5f4ef;font-family:var(--wf-sans);min-height:100dvh}
.wf-event-wrap{max-width:1344px;margin:0 auto;padding:28px 48px 70px}
.wf-event-experience a:focus-visible,.wf-event-experience button:focus-visible{outline:3px solid #ff782f;outline-offset:5px}
.wf-event-brand{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-bottom:28px}
.wf-event-brand img{width:145px;height:auto}
.wf-event-hero{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(330px,1fr);gap:28px;align-items:start;margin:24px 0 40px}
.wf-event-hero--no-photo{grid-template-columns:minmax(0,800px)}
.wf-event-photo{position:relative;background:#141a16;border:1px solid #27313d;border-radius:20px;overflow:hidden;min-width:0}
.wf-event-photo img{display:block;width:100%;height:660px;object-fit:contain;background:#111612}
.wf-event-booking{padding:30px;border:1px solid #27313d;border-radius:20px;background:#111821;min-width:0}
.wf-event-booking>a,.wf-event-booking a[rel~="sponsored"]{max-width:100%;white-space:normal;text-align:center;overflow-wrap:anywhere;line-height:1.4!important}
.wf-event-booking h1{font-size:clamp(32px,3.5vw,48px)!important;line-height:1.07!important;letter-spacing:-1.4px;color:#f5f4ef!important;font-weight:600!important;margin:16px 0 24px!important;overflow-wrap:anywhere}
.wf-event-eyebrow{color:#ff9a55;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600}
.wf-event-date{font-size:18px;line-height:1.5;color:#d7dde5;margin:0 0 20px}
.wf-event-price{font-size:24px;line-height:1.4;font-weight:600;margin:24px 0 12px;color:#f5f4ef}
.wf-event-booking-note{font-size:13px;line-height:1.6;color:#aab4c2;margin:14px 0 0}
.wf-event-summary{border-top:1px solid #27313d;padding-top:22px;margin-top:22px}
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
.wf-event-experience .wfw-near{padding:10px 28px 28px}
.wf-event-experience .wfw-near h3{font-size:28px;font-weight:600;margin:18px 0 12px}
.wf-event-experience .wfw-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px}
.wf-event-experience .wfw-p{display:block;padding:0;border:0;background:transparent;border-radius:14px}
.wf-event-experience .wfw-th{display:block;width:100%;height:auto;aspect-ratio:9/16;overflow:hidden;border-radius:14px;background:#17202b}
.wf-event-experience .wfw-p img{width:100%;height:100%;border-radius:14px;object-fit:cover}
.wf-event-experience .wfw-n{left:12px;top:12px;width:30px;height:30px;border:2px solid #fff;background:#2EC9A6;color:#0D1117}
.wf-event-experience .wfw-b{display:block;padding:16px 0 8px}
.wf-event-experience .wfw-b b{font-size:18px;line-height:1.35;white-space:normal;font-weight:600}
.wf-event-experience .wfw-b small{flex-wrap:wrap;font-size:13px;line-height:1.5}
.wf-event-experience .wfw-foot{font-size:13px;line-height:1.65;color:#aab4c2;padding:0 28px 24px}
.wf-event-experience .wfev-you:before{animation:none}
@media(max-width:800px){.wf-event-wrap{padding:20px 20px 48px}.wf-event-hero{grid-template-columns:1fr;gap:18px;margin:20px 0 30px}.wf-event-photo img{height:auto;max-height:480px;min-height:240px}.wf-event-booking{padding:24px}.wf-event-booking h1{font-size:36px!important}.wf-event-experience .wfw-head{padding:22px}.wf-event-experience .wfw-map{padding:0 8px 8px}.wf-event-experience .wfev-h{height:420px}.wf-event-experience .wfw-near{padding:10px 20px 24px}.wf-event-experience .wfw-grid{display:flex;overflow-x:auto;scroll-snap-type:x proximity;gap:16px;padding-bottom:16px}.wf-event-experience .wfw-p{flex:0 0 76%;min-width:0;scroll-snap-align:start}.wf-event-content{margin-top:30px}.wf-event-experience .wfw-foot{padding:0 20px 24px}.wf-event-brand{flex-wrap:wrap}.wf-event-experience .wfw-btn{white-space:normal;line-height:1.4}}
@media(prefers-reduced-motion:reduce){.wf-event-experience *{scroll-behavior:auto!important;transition:none!important}}
`;
export default function EventExperienceStyles(){return <style dangerouslySetInnerHTML={{__html:EVENT_EXPERIENCE_CSS}} />;}
