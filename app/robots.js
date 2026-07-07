// v4.16 — robots directives; everything public, sitemap declared.
import { SITE_URL } from "../lib/site";
export default function robots() {
  return { rules: { userAgent: "*", allow: "/" }, sitemap: SITE_URL + "/sitemap.xml" };
}
