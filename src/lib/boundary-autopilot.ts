// Boundary Autopilot's calendar action: declining a meeting for real, not just
// rehearsing what to say. Uses the same direct-browser-call pattern as
// calendar-signals.ts and MicroRecovery.tsx (Google Calendar API supports this
// with the user's own OAuth token).
//
// AUTHORISATION MODEL (Calendar Pilot readiness audit, Task 1): every call
// here runs with the user's own client-held Google OAuth token
// (signInWithGoogleCalendar, src/lib/auth.tsx - `calendar.events` scope).
// Neither function here enforces anything on its own; the real approval
// gate is BoundaryAutopilot.tsx's own two-step UI (an explicit "Review
// before declining" step naming the exact meeting, then a separate
// "Decline '<title>' and notify attendees?" confirm) - this module is
// intentionally just the Google API mechanics, with no implicit trigger
// path into either function from anywhere else in the app (verified: the
// only production import is BoundaryAutopilot.tsx).
//
// REVOKED-CREDENTIAL HANDLING: a 401/403 here means the token Google
// issued has expired or been revoked since the user connected - callers
// get an actionable message rather than a bare status code, so the UI
// can tell the user to reconnect instead of leaving them with "status
// 401" and no next step.
function describeGoogleCalendarHttpError(status: number, action: string): string {
  if (status === 401 || status === 403) {
    return `Your Google Calendar connection has expired or been revoked - reconnect Google Workspace in Settings and try again. (Could not ${action}.)`;
  }
  return `Google Calendar could not ${action} (status ${status}).`;
}

export interface UpcomingEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
}

export const fetchUpcomingEvents = async (accessToken: string): Promise<UpcomingEvent[]> => {
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(now.toISOString())}&timeMax=${encodeURIComponent(weekAhead.toISOString())}&singleEvents=true&orderBy=startTime&maxResults=25`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(describeGoogleCalendarHttpError(res.status, 'load your upcoming meetings'));
  const data = await res.json();

  return (data.items || [])
    .filter((item: any) => item.start?.dateTime)
    .map((item: any) => ({
      id: item.id,
      summary: item.summary || '(No title)',
      start: item.start.dateTime,
      end: item.end.dateTime,
    }));
};

// Declines the event by responding as the user on the attendee list. Google
// Calendar has no single "decline" endpoint — this is the documented pattern:
// fetch the event, flip the current user's own attendee response, PATCH it back.
export const declineCalendarEvent = async (accessToken: string, eventId: string): Promise<void> => {
  const eventUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`;
  const getRes = await fetch(eventUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!getRes.ok) throw new Error(describeGoogleCalendarHttpError(getRes.status, 'load this meeting\'s details'));
  const event = await getRes.json();

  const selfEntry = (event.attendees || []).find((a: any) => a.self);
  if (!selfEntry) {
    throw new Error("Couldn't find your own attendee entry on this event — you may be the organiser, not an invitee.");
  }
  const updatedAttendees = event.attendees.map((a: any) =>
    a.self ? { ...a, responseStatus: 'declined' } : a
  );

  const patchRes = await fetch(`${eventUrl}?sendUpdates=all`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ attendees: updatedAttendees }),
  });
  if (!patchRes.ok) throw new Error(describeGoogleCalendarHttpError(patchRes.status, 'decline this meeting'));
};
