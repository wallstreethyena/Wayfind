"use client";

import { useLayoutEffect } from "react";
import { CHRISTMAS_SITE_CSS, installChristmasBackdropClock } from "../../lib/christmasBackdrop.js";
import { styleHtml } from "../../lib/styleHtml.js";
import { FestivalLights } from "./ChristmasDecor.js";

// Fixed red field, doodles and garland. Hidden unless html[data-wf-xmas="on"]
// and the page is not one that already owns a theme (see CHRISTMAS_SITE_CSS).
export default function ChristmasSiteBackdrop() {
  useLayoutEffect(() => installChristmasBackdropClock(document.documentElement), []);
  return (
    <>
      <style dangerouslySetInnerHTML={styleHtml(CHRISTMAS_SITE_CSS)} />
      <div className="wf-xmas-bg" aria-hidden="true">
        <div className="xm-doodles" />
        <div className="xm-sparkles" />
      </div>
      <div className="wf-xmas-lights" aria-hidden="true">
        <FestivalLights />
      </div>
    </>
  );
}
