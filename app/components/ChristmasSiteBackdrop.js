"use client";

import { useLayoutEffect } from "react";
import { CHRISTMAS_SITE_CSS, installChristmasBackdropClock } from "../../lib/christmasBackdrop.js";
import { styleHtml } from "../../lib/styleHtml.js";
import { PremiumGarland } from "./ChristmasDecor.js";

// Fixed midnight navy field with a warm gold glow, and the premium gold
// garland (owner 2026-11-24: no doodles, no cartoon bulbs, no wine red). Hidden unless html[data-wf-xmas="on"]
// and the page is not one that already owns a theme (see CHRISTMAS_SITE_CSS).
export default function ChristmasSiteBackdrop() {
  useLayoutEffect(() => installChristmasBackdropClock(document.documentElement), []);
  return (
    <>
      <style dangerouslySetInnerHTML={styleHtml(CHRISTMAS_SITE_CSS)} />
      <div className="wf-xmas-bg" aria-hidden="true" />
      <div className="wf-xmas-lights" aria-hidden="true">
        <PremiumGarland />
      </div>
    </>
  );
}
