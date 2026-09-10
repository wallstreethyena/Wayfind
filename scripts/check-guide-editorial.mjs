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
import { guideHero, GUIDE_HERO_ART } from '../lib/guideHero.js';
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
ok(slugs.length === 41, `the reviewed publication set remains 41 guides (got ${slugs.length})`);
ok(pageSource.includes('<div style={S.page} className="wf-guide-editorial">') && !pageSource.includes('<main style={S.page}'), 'guide route uses a div inside the application main landmark');
ok(hubSource.includes('<div className={styles.page}>') && !hubSource.includes('<main className={styles.page}>'), 'guide index uses a div inside the application main landmark');
ok(!pageSource.includes('Seasonal menus can change'), 'the general source register has no blanket seasonal-menu label');
function missingArt(guides, art) { return Object.keys(guides).filter((slug) => !Object.hasOwn(art, slug)); }
function unsplashRightsProblems(art) {
  const problems = [];
  let sourceHost = '';
  try { sourceHost = new URL(art?.source).hostname.toLowerCase(); } catch {}
  if (!(sourceHost === 'unsplash.com' || sourceHost.endsWith('.unsplash.com'))) problems.push('source-host');
  if (art?.license !== 'Unsplash License') problems.push('license');
  return problems;
}
ok(missingArt(GUIDES, GUIDE_HERO_ART).length === 0, 'every published guide has an explicit art record');
const removed = { ...GUIDE_HERO_ART };
delete removed['fall-events-orlando-2026'];
ok(missingArt(GUIDES, removed).includes('fall-events-orlando-2026'), 'negative control detects the missing fall record');
ok(missingArt({ ...GUIDES, 'new-city-guide': {} }, GUIDE_HERO_ART).includes('new-city-guide'), 'new guide cannot silently inherit generic art');
const positiveArt = { source: 'https://unsplash.com/photos/example', license: 'Unsplash License' };
ok(unsplashRightsProblems(positiveArt).length === 0, 'positive control accepts an Unsplash photo page and Unsplash License');
ok(unsplashRightsProblems({ ...positiveArt, source: 'https://commons.wikimedia.org/wiki/File:example' }).includes('source-host'), 'negative control rejects a non-Unsplash source');
ok(unsplashRightsProblems({ ...positiveArt, license: 'CC BY-SA 4.0' }).includes('license'), 'negative control rejects a non-Unsplash license');
for (const slug of slugs) {
  const art = guideHero(slug);
  ok(art === GUIDE_HERO_ART[slug], `${slug}: resolver uses the explicit record`);
  ok(art.src?.startsWith('/') && !art.src.startsWith('//'), `${slug}: self-hosted art`);
  ok(art.alt?.trim() && art.caption?.trim(), `${slug}: meaningful image description and caption`);
  ok(art.source?.trim() && art.credit?.trim() && art.license?.trim(), `${slug}: source and rights recorded`);
  ok(unsplashRightsProblems(art).length === 0, `${slug}: source is on unsplash.com and license is Unsplash License`);
  ok(art.width > 0 && art.height > 0, `${slug}: actual dimensions recorded`);
  ok(tracked.has('public' + art.src), `${slug}: image is tracked for deployment`);
  const file = path.resolve('public' + art.src);
  ok(fs.existsSync(file) && fs.statSync(file).size > 1000, `${slug}: image bytes exist`);
  const bytes = fs.readFileSync(file);
  ok(bytes.length <= 600000, `${slug}: optimized hero stays at or below 600 KB`);
  ok(dimensionsMatch(art, imageSize(bytes)), `${slug}: recorded dimensions match the deployed image bytes`);
}
const dimensionControl = imageSize(fs.readFileSync(path.resolve('public' + GUIDE_HERO_ART[slugs[0]].src)));
ok(!dimensionsMatch({ ...GUIDE_HERO_ART[slugs[0]], width: dimensionControl.width + 1 }, dimensionControl), 'negative control detects an incorrect recorded image width');
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
const mod = { exports: {} };
const css = new Proxy({}, { get: (_target, name) => String(name) });
vm.runInNewContext(compiled, { module: mod, exports: mod.exports, require: (name) => {
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
