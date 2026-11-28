"use client";
// Idle mount for re-engagement (lib/reengageClient.js). Renders nothing, and does
// nothing, until the window `load` event has fired; ./reengageBoot.js then waits
// for idle, so it can never touch first paint or LCP. Off entirely unless this
// build was cut with NEXT_PUBLIC_WF_REENGAGE=1. Opted out visitors (Global
// Privacy Control, owner, bots) get no cookie, no stored state and no banner.
//
// First load JS budget (scripts/check-bundle.mjs): this file is in the root
// layout, so it imports NOTHING but React and holds only the load listener.
// Everything else (confirm, idle scheduling, the client module, the banner) is
// in ./reengageBoot.js, fetched after load. The literal env compare lets the
// bundler drop the whole effect when the flag is off.
import { useEffect, useState } from "react";

export default function ReengageMount() {
  const [Banner, setBanner] = useState(null);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_WF_REENGAGE !== "1") return undefined;
    let cancel = null;
    let gone = false;
    const go = () => {
      import("./reengageBoot").then((m) => {
        if (!gone) cancel = m.boot(window, (C) => setBanner(() => C));
      }, () => {});
    };
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
    return () => {
      gone = true;
      window.removeEventListener("load", go);
      if (cancel) cancel();
    };
  }, []);

  return Banner ? <Banner /> : null;
}
