"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation.js";

// Home owns its in-flow feedback controls. Keep the separate public-page
// widget and form outside its initial JavaScript budget.
const SiteFeedback = dynamic(() => import("./SiteFeedback"), { ssr: false });

export default function SiteFeedbackEntry() {
  const pathname = usePathname();
  return pathname && pathname !== "/" ? <SiteFeedback /> : null;
}
