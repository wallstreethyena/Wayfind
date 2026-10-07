// Test harness for scripts/check-guide-card.mjs: the REAL guide card inside the
// REAL PhotoPolicyProvider (the policy a /guides route mounts), in ONE module
// graph so the card and the provider share the same context object.
// (jsxLoad injects the React binding, so it is not imported here.)
import { PhotoPolicyProvider } from "../../app/components/PhotoPolicy.js";
import GuideDiscoveryCard from "../../app/components/GuideDiscoveryCard.js";

export default function GuideCardUnderPhotoPolicy(props) {
  return <PhotoPolicyProvider><GuideDiscoveryCard {...props} /></PhotoPolicyProvider>;
}
