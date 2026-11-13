"use client";
import IconicPlaceCard from "../../components/IconicPlaceCard.js";
import { WF_PLACE_CARD_CSS } from "../../components/css.js";
import { C } from "../../components/kit.js";
import { styleHtml } from "../../../lib/styleHtml.js";

// A fixture place with a local repo photo. The real card shows the Reserve a table button
// for any place id the partner list returns (the preview lists demo partners).
const PLACE = {
  id: "wf-test-kitchen", place_id: "wf-test-kitchen", name: "Wayfind Test Kitchen", types: ["restaurant"], primaryCategory: "restaurant", category: "restaurant",
  rating: 4.8, reviews: 120, governed_score: 90, wfScore: 90, lat: 27.33, lng: -82.53,
  photoRef: null, photo_ref: null, photoNoSpend: true, photo: "/cards/where-to-eat.jpg",
};
const noop = () => {};

export default function TestCard() {
  return (
    <main style={{ maxWidth: 440, margin: "0 auto", padding: "24px 16px", minHeight: "100vh", background: C.bg, color: C.text }}>
      {/* The card's classes live in WF_PLACE_CARD_CSS; without it the card renders unstyled (check-place-card-css-contract). */}
      <style dangerouslySetInnerHTML={styleHtml(WF_PLACE_CARD_CSS)} />
      <h1 style={{ fontSize: 20, margin: "0 0 12px" }}>Reserve a table: test kitchen</h1>
      <p style={{ margin: "0 0 16px", fontSize: 14 }}>Preview only. Sign in, then tap Reserve a table.</p>
      <IconicPlaceCard place={PLACE} rank={1} href="/p/wf-test-kitchen" onSave={noop} onLike={noop} onDislike={noop} onShare={noop} />
    </main>
  );
}
