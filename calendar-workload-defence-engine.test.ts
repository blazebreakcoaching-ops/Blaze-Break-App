import { describe, it, expect } from 'vitest';
import {
  computeRedZones, hasAnyElevatedZone, isCalendarSignalFresh, CalendarSignalState,
} from './calendar-workload-defence-engine';

const baseState = (overrides: Partial<CalendarSignalState> = {}): CalendarSignalState => ({
  totalMeetingHours: 5,
  meetingCount: 5,
  backToBackCount: 0,
  eveningMeetingCount: 0,
  weekendMeetingCount: 0,
  windowDays: 7,
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe('computeRedZones', () => {
  it('reports all zones as none/clear for a light calendar', () => {
    const zones = computeRedZones(baseState());
    expect(zones.every((z) => z.level === 'none')).toBe(true);
    expect(hasAnyElevatedZone(zones)).toBe(false);
  });

  it('reports high back-to-back level at the same threshold as NovaOverloadShield (>=3)', () => {
    const zones = computeRedZones(baseState({ backToBackCount: 3 }));
    expect(zones.find((z) => z.key === 'backToBack')?.level).toBe('high');
  });

  it('reports moderate back-to-back level between 1 and 2', () => {
    const zones = computeRedZones(baseState({ backToBackCount: 1 }));
    expect(zones.find((z) => z.key === 'backToBack')?.level).toBe('moderate');
  });

  it('reports high total load at 20+ hours and moderate at 12+', () => {
    expect(computeRedZones(baseState({ totalMeetingHours: 20 })).find((z) => z.key === 'totalLoad')?.level).toBe('high');
    expect(computeRedZones(baseState({ totalMeetingHours: 12 })).find((z) => z.key === 'totalLoad')?.level).toBe('moderate');
    expect(computeRedZones(baseState({ totalMeetingHours: 11.9 })).find((z) => z.key === 'totalLoad')?.level).toBe('none');
  });

  it('flags hasAnyElevatedZone true when any single zone is elevated', () => {
    const zones = computeRedZones(baseState({ weekendMeetingCount: 2 }));
    expect(hasAnyElevatedZone(zones)).toBe(true);
  });

  it('never fabricates a specific day/time - detail text only ever cites the real window and counts', () => {
    const zones = computeRedZones(baseState({ backToBackCount: 2, windowDays: 7 }));
    const zone = zones.find((z) => z.key === 'backToBack')!;
    expect(zone.detail).toContain('2');
    expect(zone.detail).toContain('7 days');
    expect(zone.detail).not.toMatch(/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/);
  });
});

describe('isCalendarSignalFresh', () => {
  it('treats a null state as not fresh', () => {
    expect(isCalendarSignalFresh(null)).toBe(false);
  });

  it('treats a sync within 14 days as fresh', () => {
    const state = baseState({ updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() });
    expect(isCalendarSignalFresh(state)).toBe(true);
  });

  it('treats a sync older than 14 days as stale, not fresh', () => {
    const state = baseState({ updatedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString() });
    expect(isCalendarSignalFresh(state)).toBe(false);
  });
});
