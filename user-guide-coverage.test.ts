import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Regression coverage for a real gap: the User Guide describes App.tsx's
// real tabs, but "subscription" (Plan & Billing) had no entry at all -
// visible to the same everyday-user audience as every other guide card,
// just never added. Rather than hardcode a second, parallel "which tabs
// does the guide cover" list here (which would itself drift the moment
// someone adds a tab and forgets this test), this derives the guide's
// intended audience the same way App.tsx's own isTabVisible does: any tab
// whose `roles` includes "individual" is something an ordinary user can
// reach, so the guide - which is written for that same everyday-user
// audience - should describe it (or, for "guide" itself, is exempt as
// self-referential).

const appText = readFileSync(join(__dirname, 'src/App.tsx'), 'utf8');
const guideText = readFileSync(join(__dirname, 'src/components/UserGuide.tsx'), 'utf8');

function extractAllTabsBlock(): string {
  const start = appText.indexOf('export const ALL_TABS:');
  if (start === -1) throw new Error('ALL_TABS not found in App.tsx');
  const end = appText.indexOf('\n];', start);
  if (end === -1) throw new Error('Could not find end of ALL_TABS array');
  return appText.slice(start, end);
}

function extractTabsVisibleToIndividuals(): string[] {
  const block = extractAllTabsBlock();
  // Split into per-entry chunks on each top-level "  {" - matches this
  // file's real indentation for each object in the ALL_TABS array.
  const entries = block.split(/\n {2}\{/).slice(1);
  const ids: string[] = [];
  for (const entry of entries) {
    const idMatch = entry.match(/id:\s*"([a-z_]+)"/);
    const rolesMatch = entry.match(/roles:\s*\[([^\]]*)\]/);
    if (!idMatch || !rolesMatch) continue;
    const roles = rolesMatch[1].split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
    if (roles.includes('individual')) ids.push(idMatch[1]);
  }
  return ids;
}

function extractGuideCoveredTabs(): string[] {
  // Scoped to the four GuideFeature[] groups specifically (not the FAQ's
  // own `tab:` links, which use the same field name but only ever link to
  // tabs a card elsewhere already covers - counting those too would risk
  // masking a real gap in the future).
  const groupNames = ['START_HERE', 'DAILY_TOOLS', 'TALK_TOOLS', 'SAFETY_NET'];
  const ids: string[] = [];
  for (const name of groupNames) {
    const start = guideText.indexOf(`const ${name}: GuideFeature[] = [`);
    if (start === -1) throw new Error(`${name} not found in UserGuide.tsx`);
    const end = guideText.indexOf('\n];', start);
    if (end === -1) throw new Error(`Could not find end of ${name}`);
    const block = guideText.slice(start, end);
    ids.push(...Array.from(block.matchAll(/tab:\s*'([a-z_]+)'/g)).map((m) => m[1]));
  }
  return ids;
}

describe('User Guide tab coverage', () => {
  const individualTabs = extractTabsVisibleToIndividuals();
  const guideCoveredTabs = extractGuideCoveredTabs();

  it('parsed a real, non-trivial tab list (sanity check the parse worked)', () => {
    expect(individualTabs.length).toBeGreaterThan(10);
    expect(guideCoveredTabs.length).toBeGreaterThan(10);
  });

  it('every tab an everyday individual user can reach is described in the guide (or is the guide itself)', () => {
    const missing = individualTabs.filter((id) => id !== 'guide' && !guideCoveredTabs.includes(id));
    expect(missing, `these tabs are visible to individual users but have no User Guide entry: ${missing.join(', ')}`).toEqual([]);
  });
});
