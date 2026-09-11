"use client";

import { useEffect, useRef, useState } from "react";

// Discover actual rendered sections, including streamed stays. Never advertise
// a video, hotel rail, or planning section that has no content on this event.
export default function EventSectionNav() {
  const ref = useRef(null);
  const [sections, setSections] = useState([]);
  useEffect(() => {
    const root = ref.current?.closest(".wf-event-wrap");
    if (!root) return;
    const update = () => {
      const next = Array.from(root.querySelectorAll("[data-event-section][id]"))
        .filter(el => !el.hidden)
        .map(el => ({ id: el.id, label: el.dataset.eventSection }));
      setSections(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "id", "data-event-section"] });
    return () => observer.disconnect();
  }, []);
  return <nav ref={ref} className="wf-event-section-nav" aria-label="Explore this event" hidden={!sections.length}>
    {sections.map(section => <a key={section.id} href={`#${section.id}`} onClick={() => {
      const target = document.getElementById(section.id);
      if (target?.tagName === "DETAILS") target.open = true;
      target?.focus({ preventScroll: true });
    }}>{section.label}</a>)}
  </nav>;
}
