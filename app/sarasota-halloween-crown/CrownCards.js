"use client";

import { useEffect } from "react";
import RailCard from "../components/RailCard";
import { ownedPlacePhotoSrc } from "../../lib/placePhoto";
import { captureOrQueue } from "../../lib/browserAnalytics";
import {
  CROWN_CONTENDERS,
  CROWN_PATH,
  saveCrownCampaign,
  claimCrownPageView,
  crownPageViewedProps,
  contenderDestination,
  decorateCrownHref,
  contenderClickProps,
} from "../../lib/crownCampaign";

export default function CrownCards() {
  useEffect(() => {
    let fields = null;
    try { fields = saveCrownCampaign(window.location.search, window.sessionStorage); } catch { fields = null; }
    if (!claimCrownPageView()) return;
    const path = window.location.pathname || CROWN_PATH;
    captureOrQueue(window, "crown_page_viewed", crownPageViewedProps(path, fields));
  }, []);

  return (
    <ul className="wf-place-card-list" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 16 }}>
      {CROWN_CONTENDERS.map((contender) => {
        const destination = contenderDestination(contender);
        return (
          <li className="wf-place-card-slot" key={contender.slug}>
            <RailCard
              title={contender.title}
              eyebrow="Sarasota"
              facts={contender.facts}
              photo={ownedPlacePhotoSrc(contender.placeId)}
              href={destination}
              ariaLabel={contender.title}
              onOpen={() => {
                let fields = null;
                try { fields = saveCrownCampaign(window.location.search, window.sessionStorage); } catch { fields = null; }
                try {
                  captureOrQueue(window, "crown_contender_clicked", contenderClickProps(contender, window.sessionStorage));
                } catch { /* navigation still happens */ }
                window.location.assign(decorateCrownHref(destination, fields));
              }}
            />
          </li>
        );
      })}
    </ul>
  );
}
