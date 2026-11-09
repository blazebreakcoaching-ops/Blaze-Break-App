import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LOCALE_CODES, PACKS, en, translate } from './index';

const keys = ["privacy.title","privacy.subtitle","privacy.loadError","privacy.retry","privacy.saveError","privacy.checkinLabel","privacy.checkinCategory","privacy.checkinDescription","privacy.checkinUsage","privacy.calendarLabel","privacy.calendarCategory","privacy.calendarDescription","privacy.calendarUsage","privacy.coreLabel","privacy.collectTitle","privacy.usageTitle","privacy.enable","privacy.disable"] as const;
const variables = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

describe('live privacy dashboard translation and account session ownership', () => {
  it('uses full privacy copy and compatible placeholders across twelve locale packs', () => {
    for (const locale of LOCALE_CODES) {
      for (const key of keys) {
        expect(PACKS[locale][key]?.trim().length).toBeGreaterThan(0);
        expect(variables(translate(locale, key))).toEqual(variables(en[key]));
      }
    }
  });
  it('does not let prior same-UID sessions load or change calendar settings', () => {
    const view = readFileSync('src/components/DataPrivacyDashboard.tsx', 'utf8');
    expect(view).toContain('calendarOwnerSession === user && auth.currentUser === user');
    expect(view).toContain('auth.currentUser !== requestUser');
    expect(view).toContain('}, [user, calendarRetry]);');
    expect(view).toContain('setCalendarOwnerSession(null)');
    expect(view).not.toContain('calendarOwnerUid');
  });
  it('does not promise biological surveillance or legacy burnout velocity', () => {
    const view = readFileSync('src/components/DataPrivacyDashboard.tsx', 'utf8');
    expect(view).not.toContain('Core Biological');
    expect(view).not.toContain('Burnout Velocity');
    expect(view).toContain("t('privacy.checkinDescription')");
    expect(view).toContain("t('privacy.calendarDescription')");
    expect(view).toContain("t('privacy.coreLabel')");
  });
});
