import { secureApiFetch } from './secure-api';

// Computes a 7-day calendar-load signal from the user's own Google Calendar
// (same direct-browser-call pattern already used in MicroRecovery.tsx — Google's
// Calendar API supports this with the user's own OAuth token, unlike Slack).
// Only the aggregate numbers below are sent anywhere; individual event titles,
// attendees, or times never leave the browser.

export interface CalendarSignal {
  totalMeetingHours: number;
  meetingCount: number;
  backToBackCount: number;
  eveningMeetingCount: number;
  weekendMeetingCount: number;
  windowDays: number;
}

interface RawEvent {
  start: Date;
  end: Date;
}

const WINDOW_DAYS = 7;
const BACK_TO_BACK_GAP_MINUTES = 5;
const EVENING_HOUR_THRESHOLD = 18; // 6 PM local time

export const computeCalendarSignal = async (accessToken: string): Promise<CalendarSignal | null> => {
  if (!accessToken) return null;

  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(windowStart.toISOString())}&timeMax=${encodeURIComponent(now.toISOString())}&singleEvents=true&orderBy=startTime&maxResults=250`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google Calendar API returned status ${res.status}`);
  }
  const data = await res.json();
  const items: any[] = data.items || [];

  const events: RawEvent[] = items
    .filter((item) => item.start?.dateTime && item.end?.dateTime) // skip all-day events
    .map((item) => ({
      start: new Date(item.start.dateTime),
      end: new Date(item.end.dateTime),
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  let totalMeetingMinutes = 0;
  let eveningMeetingCount = 0;
  let weekendMeetingCount = 0;
  let backToBackCount = 0;

  events.forEach((event, i) => {
    totalMeetingMinutes += (event.end.getTime() - event.start.getTime()) / 60000;

    const startHour = event.start.getHours();
    const startDay = event.start.getDay(); // 0 = Sunday, 6 = Saturday
    if (startHour >= EVENING_HOUR_THRESHOLD || startHour < 7) eveningMeetingCount++;
    if (startDay === 0 || startDay === 6) weekendMeetingCount++;

    if (i > 0) {
      const prevEvent = events[i - 1];
      const gapMinutes = (event.start.getTime() - prevEvent.end.getTime()) / 60000;
      if (gapMinutes >= 0 && gapMinutes <= BACK_TO_BACK_GAP_MINUTES) {
        backToBackCount++;
      }
    }
  });

  return {
    totalMeetingHours: Math.round((totalMeetingMinutes / 60) * 10) / 10,
    meetingCount: events.length,
    backToBackCount,
    eveningMeetingCount,
    weekendMeetingCount,
    windowDays: WINDOW_DAYS,
  };
};

// Computes the signal and persists it via the backend. Returns the computed
// signal on success, or null if there's no token or the fetch/store failed —
// callers should treat a null return as "couldn't refresh this time", not
// as an error worth surfacing loudly, since this runs opportunistically.
export const syncCalendarSignal = async (accessToken: string | null): Promise<CalendarSignal | null> => {
  if (!accessToken) return null;
  try {
    const signal = await computeCalendarSignal(accessToken);
    if (!signal) return null;
    await secureApiFetch('/api/signals/calendar', {
      method: 'POST',
      data: signal,
    });
    return signal;
  } catch (e) {
    console.warn('[calendar-signals] sync skipped:', e);
    return null;
  }
};
