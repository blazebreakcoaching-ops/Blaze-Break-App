import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchUpcomingEvents, declineCalendarEvent } from './boundary-autopilot';

// Calendar Pilot readiness audit, Task 1 - this file previously had zero
// direct unit coverage despite being the real, live Google Calendar
// write-path Boundary Autopilot depends on (declineCalendarEvent is a
// real PATCH against the user's own calendar). These tests cover the
// Google API mechanics in isolation; the UI-level authorisation gate
// (explicit two-step review/confirm before this is ever called) is
// covered separately at the component level.

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

describe('fetchUpcomingEvents', () => {
  it('maps real Calendar API events and filters out all-day entries (no dateTime)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          { id: 'e1', summary: 'Standup', start: { dateTime: '2026-03-01T10:00:00Z' }, end: { dateTime: '2026-03-01T10:15:00Z' } },
          { id: 'e2', start: { date: '2026-03-02' }, end: { date: '2026-03-03' } }, // all-day, no dateTime
          { id: 'e3', start: { dateTime: '2026-03-02T09:00:00Z' }, end: { dateTime: '2026-03-02T09:30:00Z' } }, // no summary
        ],
      }),
    });
    const events = await fetchUpcomingEvents('tok_abc');
    expect(events).toEqual([
      { id: 'e1', summary: 'Standup', start: '2026-03-01T10:00:00Z', end: '2026-03-01T10:15:00Z' },
      { id: 'e3', summary: '(No title)', start: '2026-03-02T09:00:00Z', end: '2026-03-02T09:30:00Z' },
    ]);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('calendars/primary/events');
    expect(opts.headers.Authorization).toBe('Bearer tok_abc');
  });

  it('returns an empty list when the API returns no items', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    expect(await fetchUpcomingEvents('tok')).toEqual([]);
  });

  it('a revoked/expired token (401) surfaces an actionable reconnect message, not a bare status code', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });
    await expect(fetchUpcomingEvents('expired_tok')).rejects.toThrow(/reconnect Google Workspace/i);
  });

  it('a 403 is treated the same as 401 - both mean the grant no longer works', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({}) });
    await expect(fetchUpcomingEvents('tok')).rejects.toThrow(/reconnect Google Workspace/i);
  });

  it('a non-auth failure (e.g. 500) reports the real status, not a misleading reconnect prompt', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    await expect(fetchUpcomingEvents('tok')).rejects.toThrow(/status 500/);
  });
});

describe('declineCalendarEvent - the real, live Google Calendar write', () => {
  const eventWithSelf = {
    attendees: [
      { email: 'other@example.com', self: false },
      { email: 'me@example.com', self: true, responseStatus: 'needsAction' },
    ],
  };

  it('flips only the signed-in user\'s own attendee entry to declined, notifies attendees, and leaves everyone else untouched', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => eventWithSelf }); // GET
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) }); // PATCH

    await declineCalendarEvent('tok_abc', 'evt_1');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [getUrl, getOpts] = fetchMock.mock.calls[0];
    expect(getUrl).toContain('calendars/primary/events/evt_1');
    expect(getOpts.headers.Authorization).toBe('Bearer tok_abc');

    const [patchUrl, patchOpts] = fetchMock.mock.calls[1];
    expect(patchUrl).toContain('evt_1');
    expect(patchUrl).toContain('sendUpdates=all'); // attendees are genuinely notified - disclosed, not silent
    expect(patchOpts.method).toBe('PATCH');
    expect(patchOpts.headers.Authorization).toBe('Bearer tok_abc');
    const body = JSON.parse(patchOpts.body);
    expect(body.attendees).toEqual([
      { email: 'other@example.com', self: false },
      { email: 'me@example.com', self: true, responseStatus: 'declined' },
    ]);
  });

  it('refuses to act when the signed-in user has no attendee entry on the event (e.g. they are the organiser, not an invitee)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ attendees: [{ email: 'other@example.com', self: false }] }) });
    await expect(declineCalendarEvent('tok', 'evt_1')).rejects.toThrow(/own attendee entry/i);
    // Never reaches the PATCH - no real write is attempted without a self entry to act on.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses when the event has no attendees list at all', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await expect(declineCalendarEvent('tok', 'evt_1')).rejects.toThrow(/own attendee entry/i);
  });

  it('a revoked/expired token on the GET surfaces an actionable reconnect message', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });
    await expect(declineCalendarEvent('expired', 'evt_1')).rejects.toThrow(/reconnect Google Workspace/i);
  });

  it('a revoked/expired token on the PATCH surfaces an actionable reconnect message, after the GET already succeeded', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => eventWithSelf });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({}) });
    await expect(declineCalendarEvent('tok', 'evt_1')).rejects.toThrow(/reconnect Google Workspace/i);
  });

  it('a genuine server-side rejection (e.g. 500) reports the real status, not a misleading reconnect prompt', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => eventWithSelf });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    await expect(declineCalendarEvent('tok', 'evt_1')).rejects.toThrow(/status 500/);
  });

  it('calling it twice in a row (e.g. a user re-confirming after a transient failure) is safe - each call independently re-reads and re-PATCHes, never assuming prior state', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => eventWithSelf });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await declineCalendarEvent('tok', 'evt_1');

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ attendees: [{ email: 'me@example.com', self: true, responseStatus: 'declined' }] }) });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await declineCalendarEvent('tok', 'evt_1'); // re-declining an already-declined event is a no-op at Google's side, not an error
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
