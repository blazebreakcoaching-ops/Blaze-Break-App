import { describe, expect, it } from 'vitest';
import { NOVA_GUIDE_STEPS, novaGuideIndexForPage, novaGuideInviteKey } from './nova-guide';

describe('Nova Guide content and navigation', () => {
  it('has five concise, unique steps in the approved order', () => {
    expect(NOVA_GUIDE_STEPS.map(step => step.id)).toEqual(['welcome', 'home', 'diagnose', 'nova', 'plan']);
    expect(new Set(NOVA_GUIDE_STEPS.map(step => step.id)).size).toBe(NOVA_GUIDE_STEPS.length);
    for (const step of NOVA_GUIDE_STEPS) {
      expect(step.message.length).toBeLessThan(145);
      expect(step.why.length).toBeLessThan(145);
    }
  });

  it('opens contextual help on the matching existing screen', () => {
    expect(novaGuideIndexForPage('nova')).toBe(3);
    expect(novaGuideIndexForPage('home')).toBe(1);
    expect(novaGuideIndexForPage('diagnose')).toBe(2);
    expect(novaGuideIndexForPage('plan')).toBe(4);
    expect(novaGuideIndexForPage('unknown')).toBe(0);
  });

  it('only links to real customer tabs, never an admin or invented page', () => {
    for (const step of NOVA_GUIDE_STEPS) {
      if (step.tab) {
        expect(['home', 'diagnose', 'nova', 'plan']).toContain(step.tab);
        expect(step.action).toBeTruthy();
      }
    }
  });

  it('scopes invite dismissal per account, not by device', () => {
    const accountA = novaGuideInviteKey('user-a');
    const accountB = novaGuideInviteKey('user-b');
    expect(accountA).not.toBe(accountB);
    expect(accountA).not.toContain('user-b');
  });
});
