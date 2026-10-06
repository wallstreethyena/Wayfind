#!/usr/bin/env node
// Renders the actual page and shared event card; only Next's routing hook is
// adapted for plain Node. The product source is not rewritten for the fixture.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadComponent } from './lib/jsxLoad.mjs';
import { FAMILY_DAY_RAILS } from '../lib/familyDayTaxonomy.js';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const routerStub = path.join(ROOT, `.family-router-${process.pid}.mjs`);
writeFileSync(routerStub, 'export const useSearchParams = () => new URLSearchParams(globalThis.__familyQuery || "");\nexport const useRouter = () => ({ back() {} });\nexport const usePathname = () => "/family";\n');
try {
  const source = path.join(ROOT, 'app/components/FamilyDayPage.js');
  const { default: FamilyDayPage, FamilyEventCard } = await loadComponent(source, ROOT, { onGraph(graph) {
    let rewritten = 0;
    for (const output of graph.values()) {
      const bytes = readFileSync(output, 'utf8');
      if (bytes.includes('from "next/navigation"')) {
        writeFileSync(output, bytes.replaceAll('from "next/navigation"', `from ${JSON.stringify(routerStub)}`));
        rewritten++;
      }
    }
    assert.ok(rewritten > 0, 'the Next routing hook adapter actually ran');
  } });
  const props = { center: { lat: 27.3364, lng: -82.5307 }, city: 'Sarasota' };
  const render = (extra) => renderToStaticMarkup(React.createElement(FamilyDayPage, { ...props, ...extra }));
  globalThis.__familyQuery = '';
  const embedded = render({ embedded: true });
  assert.equal(FAMILY_DAY_RAILS.length, 9);
  assert.equal((embedded.match(/class="wf-family-section"/g) || []).length, 9);
  assert.ok(!embedded.includes('class="wf-family-filters"'));
  for (const rail of FAMILY_DAY_RAILS) {
    const part = embedded.match(new RegExp(`<section[^>]*aria-labelledby="family-${rail.id}-title"[\\s\\S]*?<\\/section>`))?.[0];
    assert.ok(part?.includes(`Within ${['water', 'animals'].includes(rail.id) ? 50 : 25} miles.`), `embedded ${rail.id} radius is disclosed on the actual heading`);
  }
  globalThis.__familyQuery = 'radiusMi=10';
  const standalone = render({ embedded: false });
  assert.equal((standalone.match(/Within 10 miles\./g) || []).length, 9);
  assert.ok(standalone.includes('class="wf-family-filters"'));
  const event = { id: 'wfc:science', name: 'Moonlight Science Night', href: '/florida-events/science-night', image: '/events/verified-science.webp', whenFact: 'Friday · 6:00 PM', venue: 'Science Hall', distMi: 4.2 };
  const withImage = renderToStaticMarkup(React.createElement(FamilyEventCard, { event }));
  assert.ok(withImage.includes('wf-place-card wf-rail-card'), 'events use the shared card renderer');
  assert.ok(withImage.includes('src="/events/verified-science.webp"'));
  assert.ok(withImage.includes('Event details') && withImage.includes('href="/florida-events/science-night"'));
  assert.ok(withImage.includes('Friday') && withImage.includes('Science Hall') && withImage.includes('4.2 mi'));
  assert.doesNotMatch(withImage, /wayfind-score-badge|book tickets?|buy tickets?|ticketed/i);
  const missing = renderToStaticMarkup(React.createElement(FamilyEventCard, { event: { id: 'wfc:unknown', name: 'Library Hour' } }));
  assert.doesNotMatch(missing, /<img|Event details|wayfind-score-badge/);
  assert.doesNotMatch(readFileSync(source, 'utf8'), /\.wf-family-event-card\{|grid-auto-columns|min-height:150px|height:86px|flex:0 0 200px/, 'no family-owned event/card geometry survives');
  console.log('test-family-day-presentation: PASS actual 9-rail page, embedded 25/50mi, standalone 10mi, shared RailCard event media/details/unknown facts/no score');
} finally {
  delete globalThis.__familyQuery;
  unlinkSync(routerStub);
}
