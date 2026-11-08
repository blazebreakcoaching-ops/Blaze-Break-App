import { describe, expect, it } from 'vitest';
import { en } from './en';
import { PACKS } from './index';
import { LOCALES } from './locales';
import { readFileSync } from 'node:fs';

const keys = [
  'onboarding.welcomeTitle', 'onboarding.welcomeQuestion',
  'onboarding.pathwayTitle', 'onboarding.pathwayQuestion',
  'onboarding.pressureTitle', 'onboarding.pressureQuestion',
  'onboarding.novaToneTitle', 'onboarding.novaToneQuestion',
] as const;

describe('customer onboarding translation integration', () => {
  it('has all eight new core prompts in every catalogue', () => {
    for (const code of Object.keys(PACKS) as Array<keyof typeof PACKS>) {
      for (const key of keys) {
        expect(en[key]).toBeTruthy();
        expect(PACKS[code][key]?.trim(), code + ' ' + key).toBeTruthy();
      }
    }
  });
  it('shows translated questions without translating stored profile fields or option values', () => {
    const source = readFileSync('src/components/SituationalOnboarding.tsx', 'utf8');
    for (const key of keys) expect(source).toContain("t('" + key + "')");
    for (const field of ['"purpose"', '"pathway"', '"primaryDrain"', '"novaTone"']) {
      expect(source).toContain('field: ' + field);
    }
    expect(source).toContain('letNovaLearn: false');
  });
});
