// Boundary Autopilot's calendar action: declining a meeting for real, not just
// rehearsing what to say. Uses the same direct-browser-call pattern as
// calendar-signals.ts and MicroRecovery.tsx (Google Calendar API supports this
// with the user's own OAuth token).

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
  if (!res.ok) throw new Error(`Google Calendar API returned status ${res.status}`);
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
  if (!getRes.ok) throw new Error(`Could not load event details (status ${getRes.status})`);
  const event = await getRes.json();

  const selfEntry = (event.attendees || []).find((a: any) => a.self);
  if (!selfEntry) {
    throw new Error("Couldn't find your own attendee entry on this event — you may be the organizer, not an invitee.");
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
  if (!patchRes.ok) throw new Error(`Google Calendar rejected the update (status ${patchRes.status})`);
};
