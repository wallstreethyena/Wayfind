import { chromium } from 'playwright';
const [,, widthArg, tag, cssFile] = process.argv;
const width = Number(widthArg);
const css = cssFile ? (await import('node:fs')).readFileSync(cssFile,'utf8') : '';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const ctx = await b.newContext({ viewport:{width, height:1000}, deviceScaleFactor:1,
  geolocation:{latitude:27.5875, longitude:-82.4251}, permissions:['geolocation'], locale:'en-US' });
const p = await ctx.newPage();
await p.goto('http://localhost:3000/', { waitUntil:'domcontentloaded', timeout:60000 });
await p.waitForTimeout(9000);
if (css) await p.evaluate((c)=>{const t=document.createElement('style');t.textContent=c;document.body.appendChild(t);}, css);
await p.waitForTimeout(1200);
const m = await p.evaluate(() => {
  const q=s=>document.querySelector(s); const r=e=>e?{x:Math.round(e.getBoundingClientRect().x),w:Math.round(e.getBoundingClientRect().width)}:null;
  const nav=q('.wf-bottom-nav'); const nr=nav?nav.getBoundingClientRect():null;
  return { vw:innerWidth, shell:r(q('.wf-shell')), cols:r(q('.wf-cols')), colMain:r(q('.wf-col-main')),
    topbar:r(q('.wf-topbar')), nav: nr?{x:Math.round(nr.x),w:Math.round(nr.width),top:Math.round(nr.top)}:null,
    scrollPad:(()=>{const s=q('.wf-cols')?.parentElement?.parentElement;return s?getComputedStyle(s).padding:null})() };
});
console.log(JSON.stringify(m));
await p.screenshot({ path:`/tmp/shots/${tag}-top.png` });
await p.evaluate(()=>{const s=document.querySelector('.wf-cols').closest('[style*="overflow"]')||document.scrollingElement; s.scrollTop=520;});
await p.waitForTimeout(900);
await p.screenshot({ path:`/tmp/shots/${tag}-mid.png` });
await b.close();
