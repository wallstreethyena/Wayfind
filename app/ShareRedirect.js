"use client";
import { useEffect } from "react";

export default function ShareRedirect({ to }) {
  useEffect(() => {
    // v6.53: remember WHERE the user came from (another page of ours) so
    // closing the detail can return them there instead of stranding them on
    // the homepage. External/direct entries record nothing — closing simply
    // stays in the app, and back() can never eject anyone off-site.
    try {
      const ref = document.referrer;
      if (ref) {
        const u = new URL(ref);
        if (u.origin === window.location.origin && u.pathname !== "/" && !u.pathname.startsWith("/p/")) {
          sessionStorage.setItem("wf_return_to", u.pathname + u.search);
        }
      }
    } catch (e) {}
    const id = setTimeout(() => { window.location.replace(to); }, 50);
    return () => clearTimeout(id);
  }, [to]);
  return null;
}
