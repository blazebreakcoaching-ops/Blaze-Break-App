import { describe, expect, it } from 'vitest';
import { checkInCountLabel, deviceTimeZone, formatLocalDate, localTimeParts, personalWelcome, resolveLanguage, textDirection, textFor, validTimeZone, welcomePeriod } from './personal-welcome';

describe('personal welcome', () => {
  it('uses real timezone hours across UK daylight-saving changes', () => {
    expect(localTimeParts(new Date('2026-03-29T00:30:00Z'), 'Europe/London').hour).toBe(0);
    expect(localTimeParts(new Date('2026-03-29T01:30:00Z'), 'Europe/London').hour).toBe(2);
    expect(localTimeParts(new Date('2026-10-25T00:30:00Z'), 'Europe/London').hour).toBe(1);
    expect(localTimeParts(new Date('2026-10-25T01:30:00Z'), 'Europe/London').hour).toBe(1);
  });
  it('handles world timezones and local dates without GPS', () => {
    const time = new Date('2026-11-08T22:00:00Z');
    expect(personalWelcome({ now: time, timeZone: 'Asia/Tokyo' }).period).toBe('morning');
    expect(personalWelcome({ now: time, timeZone: 'America/Los_Angeles' }).period).toBe('afternoon');
    expect(validTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(validTimeZone(deviceTimeZone())).toBe(true);
  });
  it('does not use the name without explicit permission', () => {
    const base = { now: new Date('2026-11-08T09:00:00Z'), timeZone: 'UTC', preferredName: 'Alex' };
    expect(personalWelcome(base).greeting).not.toContain('Alex');
    expect(personalWelcome({ ...base, allowName: true }).greeting).toContain('Alex');
  });
  it('is stable per day, with no randomness on re-renders', () => {
    const params = { now: new Date('2026-11-08T09:00:00Z'), timeZone: 'UTC', seed: 'account123' };
    expect(personalWelcome(params)).toEqual(personalWelcome(params));
  });
  it('provides a verified English fallback for untranslated languages', () => {
    expect(resolveLanguage('ar')).toBe('en');
    expect(textFor('welcome.checkin', 'fr')).toBe('Check in');
    expect(textDirection('ar-EG')).toBe('rtl');
    expect(textDirection('en-GB')).toBe('ltr');
  });
  it('formats dates and plural quantities deterministically', () => {
    expect(formatLocalDate(new Date('2026-11-08T23:30:00Z'), 'Asia/Tokyo')).toContain('9 Nov 2026');
    expect(checkInCountLabel(0)).toBe('0 check-ins');
    expect(checkInCountLabel(1)).toBe('1 check-in');
    expect(checkInCountLabel(2)).toBe('2 check-ins');
  });
  it('supports the four time periods and tone choices', () => {
    expect([4, 9, 14, 18, 23].map(welcomePeriod)).toEqual(['night', 'morning', 'afternoon', 'evening', 'night']);
    for (const tone of ['warm', 'simple', 'direct'] as const) {
      expect(personalWelcome({ now: new Date('2026-11-08T12:00:00Z'), timeZone: 'UTC', tone }).message.length).toBeGreaterThan(5);
    }
  });
});
