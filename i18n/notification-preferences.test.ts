import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PACKS, type TranslationKey } from './index';

const keys = [
  'notifications.title','notifications.description','notifications.enable',
  'notifications.enableDetail','notifications.quietHours','notifications.quietDetail',
] as const satisfies readonly TranslationKey[];

describe('in-app reminder translation and permission boundaries', () => {
  const view = readFileSync('src/components/NotificationSettingsView.tsx', 'utf8');
  it('has six draft labels in each bundled language', () => {
    for (const code of Object.keys(PACKS) as Array<keyof typeof PACKS>) {
      for (const key of keys) expect(PACKS[code][key]?.trim(), code + ' ' + key).toBeTruthy();
    }
  });
  it('translates the displayed consent and quiet-hours labels without changing stored preferences', () => {
    for (const key of keys) expect(view).toContain(key);
    expect(view).toContain("doc(db, 'users', uid, 'preferences', 'notifications')");
    expect(view).toContain('prefs.notificationsEnabled');
    expect(view).toContain('prefs.quietHoursStart');
    expect(view).toContain('prefs.quietHoursEnd');
    expect(view).toContain('isLivePreferenceOwner(');
  });
});
