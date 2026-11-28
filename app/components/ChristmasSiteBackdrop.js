"use client";

import { useLayoutEffect } from "react";
import { CHRISTMAS_SITE_CSS, installChristmasBackdropClock } from "../../lib/christmasBackdrop.js";
import { styleHtml } from "../../lib/styleHtml.js";
import dynamic from "next/dynamic";
import { FestivalLights } from "./ChristmasDecor.js";

// Snow loads after the page, never in first load JS: the root layout ships on
// every page and the homepage budget (scripts/check-bundle.mjs) has no room.
const ChristmasSnow = dynamic(() => import("./ChristmasSnow.js").then((m) => m.ChristmasSnow), { ssr: false });

// Fixed red field, doodles, gentle snow and garland, the same look as
// /christmas-in-florida (owner 2026-11-28). Hidden unless html[data-wf-xmas="on"]
// and the page is not one that already owns a theme (see CHRISTMAS_SITE_CSS).
export default function ChristmasSiteBackdrop() {
  useLayoutEffect(() => installChristmasBackdropClock(document.documentElement), []);
  return (
    <>
      <style dangerouslySetInnerHTML={styleHtml(CHRISTMAS_SITE_CSS)} />
      <div className="wf-xmas-bg" aria-hidden="true">
        <div className="xm-doodles" />
        <div className="xm-sparkles" />
        <ChristmasSnow />
      </div>
      <div className="wf-xmas-lights" aria-hidden="true">
        <FestivalLights />
      </div>
    </>
  );
}
