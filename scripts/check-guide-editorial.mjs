// Runtime contracts for the blog-wide audit. CSS parsing is not a mobile visual test.
// Protects explicit image ownership, complete hub coverage, and the actual SSR hero.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { GUIDES } from '../lib/guides.js';
import { guideHero, GUIDE_HERO_ART, GUIDE_IMAGE_BRIEFS } from '../lib/guideHero.js';
import { guideImageProblems, duplicateImageGroups } from '../lib/guideImagePolicy.js';
import { createHash } from 'node:crypto';
import { guideRegions } from '../lib/guideIndex.js';

let checks = 0;
function ok(value, message) { assert.ok(value, message); checks++; }
const require = createRequire(import.meta.url);
const imageSize = require('next/dist/compiled/image-size');
function dimensionsMatch(art, dimensions) {
  return art.width === dimensions.width && art.height === dimensions.height;
}
const slugs = Object.keys(GUIDES);
const pageSource = fs.readFileSync(path.resolve('app/guides/[slug]/page.js'), 'utf8');
const hubSource = fs.readFileSync(path.resolve('app/guides/page.js'), 'utf8');
const tracked = new Set(execFileSync('git', ['ls-files', 'public'], { encoding: 'utf8' }).trim().split('\n'));
ok(tracked.size > 0, 'tracked image inventory is nonempty');
ok(slugs.length > 0, 'the guide registry is nonempty before measuring coverage');
ok(slugs.length === 42, `the reviewed publication set remains 42 guides (got ${slugs.length})`);
ok(pageSource.includes('<div style={S.page} className="wf-guide-editorial">') && !pageSource.includes('<main style={S.page}'), 'guide route uses a div inside the application main landmark');
ok(hubSource.includes('<div className={styles.page}>') && !hubSource.includes('<main className={styles.page}>'), 'guide index uses a div inside the application main landmark');
ok(!pageSource.includes('Seasonal menus can change'), 'the general source register has no blanket seasonal-menu label');
function missingArt(guides, art) { return Object.keys(guides).filter((slug) => !Object.hasOwn(art, slug)); }
ok(missingArt(GUIDES, GUIDE_HERO_ART).length === 0, 'every published guide has an explicit art record');
const removed = { ...GUIDE_HERO_ART };
delete removed['fall-events-orlando-2026'];
ok(missingArt(GUIDES, removed).includes('fall-events-orlando-2026'), 'negative control detects the missing fall record');
ok(missingArt({ ...GUIDES, 'new-city-guide': {} }, GUIDE_HERO_ART).includes('new-city-guide'), 'new guide cannot silently inherit generic art');
const beachBrief = { subjects: ['beach'], locations: ['Siesta Key'], allowIllustrative: false };
const positiveArt = { kind: 'documentary', subject: 'beach', depictedLocation: 'Siesta Key', src: '/guides/beach.webp', source: 'https://unsplash.com/photos/example', license: 'Unsplash License', licenseUrl: 'https://unsplash.com/license', alt: 'Shoreline', caption: 'Siesta Key shoreline', credit: 'Photographer', reviewedAt: '2026-09-10', reviewNotes: 'Fixture only' };
ok(guideImageProblems(positiveArt, beachBrief).length === 0, 'positive control accepts a matching documented image');
ok(guideImageProblems({ ...positiveArt, subject: 'nightclub' }, beachBrief).includes('wrong-subject'), 'negative control rejects a nightclub for a beach');
ok(guideImageProblems({ ...positiveArt, depictedLocation: 'Fort Myers' }, beachBrief).includes('wrong-location'), 'negative control rejects a different named location');
ok(guideImageProblems({ ...positiveArt, kind: 'illustrative' }, { ...beachBrief, allowIllustrative: true }).includes('undisclosed-or-disallowed-illustration'), 'negative control rejects stock without a visible disclosure');
ok(guideImageProblems({ ...positiveArt, source: 'https://example.com/image', license: 'Free' }, beachBrief).includes('unsupported-rights'), 'negative control rejects an unsupported rights claim');
ok(guideImageProblems({ ...positiveArt, source: 'https://commons.wikimedia.org/wiki/File:Beach.jpg', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', modificationNotice: 'Resized to WebP' }, beachBrief).length === 0, 'positive control accepts a documented Commons license');
ok(guideImageProblems({ kind: 'unavailable', src: null, reason: 'No suitable licensed image' }, beachBrief).length === 0, 'explicit source gap permits a readable image-free state');
ok(guideImageProblems({ kind: 'unavailable', src: '/wrong.jpg' }, beachBrief).length > 0, 'negative control rejects unavailable records carrying a wrong photograph');
ok(duplicateImageGroups({ first: positiveArt, second: { ...positiveArt, src: '/guides/another-crop.webp' } }).length === 1, 'different crops of the same source are detected as reuse');
const pixelIdentity = (art) => createHash('sha256').update(fs.readFileSync(path.resolve('public' + art.src))).digest('hex');
for (const group of [...duplicateImageGroups(GUIDE_HERO_ART), ...duplicateImageGroups(GUIDE_HERO_ART, pixelIdentity)]) {
  ok(group.every(slug => GUIDE_HERO_ART[slug].reuseReason?.trim()), `shared image has an explicit editorial reuse decision: ${group.join(', ')}`);
}
for (const slug of slugs) {
  const art = guideHero(slug);
  ok(art === GUIDE_HERO_ART[slug], `${slug}: resolver uses the explicit record`);
  ok(guideImageProblems(art, GUIDE_IMAGE_BRIEFS[slug]).length === 0, `${slug}: reviewed image facts match the subject, location and rights brief`);
  if (art.kind === 'unavailable') {
    ok(!art.src && art.reason?.trim(), `${slug}: source gap is explicit, no unrelated fallback`);
    continue;
  }
  ok(art.src?.startsWith('/') && !art.src.startsWith('//'), `${slug}: self-hosted art`);
  ok(art.alt?.trim() && art.caption?.trim(), `${slug}: meaningful image description and caption`);
  ok(art.source?.trim() && art.credit?.trim() && art.license?.trim(), `${slug}: source and rights recorded`);
  ok(art.source.startsWith('https://') && art.licenseUrl.startsWith('https://'), `${slug}: rights are linked to the reviewed source`);
  ok(art.width > 0 && art.height > 0, `${slug}: actual dimensions recorded`);
  ok(tracked.has('public' + art.src), `${slug}: image is tracked for deployment`);
  const file = path.resolve('public' + art.src);
  ok(fs.existsSync(file) && fs.statSync(file).size > 1000, `${slug}: image bytes exist`);
  const bytes = fs.readFileSync(file);
  ok(bytes.length <= 600000, `${slug}: optimized hero stays at or below 600 KB`);
  ok(dimensionsMatch(art, imageSize(bytes)), `${slug}: recorded dimensions match the deployed image bytes`);
}
const dimensionArt = Object.values(GUIDE_HERO_ART).find(art => art.src);
ok(Boolean(dimensionArt), 'at least one actual photograph remains before checking dimensions');
const dimensionControl = imageSize(fs.readFileSync(path.resolve('public' + dimensionArt.src)));
ok(!dimensionsMatch({ ...dimensionArt, width: dimensionControl.width + 1 }, dimensionControl), 'negative control detects an incorrect recorded image width');
ok(guideHero('unknown-guide') !== guideHero('fall-events-orlando-2026'), 'unknown guides do not pretend to be the fall guide');
const heroSource = fs.readFileSync(path.resolve('lib/guideHero.js'), 'utf8');
function hasLegacyDateSelector(source) {
  return /\/[^/\n]*\bdate\b[^/\n]*\/\.test\(haystack\)/.test(source);
}
ok(!hasLegacyDateSelector(heroSource), 'hero resolver has no legacy date substring selector');
ok(hasLegacyDateSelector("const haystack = title; if (/restaurant|food|date/.test(haystack)) return dining;"), 'negative control detects the old date substring selector');

const hub = guideRegions(GUIDES).flatMap((group) => group.guides.map((guide) => guide.slug));
assert.deepEqual([...hub].sort(), [...slugs].sort()); checks++;
ok(new Set(hub).size === hub.length, 'each guide appears once in the hub');
const extra = guideRegions({ ...GUIDES, 'new-region': { title: 'New region', region: 'Test Region' } });
ok(extra.some((group) => group.region === 'Test Region' && group.guides.some((guide) => guide.slug === 'new-region')), 'new regions remain discoverable without editing an allowlist');

// Compile the real server component. Stub CSS class names only; no layout claim.
const filename = path.resolve('app/components/GuideArticleHero.js');
const src = fs.readFileSync(filename, 'utf8');
const compiled = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
const photoFile = path.resolve('app/components/GuidePhoto.js');
const photoCode = ts.transpileModule(fs.readFileSync(photoFile, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
const photoModule = { exports: {} };
vm.runInNewContext(photoCode, { module: photoModule, exports: photoModule.exports, require }, { filename: photoFile });
// Exercise real component callbacks with controlled hook state: broken sources must
// terminate, and stale decode results must not suppress the next image.
let photoFailed = false;
const callbackModule = { exports: {} };
vm.runInNewContext(photoCode, { module: callbackModule, exports: callbackModule.exports,
  require: name => name === 'react' ? { useState: () => [photoFailed, value => { photoFailed = value; }] } : require(name)
}, { filename: photoFile });
const photoProps = { src: '/guides/test.webp', width: 1600, height: 1000 };
const wrapper = callbackModule.exports.default(photoProps);
let photoTree = wrapper.type(wrapper.props);
ok(photoTree.type === 'img', 'photo first render requests its explicit source');
photoTree.props.onError();
photoTree = wrapper.type(wrapper.props);
ok(photoTree.type === 'div' && !photoTree.props.src && photoTree.props['data-guide-photo-fallback'] !== undefined, 'load failure ends in neutral content without a fallback request');
photoFailed = false;
photoTree = wrapper.type(wrapper.props);
photoTree.props.onLoad({ currentTarget: { decode: () => Promise.reject(new Error('bad bytes')), isConnected: true, getAttribute: () => photoProps.src } });
await Promise.resolve();
ok(photoFailed, 'decode rejection also ends the image attempt');
photoFailed = false;
photoTree.props.onLoad({ currentTarget: { decode: () => Promise.reject(new Error('stale bytes')), isConnected: false, getAttribute: () => '/guides/previous.webp' } });
await Promise.resolve();
ok(!photoFailed, 'detached stale decode does not blank the current source');
ok(callbackModule.exports.default({ ...photoProps, src: '/guides/new.webp' }).key !== wrapper.key, 'new source resets keyed error state');

const mod = { exports: {} };
const css = new Proxy({}, { get: (_target, name) => String(name) });
vm.runInNewContext(compiled, { module: mod, exports: mod.exports, require: (name) => {
  if (name === './GuidePhoto') return photoModule.exports;
  if (name.endsWith('.css')) return { __esModule: true, default: css };
  if (name.includes('seasonalBrand')) return { activeSeasonalMark: () => null, NORMAL_MARK: { png: '/brand/wayfind-wordmark-transparent-v2.png', width: 1707, height: 441 } };
  return require(name);
} }, { filename });
const Hero = mod.exports.default;
function renderedImageSources(html) {
  return [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]);
}
ok(renderedImageSources('<header data-guide-hero-src="/marker-only.webp"><h1>Guide</h1></header>').length === 0, 'negative control does not mistake a QA data attribute for a rendered image');
for (const slug of slugs) {
  const guide = GUIDES[slug], art = guideHero(slug);
  const html = renderToStaticMarkup(React.createElement(Hero, { ...guide, image: art, actions: React.createElement('button', null, 'Share') }));
  ok((html.match(/<h1\b/g) || []).length === 1, `${slug}: one semantic headline`);
  if (art.kind === 'unavailable') {
    ok(!html.includes('<figure') && !html.includes('data-guide-hero-src'), `${slug}: no rejected photo or deceptive fallback is rendered`);
    ok(html.includes('href="#guide"') && html.includes('>Share</button>'), `${slug}: source gap preserves reading and sharing`);
    continue;
  }
  ok(html.includes('data-guide-hero="true"') && html.includes(`data-guide-hero-src="${art.src}"`), `${slug}: rendered hero exposes its selected asset for read-only QA`);
  ok(renderedImageSources(html).includes(art.src), `${slug}: an actual rendered img selects the explicit hero asset`);
  ok(html.indexOf('<h1') < html.indexOf('<figure'), `${slug}: answer heading comes before hero photograph`);
  ok(html.includes('href="#guide"') && html.includes('>Share</button>'), `${slug}: reading and sharing actions survive`);
  ok(!html.includes('A better decision') && !html.includes('distilled into'), `${slug}: no generic marketing gate`);
  ok(html.includes('loading="eager"') && html.toLowerCase().includes('fetchpriority="high"'), `${slug}: hero is prioritized`);
}
const noImage = renderToStaticMarkup(React.createElement(Hero, { title: 'A useful guide', image: null }));
ok(noImage.includes('A useful guide') && !noImage.includes('<figure'), 'missing art preserves readable content without a broken image');
assert.throws(() => renderToStaticMarkup(React.createElement(Hero, {})), /requires a title/); checks++;
// Read the actual navigation for each article, including the longest list.
const navFile = path.resolve('app/guides/[slug]/GuideEditorial.js');
const navCode = ts.transpileModule(fs.readFileSync(navFile, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
const navModule = { exports: {} };
vm.runInNewContext(navCode, { module: navModule, exports: navModule.exports, require }, { filename: navFile });
const halloweenFood = GUIDES['orlando-halloween-food-2026'];
ok(halloweenFood?.picks?.some((pick) => pick.image), 'positive control confirms the Halloween food record carries legacy generated illustrations');
ok(halloweenFood.picks.every((pick) => navModule.exports.guidePickImage('orlando-halloween-food-2026', pick) === null), 'Halloween food guide renders none of its generated pick illustrations');
ok(navModule.exports.guidePickImage('another-guide', { image: '/documentary.webp' }) === '/documentary.webp', 'image suppression stays scoped to the Halloween food guide');
for (const slug of slugs) {
  const guide = GUIDES[slug];
  const nav = renderToStaticMarkup(React.createElement(navModule.exports.GuideReadingNav, { guide }));
  ok((nav.match(/href="#pick-/g) || []).length === guide.picks.length, `${slug}: every stop has a navigation link`);
  ok(nav.includes('<details') && nav.includes('<summary'), `${slug}: long contents are keyboard-operable and collapsible`);
}
console.log(`check-guide-editorial: OK — ${checks} assertions; ${slugs.length} image records and rendered headers; ${guideRegions(GUIDES).length} hub regions. Browser visual review is separate.`);
