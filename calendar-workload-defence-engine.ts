// Calendar Workload Defence: pure banding logic over the real calendar signal
// already computed client-side (src/lib/calendar-signals.ts) from the member's
// own Google Calendar, and already persisted/read via /api/signals/calendar.
//
// CalendarDefenseView.tsx previously showed fixed, fabricated "Red Zone" cards
// (specific days/times that never changed, regardless of what was actually on
// anyone's calendar). The raw signal only ever contains 7-day aggregate counts
// (no per-event times are sent to the server, by design - see calendar-signals.ts),
// so this engine only ever reports on real aggregate counts, never invents a
// specific day/time that isn't actually in the data.
//
// Thresholds mirror the ones already used for the same fields in
// NovaOverloadShield.tsx's integration score, so a given calendar doesn't read
// as "fine" in one place and "overloaded" in another.

export type RedZoneLevel = 'none' | 'moderate' | 'high';

export interface RedZone {
  key: 'backToBack' | 'evening' | 'weekend' | 'totalLoad';
  label: string;
  level: RedZoneLevel;
  detail: string;
}

export interface CalendarSignalState {
  totalMeetingHours: number;
  meetingCount: number;
  backToBackCount: number;
  eveningMeetingCount: number;
  weekendMeetingCount: number;
  windowDays: number;
  updatedAt: string;
}

// A sync older than this is treated as absence of signal, never as "zero
// meetings" - same discipline, and the same 14-day window, as the
// isCalendarConnectedAndFresh helper in server.ts.
export const CALENDAR_SIGNAL_FRESHNESS_MS = 14 * 24 * 60 * 60 * 1000;

export const isCalendarSignalFresh = (state: CalendarSignalState | null, now: number = Date.now()): boolean => {
  if (!state?.updatedAt) return false;
  return new Date(state.updatedAt).getTime() >= now - CALENDAR_SIGNAL_FRESHNESS_MS;
};

const levelFor = (count: number, highAt: number, moderateAt: number): RedZoneLevel =>
  count >= highAt ? 'high' : count >= moderateAt ? 'moderate' : 'none';

export const computeRedZones = (state: CalendarSignalState): RedZone[] => {
  const zones: RedZone[] = [];

  zones.push({
    key: 'backToBack',
    label: 'Back-to-Back Block',
    level: levelFor(state.backToBackCount, 3, 1),
    detail: state.backToBackCount === 0
      ? `No back-to-back meetings in the last ${state.windowDays} days.`
      : `${state.backToBackCount} back-to-back meeting${state.backToBackCount === 1 ? '' : 's'} (no break between them) in the last ${state.windowDays} days.`,
  });

  zones.push({
    key: 'evening',
    label: 'Evening & Early Load',
    level: levelFor(state.eveningMeetingCount, 3, 1),
    detail: state.eveningMeetingCount === 0
      ? `No meetings outside 7am-6pm in the last ${state.windowDays} days.`
      : `${state.eveningMeetingCount} meeting${state.eveningMeetingCount === 1 ? '' : 's'} outside 7am-6pm in the last ${state.windowDays} days.`,
  });

  zones.push({
    key: 'weekend',
    label: 'Weekend Load',
    level: levelFor(state.weekendMeetingCount, 2, 1),
    detail: state.weekendMeetingCount === 0
      ? `No weekend meetings in the last ${state.windowDays} days.`
      : `${state.weekendMeetingCount} weekend meeting${state.weekendMeetingCount === 1 ? '' : 's'} in the last ${state.windowDays} days.`,
  });

  // A 7-day window with >20 meeting hours is already more than half of a
  // standard working week spent in meetings; >12 hours is worth flagging
  // but not yet the dominant use of the week.
  zones.push({
    key: 'totalLoad',
    label: 'Total Meeting Load',
    level: state.totalMeetingHours >= 20 ? 'high' : state.totalMeetingHours >= 12 ? 'moderate' : 'none',
    detail: `${state.totalMeetingHours} hours across ${state.meetingCount} meeting${state.meetingCount === 1 ? '' : 's'} in the last ${state.windowDays} days.`,
  });

  return zones;
};

export const hasAnyElevatedZone = (zones: RedZone[]): boolean => zones.some((z) => z.level !== 'none');
