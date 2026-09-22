import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Regression coverage: every sidebar tab in ALL_TABS must have a real entry
// in the `titles` map App.tsx's Header uses for its page headline, or it
// silently falls back to the generic "Dashboard Module" placeholder. That
// fallback previously fired for 9 tabs (anxiety_reset, wellbeing,
// subscription, ally, guide, evolution, intelligence, executive, admin) -
// this repo has no component-test harness (no jsdom/testing-library), so
// there was nothing that could have caught a generic placeholder shipping
// as a real page's headline. This is a source-parsing check (no rendering
// needed) that closes that gap going forward: any future tab added to
// ALL_TABS without a matching `titles` entry fails a normal `npm run test`
// run.

const appText = readFileSync(join(__dirname, 'src/App.tsx'), 'utf8');

function extractAllTabIds(): string[] {
  const start = appText.indexOf('export const ALL_TABS:');
  if (start === -1) throw new Error('ALL_TABS not found in App.tsx');
  const end = appText.indexOf('\n];', start);
  if (end === -1) throw new Error('Could not find end of ALL_TABS array');
  const block = appText.slice(start, end);
  return Array.from(block.matchAll(/id:\s*"([a-z_]+)"/g)).map((m) => m[1]);
}

function extractTitlesKeys(): string[] {
  const start = appText.indexOf('const titles: Record<string, string> = {');
  if (start === -1) throw new Error('titles map not found in App.tsx');
  const end = appText.indexOf('\n  };', start);
  if (end === -1) throw new Error('Could not find end of titles map');
  const block = appText.slice(start, end);
  return Array.from(block.matchAll(/^\s*([a-z_]+):\s*"/gm)).map((m) => m[1]);
}

function extractEyebrowKeys(): string[] {
  const start = appText.indexOf('const EYEBROW_LABELS: Record<string, string> = {');
  if (start === -1) throw new Error('EYEBROW_LABELS map not found in App.tsx');
  const end = appText.indexOf('\n};', start);
  if (end === -1) throw new Error('Could not find end of EYEBROW_LABELS map');
  const block = appText.slice(start, end);
  return Array.from(block.matchAll(/^\s*([a-z_]+):\s*"/gm)).map((m) => m[1]);
}

describe('Header page titles', () => {
  const tabIds = extractAllTabIds();
  const titleKeys = extractTitlesKeys();

  it('parsed a real, non-trivial tab list (sanity check the parse worked)', () => {
    expect(tabIds.length).toBeGreaterThan(10);
    expect(titleKeys.length).toBeGreaterThan(10);
  });

  it('every sidebar tab has a real title, so none fall back to the generic "Dashboard Module" placeholder', () => {
    const missing = tabIds.filter((id) => !titleKeys.includes(id));
    expect(missing, `these tabs have no titles[] entry and will show "Dashboard Module": ${missing.join(', ')}`).toEqual([]);
  });
});

describe('Header eyebrow label', () => {
  const tabIds = extractAllTabIds();
  const eyebrowKeys = extractEyebrowKeys();

  // EYEBROW_LABELS is allowed to be a partial map - the render site falls
  // back to the real `title` for anything missing (see EYEBROW_LABELS'
  // own comment in App.tsx) - so this only guards against a *stale* key
  // that no longer corresponds to a real tab, not a missing one.
  it('every EYEBROW_LABELS key is a real tab id (catches renamed/removed tabs left stale here)', () => {
    const stale = eyebrowKeys.filter((id) => !tabIds.includes(id));
    expect(stale, `these EYEBROW_LABELS keys don't match any real tab id: ${stale.join(', ')}`).toEqual([]);
  });

  it('the eyebrow render site falls back to the real title instead of rendering blank', () => {
    expect(appText.includes('{EYEBROW_LABELS[activeTab] || title}')).toBe(true);
  });
});
