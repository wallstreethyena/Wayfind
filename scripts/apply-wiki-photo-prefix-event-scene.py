from pathlib import Path


def read(path): return Path(path).read_text()
def write(path, s): Path(path).write_text(s)
def repl(path, old, new, count=1):
    s=read(path); n=s.count(old)
    if n != count: raise SystemExit(f'{path}: expected {count} matches, got {n}: {old[:120]!r}')
    write(path, s.replace(old,new,count))

p='lib/popularity.js'
repl(p, 'function stripWikiQualifier(name) {', 'export function stripWikiQualifier(name) {')
needle='''const WIKI_PLACE_TYPE_RE = /\\b(museums?|zoos?|aquariums?|beaches?|landmarks?|monuments?|theatres?|theaters?|parks?|gardens?|stadiums?|arenas?|preserves?|refuges?|sanctuar(?:y|ies)|attractions?|recreation areas?|historic (?:sites?|landmarks?|districts?|houses?|places?)|historical (?:sites?|landmarks?|districts?)|hotels?|resorts?|restaurants?|caf[eé]s?|brewer(?:y|ies)|marinas?|winer(?:y|ies)|distiller(?:y|ies)|universit(?:y|ies)|college campus(?:es)?|observator(?:y|ies)|amusement parks?|water parks?|wildlife|shopping malls?|forts?|plantations?|piers?|boardwalks?|lighthouses?|memorials?|palaces?|castles?|fairgrounds?|cemeter(?:y|ies)|planetariums?|stepwells?|caverns?|cave systems?|visitor centers?|squares?|plazas?|shipwrecks?|aviar(?:y|ies)|arboretums?|conservator(?:y|ies))\\b/i;'''
insert = needle + r'''

// One vocabulary, two jobs. The same place-type evidence that is trusted by
// verifyWikiIdentity decides whether the LAST word of a Google place name is a
// generic noun we may remove for ONE prefix-search retry. That prevents a
// second, drifting noun list from becoming a new matcher.
export function wikiPlaceTypeEvidence(text) {
  return WIKI_PLACE_TYPE_RE.test(String(text || ""));
}

export function stripWikiTrailingGenericNoun(name) {
  const original = String(name || "").trim();
  const match = original.match(/^(.*\S)\s+(\p{L}+)$/u);
  if (!match || !wikiPlaceTypeEvidence(match[2])) return original;
  return match[1].trim();
}

// THE single stage-1 Wikipedia candidate search used by popularity AND the
// permanent Commons-photo lane. MediaWiki opensearch is prefix-oriented, so a
// trailing descriptor can turn a real article into []. Search policy:
//   1) stored name, unchanged;
//   2) the pre-existing qualifier strip (" - City", " at Venue", etc.);
//   3) exactly one trailing generic place noun, using WIKI_PLACE_TYPE_RE above.
//
// The new third rung remains deliberately conservative. Its candidates are
// scored against the name BEFORE that final noun was removed, and the returned
// title itself must still contain trusted place-type evidence. This is what lets
// "Fort De Soto Beach" recover "Fort De Soto Park" while refusing the tempting
// but wrong "Manatee County, Florida" result for "Manatee County Beach".
export async function wikiSearchCandidate(placeName, fetchImpl) {
  const original = String(placeName || "").trim();
  const queries = [];
  let sawResponse = false;
  if (!original) return { candidate: null, strategy: null, queries, sawResponse };

  const search = async (query, scoreAgainst, strategy, requireTypedTitle = false) => {
    if (!query || queries.some((q) => q.toLowerCase() === query.toLowerCase())) return null;
    queries.push(query);
    const response = await wikiOpensearch(query, fetchImpl);
    if (response) sawResponse = true;
    const candidate = bestWikiTitle(scoreAgainst, response && response[1]);
    if (!candidate) return null;
    if (requireTypedTitle && !wikiPlaceTypeEvidence(candidate.title)) return null;
    return { candidate, strategy };
  };

  let found = await search(original, original, "raw");
  if (found) return { ...found, queries, sawResponse };

  const qualifier = stripWikiQualifier(original);
  if (qualifier && qualifier.toLowerCase() !== original.toLowerCase()) {
    found = await search(qualifier, qualifier, "qualifier");
    if (found) return { ...found, queries, sawResponse };
  }

  const genericBase = stripWikiTrailingGenericNoun(qualifier || original);
  if (genericBase && genericBase.toLowerCase() !== (qualifier || original).toLowerCase()) {
    found = await search(genericBase, qualifier || original, "generic_suffix", true);
    if (found) return { ...found, queries, sawResponse };
  }

  return { candidate: null, strategy: null, queries, sawResponse };
}
'''
repl(p, needle, insert)
old='''  const s1 = await wikiOpensearch(place.name);\n  let m = bestWikiTitle(place.name, s1 && s1[1]);\n  let s2 = null;\n  if (!m) {\n    const stripped = stripWikiQualifier(place.name);\n    if (stripped && stripped.toLowerCase() !== place.name.toLowerCase()) {\n      s2 = await wikiOpensearch(stripped);\n      m = bestWikiTitle(stripped, s2 && s2[1]);\n    }\n  }\n'''
new='''  const found = await wikiSearchCandidate(place.name);\n  const m = found.candidate;\n'''
repl(p, old, new)
repl(p, '  if (!m) { if (s1 || s2) notePop("wikipedia", "no_match"); return null; }', '  if (!m) { if (found.sawResponse) notePop("wikipedia", "no_match"); return null; }')

