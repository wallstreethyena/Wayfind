// The Wayfind brand entity for structured data (SEO audit, 2026-11-27).
//
// One definition, referenced by @id: the site-wide graph in app/layout.js and
// the /about page both use it, so Google reads one organization with one
// founder instead of a bare legal name ("WAYFIND LLC") with one social link.
// Every value here is already stated on /about or in the footer: operated by
// WAYFIND LLC, founded by Gabriel Pereira, based in the Sarasota-Bradenton area
// of Florida, contact hello@gowayfind.com. sameAs lists only profiles Wayfind
// owns. Plain module (no JSX) so scripts/test-brand-entity.mjs can call it.
import { SITE_URL } from "./site.js";

export const ORG_ID = SITE_URL + "/#organization";
export const WEBSITE_ID = SITE_URL + "/#website";
export const FOUNDER_ID = SITE_URL + "/about#gabriel-pereira";

export const BRAND_SAME_AS = [
  "https://www.instagram.com/gowayfind.app/",
  "https://www.crunchbase.com/organization/wayfind-67f6",
  "https://www.f6s.com/wayfind-florida",
];

const SITE_DESCRIPTION = "Wayfind decides what's actually worth your time. Places are ranked on merit. Rankings are never for sale.";

export function founderNode() {
  return { "@type": "Person", "@id": FOUNDER_ID, name: "Gabriel Pereira", url: SITE_URL + "/about", jobTitle: "Founder", worksFor: { "@id": ORG_ID } };
}

export function organizationNode() {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: "Wayfind",
    legalName: "WAYFIND LLC",
    alternateName: ["GoWayfind", "gowayfind.com"],
    url: SITE_URL,
    email: "hello@gowayfind.com",
    logo: { "@type": "ImageObject", url: SITE_URL + "/icon-512.png", width: 512, height: 512 },
    description: "Wayfind ranks things to do, places to eat, events and tours across Florida, starting on the Sarasota-Bradenton Gulf Coast, on live merit signals. Rankings are never for sale.",
    founder: { "@id": FOUNDER_ID },
    address: { "@type": "PostalAddress", addressRegion: "FL", addressCountry: "US" },
    areaServed: { "@type": "State", name: "Florida" },
    sameAs: BRAND_SAME_AS,
  };
}

export function websiteNode() {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: "Wayfind",
    url: SITE_URL,
    inLanguage: "en-US",
    description: SITE_DESCRIPTION,
    publisher: { "@id": ORG_ID },
    potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: SITE_URL + "/?q={search_term_string}" }, "query-input": "required name=search_term_string" },
  };
}

export function siteGraph() {
  return { "@context": "https://schema.org", "@graph": [websiteNode(), organizationNode(), founderNode()] };
}

export function aboutPageLd() {
  return {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    "@id": SITE_URL + "/about",
    url: SITE_URL + "/about",
    name: "About Wayfind",
    isPartOf: { "@id": WEBSITE_ID },
    about: { "@id": ORG_ID },
    mainEntity: { "@id": ORG_ID },
  };
}
