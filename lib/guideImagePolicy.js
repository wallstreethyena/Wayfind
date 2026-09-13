// Human-reviewed image facts, checked against each guide's editorial brief.
// This catches contradictory metadata; visual review still has to establish the facts.
export function guideImageProblems(art, brief) {
  const issues = [];
  if (!brief) return ['missing-brief'];
  if (!art || !['documentary', 'illustrative', 'unavailable'].includes(art.kind)) return ['unreviewed-image'];
  if (art.kind === 'unavailable') {
    if (art.src || !art.reason?.trim()) issues.push('invalid-unavailable-state');
    return issues;
  }
  if (!brief.subjects.includes(art.subject)) issues.push('wrong-subject');
  if (art.kind === 'documentary' && !brief.locations.includes(art.depictedLocation)) issues.push('wrong-location');
  if (art.kind === 'illustrative' && (!brief.allowIllustrative || !/^Illustrative photo\b/.test(art.cardCaption || ''))) issues.push('undisclosed-or-disallowed-illustration');
  if (!art.reviewedAt || !art.reviewNotes?.trim()) issues.push('missing-review');
  if (!art.src?.startsWith('/guides/') || art.src.includes('..')) issues.push('invalid-asset-path');
  let source, license;
  try { source = new URL(art.source); license = new URL(art.licenseUrl); } catch { issues.push('invalid-rights-urls'); }
  if (source && license) {
    const unsplash = source.hostname === 'unsplash.com' && source.pathname.startsWith('/photos/') && art.license === 'Unsplash License' && license.href === 'https://unsplash.com/license';
    const pexels = source.hostname === 'www.pexels.com' && source.pathname.startsWith('/photo/') && art.license === 'Pexels License' && license.href === 'https://www.pexels.com/license/';
    const cc = /^CC BY(?:-SA)? (2\.0|3\.0|4\.0)$/.test(art.license || '');
    const expectedCc = cc ? `https://creativecommons.org/licenses/${art.license.includes('-SA') ? 'by-sa' : 'by'}/${art.license.split(' ').at(-1)}/` : '';
    const commons = source.hostname === 'commons.wikimedia.org' && decodeURIComponent(source.pathname).startsWith('/wiki/File:') && ((cc && license.href === expectedCc) || (art.license === 'CC0 1.0 Universal' && license.href === 'https://creativecommons.org/publicdomain/zero/1.0/')) && art.modificationNotice?.trim();
    if (source.protocol !== 'https:' || !(unsplash || pexels || commons)) issues.push('unsupported-rights');
  }
  if (!art.alt?.trim() || !art.caption?.trim() || !art.credit?.trim()) issues.push('missing-description-or-credit');
  return issues;
}

// Caller can key this by a pixel hash to detect copies under different filenames.
export function duplicateImageGroups(art, identity = (image) => image.source || image.src) {
  const groups = new Map();
  for (const [slug, image] of Object.entries(art)) {
    if (!image?.src) continue;
    const key = identity(image);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(slug);
  }
  return [...groups.values()].filter(group => group.length > 1);
}
