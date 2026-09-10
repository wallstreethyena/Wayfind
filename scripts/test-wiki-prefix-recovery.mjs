#!/usr/bin/env node
// Regression lock for the Wikimedia stage-1 candidate search. MediaWiki
// opensearch is prefix-oriented: a stored Google name with a trailing generic
// noun can get [] even when the real article is one word shorter/different.
// This calls the real shared candidate helper and then the real Commons photo
// resolver with a hermetic fetch router.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripWikiTrailingGenericNoun, wikiSearchCandidate } from "../lib/popularity.js";
import { findCommonsPhoto } from "../lib/commonsPhotos.js";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };

const emptySearch = (q) => [q, [], [], []];
const searchHit = (q, title) => [q, [title], [""], [`https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`]];
const json = (body, status = 200) => Response.json(body, { status });

function candidateFetch(routes) {
  const queries = [];
  const fetchImpl = async (url) => {
    const u = new URL(String(url));
    if (u.searchParams.get("action") !== "opensearch") throw new Error("unexpected URL " + url);
    const q = u.searchParams.get("search") || "";
    queries.push(q);
    return json(Object.prototype.hasOwnProperty.call(routes, q) ? routes[q] : emptySearch(q));
  };
  return { fetchImpl, queries };
}

ok(stripWikiTrailingGenericNoun("Fort De Soto Beach") === "Fort De Soto", "Beach is a trailing generic place noun Wayfind may strip once");
ok(stripWikiTrailingGenericNoun("The Ringling Museum") === "The Ringling", "Museum uses the same existing Wikipedia place-type vocabulary");
ok(stripWikiTrailingGenericNoun("Village Center") === "Village Center", "bare Center stays untouched because the identity vocabulary deliberately excludes ambiguous center");
ok(stripWikiTrailingGenericNoun("Lido Key") === "Lido Key", "a non-generic proper-name ending is never stripped");

{
  const { fetchImpl, queries } = candidateFetch({
    "Fort De Soto Beach": emptySearch("Fort De Soto Beach"),
    "Fort De Soto": searchHit("Fort De Soto", "Fort De Soto Park"),
  });
  const found = await wikiSearchCandidate("Fort De Soto Beach", fetchImpl);
  ok(found?.candidate?.title === "Fort De Soto Park", "the historical Fort De Soto Beach miss recovers to its park article");
  ok(found?.strategy === "generic_suffix", "the recovered match records that the generic-suffix lane was used");
  eq(queries, ["Fort De Soto Beach", "Fort De Soto"], "the fix spends exactly one semantic retry after the raw miss");
  ok(found.candidate.sim >= 0.55, "the fallback candidate is still scored against the original stored name");
}

{
  const { fetchImpl, queries } = candidateFetch({
    "Test Museum": searchHit("Test Museum", "Test Museum"),
  });
  const found = await wikiSearchCandidate("Test Museum", fetchImpl);
  ok(found?.candidate?.title === "Test Museum" && found.strategy === "raw", "a normal raw hit is unchanged");
  eq(queries, ["Test Museum"], "a raw hit never pays for a second search");
}

{
  const { fetchImpl, queries } = candidateFetch({
    "Museum of Illusions - Las Vegas": emptySearch("Museum of Illusions - Las Vegas"),
    "Museum of Illusions": searchHit("Museum of Illusions", "Museum of Illusions"),
  });
  const found = await wikiSearchCandidate("Museum of Illusions - Las Vegas", fetchImpl);
  ok(found?.candidate?.title === "Museum of Illusions" && found.strategy === "qualifier", "the pre-existing qualifier retry still works");
  eq(queries, ["Museum of Illusions - Las Vegas", "Museum of Illusions"], "existing qualifier recovery stays one retry when it resolves");
}

{
  // Safety control: stripping "Beach" from this name can expose the COUNTY
  // article. Its name similarity clears the old 0.55 floor, so accepting any
  // prefix candidate would create a new wrong-entity path. The new generic
  // retry only admits a title that itself still carries Wayfind's existing
  // place-type evidence (Park/Museum/Beach/etc.). "Manatee County, Florida"
  // has none and must stay rejected before page/photo work.
  const { fetchImpl, queries } = candidateFetch({
    "Manatee County Beach": emptySearch("Manatee County Beach"),
    "Manatee County": searchHit("Manatee County", "Manatee County, Florida"),
  });
  const found = await wikiSearchCandidate("Manatee County Beach", fetchImpl);
  ok(found?.candidate == null, "generic stripping cannot turn Manatee County Beach into the county article");
  eq(queries, ["Manatee County Beach", "Manatee County"], "the safety rejection happens after the one allowed prefix retry, not by disabling recovery");
}

