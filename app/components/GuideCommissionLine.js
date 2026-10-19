// The commission line under a guide affiliate button. One sentence, one
// component: the pick offer card and the bottom "Your next step" card both
// render this, so the wording cannot drift. Visible text, not a title
// attribute. Color is the same light body tone used on other disclosures
// (#E6EDF3 on the navy card), which clears the old slate-on-navy line.
import { GUIDE_OFFER_COMMISSION_LINE } from "../../lib/affiliateDisclosure.js";

export const GUIDE_COMMISSION_STYLE = {
  margin: "8px 0 0",
  fontSize: 13,
  lineHeight: 1.45,
  color: "#E6EDF3",
};

export function GuideCommissionLine({ lead = null }) {
  return (
    <p className="wf-guide-commission" style={GUIDE_COMMISSION_STYLE}>
      {lead ? <>{lead} </> : null}{GUIDE_OFFER_COMMISSION_LINE}
    </p>
  );
}
