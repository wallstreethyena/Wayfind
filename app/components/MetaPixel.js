"use client";
// app/components/MetaPixel.js — loads the Meta (Facebook / Instagram) pixel
// once, site-wide, the same way GoogleTags.js loads gtag.js.
//
// Jobs, in order:
//   1. Load fbevents.js and init the pixel (dataset "Wayfind Website"; the id
//      and its default live in lib/metaPixel.js).
//   2. Send PageView on App Router client navigations — the init snippet only
//      covers the first, hard-loaded page.
// Product events (Lead / ViewContent / AddToWishlist / CompleteRegistration)
// are forwarded from home.js's logEvent through lib/metaPixel.forwardToMeta.
//
// NATIVE SHELL: no pixel at all. Same reasoning as GoogleTags: a third-party
// advertising pixel inside the iOS app is "tracking" under Apple's definition,
// and the app ships no ATT prompt. The gate sits BELOW every hook (hooks must
// never be conditional) and ABOVE the <Script> render.
import Script from "next/script";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { metaPixelId, trackMetaPageView } from "../../lib/metaPixel";
import { isNative } from "../../lib/native";
import { isGroupPlanPath } from "../../lib/groupPlanPrivacy.js";

export default function MetaPixel() {
  const pathname = usePathname();
  const firstRun = useRef(true);
  const id = metaPixelId();

  useEffect(() => {
    if (isGroupPlanPath(pathname)) return;
    if (firstRun.current) { firstRun.current = false; return; }
    try { trackMetaPageView(pathname); } catch (e) {}
  }, [pathname]);

  if (isNative()) return null;
  if (isGroupPlanPath(pathname)) return null;
  if (!id) return null;

  return (
    <>
      <Script id="meta-pixel-init" strategy="afterInteractive">
        {`
          !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${id}');
          fbq('track', 'PageView');
        `}
      </Script>
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          alt=""
          src={`https://www.facebook.com/tr?id=${id}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}
