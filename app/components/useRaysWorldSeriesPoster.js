"use client";
import { useEffect, useState } from "react";
import { RAYS_POSTER, raysCampaignLive } from "../../lib/raysWorldSeriesPoster.js";
import { fetchJsonWithDeadline } from "../../lib/clientJson.js";

export function useRaysWorldSeriesPoster(today) {
  const [complete, setComplete] = useState(false);
  const active = raysCampaignLive(today, complete);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const check = () => fetchJsonWithDeadline("/api/rays-world-series", { timeoutMs: 8000 })
      .then((status) => { if (!cancelled && status?.complete === true) setComplete(true); })
      .catch(() => {}); // Keep the poster visible until completion is confirmed.
    check();
    const timer = setInterval(check, 15 * 60 * 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [active]);
  return active ? RAYS_POSTER : null;
}