{
  const { fetchImpl, queries } = candidateFetch({ "MOSI": emptySearch("MOSI") });
  const found = await wikiSearchCandidate("MOSI", fetchImpl);
  ok(found?.candidate == null, "a genuine no-candidate result remains a miss");
  eq(queries, ["MOSI"], "a name without a removable qualifier/generic noun is never broadened");
}

// End-to-end Commons proof: raw opensearch says no, the one-word-shorter query
// finds Fort De Soto Park, the EXISTING identity gate sees matching coordinates,
// the Commons license gate sees CC BY-SA, and a real photo object comes out.
{
  const queries = [];
  const calls = [];
  const fetchImpl = async (url) => {
    const u = new URL(String(url));
    calls.push(String(url));
    if (u.searchParams.get("action") === "opensearch") {
      const q = u.searchParams.get("search") || "";
      queries.push(q);
      if (q === "Fort De Soto Beach") return json(emptySearch(q));
      if (q === "Fort De Soto") return json(searchHit(q, "Fort De Soto Park"));
      return json(emptySearch(q));
    }
    if (u.hostname === "en.wikipedia.org" && (u.searchParams.get("prop") || "").includes("pageprops")) {
      return json({ query: { pages: { 10: {
        title: "Fort De Soto Park",
        pageprops: { "wikibase-shortdesc": "County park in Florida, United States" },
        coordinates: [{ lat: 27.6164, lon: -82.7375 }],
        categories: [{ title: "Category:Parks in Pinellas County, Florida" }],
        extract: "Fort De Soto Park is a county park in Florida.",
      } } } });
    }
    if (u.hostname === "en.wikipedia.org" && u.searchParams.get("prop") === "pageimages") {
      return json({ query: { pages: { 10: { pageimage: "Fort_De_Soto_Beach.jpg", original: { source: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Fort_De_Soto_Beach.jpg", width: 1600, height: 900 } } } } });
    }
    if (u.hostname === "commons.wikimedia.org") {
      return json({ query: { pages: { 11: { imageinfo: [{
        url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Fort_De_Soto_Beach.jpg",
        width: 1600, height: 900,
        descriptionurl: "https://commons.wikimedia.org/wiki/File:Fort_De_Soto_Beach.jpg",
        extmetadata: { Artist: { value: "Fixture photographer" }, License: { value: "cc-by-sa-4.0" }, LicenseShortName: { value: "CC BY-SA 4.0" } },
      }] } } } });
    }
    throw new Error("unexpected URL " + url);
  };
  let rejected = null;
  const photo = await findCommonsPhoto({ name: "Fort De Soto Beach", lat: 27.6164, lng: -82.7375 }, { fetch: fetchImpl, onReject: (r) => { rejected = r; } });
  ok(!!photo, "Commons resolver now recovers an identity-verified, free-licensed Fort De Soto photo after the prefix miss");
  ok(rejected === null, "successful prefix recovery never writes a rejection reason");
  eq(queries, ["Fort De Soto Beach", "Fort De Soto"], "Commons uses the same shared candidate search contract");
  ok(calls.some((u) => u.includes("prop=pageprops")) && calls.some((u) => u.includes("commons.wikimedia.org")), "identity and license verification still run after the broader candidate search");
}

// Wiring lock: popularity and Commons must share the one candidate helper so a
// future fix cannot land in one pipeline and silently leave the other behind.
{
  const popularity = readFileSync(new URL("../lib/popularity.js", import.meta.url), "utf8");
  const commons = readFileSync(new URL("../lib/commonsPhotos.js", import.meta.url), "utf8");
  ok(/fetchWikipedia[\s\S]*wikiSearchCandidate\(place\.name/.test(popularity), "popularity calls the shared candidate helper");
  ok(/wikiSearchCandidate/.test(commons) && /await wikiSearchCandidate\(place\.name, doFetch\)/.test(commons), "Commons calls the same candidate helper with its observed fetch wrapper");
}

console.log(`test-wiki-prefix-recovery: ${checks} assertions passed`);
