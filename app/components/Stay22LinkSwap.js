import Script from "next/script";

// Stay22 LinkSwap — SCOPED (2026-09-22 click-hijack fix).
//
// Render this ONLY on a route that contains a genuine, PLAIN (unwrapped) OTA
// search link for Stay22 to rewrite into a commission-earning one — today
// that is exactly app/best-beaches/[metro]/page.js's "Stay near <beach>"
// Booking.com search link (the "house hotel pattern": we emit a plain
// booking.com URL and LinkSwap upgrades it to whichever partner pays most).
// Every OTHER hotel/booking surface on Wayfind (BookingCTA, the place detail
// sheet, /api/hotels/go) earns through the SERVER-side, integrity-gated path
// in lib/affiliates.js + lib/hotelRedirect.js and needs no client script at
// all — do not import this component "just in case" a page might benefit;
// only import it where a raw partner href like the one above actually exists.
//
// WHY THIS IS NOT IN app/layout.js ANYMORE: scripts.stay22.com/letmeallez.js
// ships two products in one file — (a) the link rewriter this component
// exists to keep, and (b) "nova", an unrelated pop-under ad product that
// fires on ANY click anywhere on the page, link or not (a window-level
// 'whitespace' + 'touchstart' listener feeding overPop()/underPop()/
// underTab(), each a window.open(...)). Loading LinkSwap site-wide is what
// made guide pages with zero hotel links pop a stay22.com tab (one of
// Stay22's partners is Expedia — matches the owner's report) on an ordinary
// background-div click with no href. Reproduced 2026-09-22 on
// /guides/pintos-farm-miami-2026, /guides and /: every page's
// /ext/partner/load beacon echoed back disablepop=false, i.e. nova was ON
// everywhere. scripts/check-no-sitewide-autolinker.mjs pins this component
// out of app/layout.js and out of any file not on its explicit allowlist.
//
// disablepop:true turns nova off — verified against the params Stay22's own
// script echoes back on its /ext/partner/load beacon (disablepop was false
// before this change; setting it true here reduces the fetched popup surface
// to zero regardless). LinkSwap's actual link-rewriting job (the reason this
// component exists) is untouched — disableLinkSwap / disableHyperlink stay
// unset. Even scoped, a page can have plenty of non-link background — the
// config flag is the belt to the route-scoping's suspenders.
//
// Loads on the FIRST user interaction (pointer/key/scroll), the same
// TBT-saving gate the site-wide version used.
export default function Stay22LinkSwap() {
  return (
    <>
      <link rel="preconnect" href="https://scripts.stay22.com" />
      <Script
        id="stay22-linkswap"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `(function(){var loaded=false;function load(){if(loaded)return;loaded=true;try{window.Stay22=window.Stay22||{};window.Stay22.params={lmaID:'6a4ea3011b2dc5741859a3fc',disablepop:true};var s=document.createElement('script');s.async=1;s.src='https://scripts.stay22.com/letmeallez.js';s.onerror=function(){};(document.head||document.documentElement).appendChild(s);}catch(e){}['pointerdown','keydown','touchstart','scroll'].forEach(function(ev){window.removeEventListener(ev,load,{passive:true})});}['pointerdown','keydown','touchstart','scroll'].forEach(function(ev){window.addEventListener(ev,load,{passive:true,once:true})});})();`,
        }}
      />
    </>
  );
}