p='lib/commonsPhotos.js'
repl(p,
'import { wikiOpensearch, wikiPageInfo, bestWikiTitle, verifyWikiIdentity, WIKI_UA } from "./popularity.js";',
'import { wikiPageInfo, verifyWikiIdentity, wikiSearchCandidate, WIKI_UA } from "./popularity.js";')
old='''    const mark1 = since();\n    const search = await wikiOpensearch(place.name, doFetch);\n    const candidate = bestWikiTitle(place.name, search && search[1]);\n    if (!candidate) return reject(failedSince(mark1) ? "unavailable_opensearch" : "no_wiki_candidate");'''
new='''    const mark1 = since();\n    const found = await wikiSearchCandidate(place.name, doFetch);\n    const candidate = found.candidate;\n    if (!candidate) return reject(failedSince(mark1) ? "unavailable_opensearch" : "no_wiki_candidate");'''
repl(p,old,new)

p='app/components/screens/Events.js'
repl(p, 'import { rankExperiences } from "../../../lib/experiencesData";', 'import { rankExperiences } from "../../../lib/experiencesData";\nimport { eventSceneChip } from "../../../lib/eventImageDisclosure.js";')
old='''  const categoryImage = eventCategoryArt(ctx.eventBucket(e), e);\n  const image = (ctx.eventUseImage(e) ? (e.thumb || e.image) : "") || categoryImage;'''
new='''  const categoryImage = eventCategoryArt(ctx.eventBucket(e), e);\n  const providerImage = ctx.eventUseImage(e) ? (e.thumb || e.image) : "";\n  const image = providerImage || categoryImage;\n  const sceneChip = eventSceneChip(e, providerImage);'''
repl(p, old, new)
old='''    chips={venue && onVenue ? [{ key: "venue", icon: "📍", label: venue, onClick: onVenue }] : []}'''
new='''    chips={[sceneChip, venue && onVenue ? { key: "venue", icon: "📍", label: venue, onClick: onVenue } : null].filter(Boolean)}'''
repl(p, old, new)

p='scripts/guards.txt'
s=read(p)
anchor='node scripts/test-commons-photos.mjs\n'
if s.count(anchor)!=1: raise SystemExit('guards: commons anchor mismatch')
s=s.replace(anchor, anchor+'node scripts/test-wiki-prefix-recovery.mjs\n',1)
anchor2='node scripts/check-curated-events-surface.mjs\n'
if s.count(anchor2)==1:
    s=s.replace(anchor2, anchor2+'node scripts/test-event-scene-disclosure.mjs\n',1)
else:
    s=s.replace(anchor, anchor+'node scripts/test-event-scene-disclosure.mjs\n',1)
write(p,s)
print('applied photo prefix + event scene fixes')
