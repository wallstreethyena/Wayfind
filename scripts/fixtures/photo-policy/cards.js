// Fixture for scripts/test-google-photo-attribution.mjs: the real shared
// cards rendered inside and outside the real PhotoPolicyProvider, compiled as
// ONE module graph so the provider and the cards share one React context.
import RailCard from "../../../app/components/RailCard";
import IconicPlaceCard from "../../../app/components/IconicPlaceCard";
import { PhotoPolicyProvider } from "../../../app/components/PhotoPolicy";

const NOOP = () => {};

export function Rail({ strict, photo, photoAttr = null, photoAttrHref = null, place }) {
  const card = <RailCard title="Fixture Place" photo={photo} photoAttr={photoAttr} photoAttrHref={photoAttrHref} place={place} rank={1} href="/p/x" onSave={NOOP} onLike={NOOP} onDislike={NOOP} onShare={NOOP} />;
  return strict ? <PhotoPolicyProvider requireGoogleCredit>{card}</PhotoPolicyProvider> : card;
}

export function Iconic({ strict, place, photoAttr = null, photoAttrHref = null }) {
  const card = <IconicPlaceCard place={place} rank={1} href="/p/x" photoAttr={photoAttr} photoAttrHref={photoAttrHref} onSave={NOOP} onLike={NOOP} onDislike={NOOP} onShare={NOOP} />;
  return strict ? <PhotoPolicyProvider requireGoogleCredit>{card}</PhotoPolicyProvider> : card;
}
