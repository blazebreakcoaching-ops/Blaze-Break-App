import { describe, expect, it } from 'vitest';
import { en, PACKS, type TranslationKey } from './index';
import { readFileSync } from 'node:fs';
const variants = ['energy', 'disconnect', 'prevent', 'pressure', 'team', 'executive',
  'manager', 'individual', 'entrepreneur', 'workload', 'people', 'interruptions',
  'leadership', 'direct', 'accountable', 'calm', 'practical'] as const;
const extras = ['welcomeSubtitle', 'pathwaySubtitle', 'pressureSubtitle',
  'novaToneSubtitle', 'profileTitle', 'profileSubtitle'] as const;
const source = readFileSync('src/components/SituationalOnboarding.tsx', 'utf8');
describe('multilingual onboarding with stable persisted answers', () => {
  it('provides all 23 entries in every bundled pack', () => {
    for (const pack of Object.values(PACKS)) {
      for (const v of variants) expect(pack[`onboarding.choice.${v}` as TranslationKey]?.trim()).toBeTruthy();
      for (const v of extras) expect(pack[`onboarding.${v}` as TranslationKey]?.trim()).toBeTruthy();
    }
    expect(Object.keys(en).length).toBeGreaterThanOrEqual(291);
  });
  it('renders translated labels while selecting and saving canonical English options', () => {
    for (const v of variants) expect(source).toContain(`display: t('onboarding.choice.${v}')`);
    expect(source).toContain('{opt.display ?? opt.label}');
    expect(source).toContain('handleSelect(steps[step].field!, opt.label)');
    expect(source).toContain('(profile as any)[steps[step].field!] === opt.label');
    for (const field of ['purpose','pathway','primaryDrain','novaTone']) {
      expect(source).toContain(`field: "${field}"`);
    }
    expect(source).toContain('letNovaLearn: false');
    expect(source).toContain('sendNovaNudges: false');
    expect(source).toContain('aria-checked={profile.sendNovaNudges === true}');
    expect(source).toContain('const next = profile.sendNovaNudges !== true;');
  });
});
