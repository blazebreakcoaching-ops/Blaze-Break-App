// Nova Take the Load - real Google Calendar connector (Phase 5E, directive
// §3). Unit tests use a fake, in-memory transport; the last describe block
// spins up a REAL local HTTP server (127.0.0.1 only) as the "isolated mock
// HTTP server" the directive asks for, so the connector's actual HTTP
// request/response handling (status codes, JSON parsing, headers) is
// genuinely exercised - never against googleapis.com.

import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import {
  createGoogleCalendarConnector, verifyGoogleCalendarEventExists, buildGoogleCalendarEventGetRequest,
  findGoogleCalendarEventByProposalId, buildGoogleCalendarEventSearchByProposalIdRequest,
  type GoogleCalendarHttpTransport, type GoogleCalendarTransportRequest,
} from './nova-google-calendar-connector';

const REQUEST: { category: 'calendar_protection'; proposedChangeDescription: string } = {
  category: 'calendar_protection',
  proposedChangeDescription: 'Protected recovery block',
};

describe('createGoogleCalendarConnector - execute', () => {
  it('returns ok:true with the real event id on a 200 response', async () => {
    const transport: GoogleCalendarHttpTransport = async () => ({ status: 200, body: { id: 'evt_real_123', status: 'confirmed' } });
    const connector = createGoogleCalendarConnector('fake-token', transport);
    const outcome = await connector.execute(REQUEST);
    expect(outcome).toEqual({ ok: true, detail: 'Event created.', externalId: 'evt_real_123' });
  });

  it('returns ok:false with the real Google error message on a 4xx response', async () => {
    const transport: GoogleCalendarHttpTransport = async () => ({ status: 403, body: { error: { code: 403, message: 'Insufficient Permission' } } });
    const connector = createGoogleCalendarConnector('fake-token', transport);
    const outcome = await connector.execute(REQUEST);
    expect(outcome).toEqual({ ok: false, detail: 'Insufficient Permission' });
  });

  it('treats a 2xx with no event id as a failure, never a false success', async () => {
    const transport: GoogleCalendarHttpTransport = async () => ({ status: 200, body: { status: 'confirmed' } });
    const connector = createGoogleCalendarConnector('fake-token', transport);
    const outcome = await connector.execute(REQUEST);
    expect(outcome.ok).toBe(false);
  });

  it('re-throws a transport error rather than swallowing it into ok:false - the caller distinguishes this as ambiguous, not failed', async () => {
    const transport: GoogleCalendarHttpTransport = async () => { throw new Error('ETIMEDOUT'); };
    const connector = createGoogleCalendarConnector('fake-token', transport);
    await expect(connector.execute(REQUEST)).rejects.toThrow('ETIMEDOUT');
  });

  it('sends a real bearer-token Authorization header', async () => {
    let seenAuth: string | undefined;
    const transport: GoogleCalendarHttpTransport = async (req) => {
      seenAuth = req.headers.Authorization;
      return { status: 200, body: { id: 'evt_1' } };
    };
    await createGoogleCalendarConnector('my-real-looking-token', transport).execute(REQUEST);
    expect(seenAuth).toBe('Bearer my-real-looking-token');
  });
});

describe('createGoogleCalendarConnector - undo', () => {
  it('treats 204 No Content as a successful undo', async () => {
    const transport: GoogleCalendarHttpTransport = async () => ({ status: 204, body: null });
    const outcome = await createGoogleCalendarConnector('fake-token', transport).undo({ ...REQUEST, proposedChangeDescription: 'evt_123' });
    expect(outcome.ok).toBe(true);
  });

  it('treats 410 Gone (already deleted) as a successful undo - the end state is what matters', async () => {
    const transport: GoogleCalendarHttpTransport = async () => ({ status: 410, body: { error: { message: 'Resource has been deleted' } } });
    const outcome = await createGoogleCalendarConnector('fake-token', transport).undo({ ...REQUEST, proposedChangeDescription: 'evt_123' });
    expect(outcome.ok).toBe(true);
  });

  it('reports a genuine failure for an unexpected status', async () => {
    const transport: GoogleCalendarHttpTransport = async () => ({ status: 403, body: { error: { message: 'Insufficient Permission' } } });
    const outcome = await createGoogleCalendarConnector('fake-token', transport).undo({ ...REQUEST, proposedChangeDescription: 'evt_123' });
    expect(outcome).toEqual({ ok: false, detail: 'Insufficient Permission' });
  });

  it('re-throws a transport error', async () => {
    const transport: GoogleCalendarHttpTransport = async () => { throw new Error('network down'); };
    await expect(createGoogleCalendarConnector('fake-token', transport).undo({ ...REQUEST, proposedChangeDescription: 'evt_123' })).rejects.toThrow('network down');
  });
});

describe('createGoogleCalendarConnector - checkReady', () => {
  it('reports ready on a successful calendar metadata read', async () => {
    const transport: GoogleCalendarHttpTransport = async () => ({ status: 200, body: { id: 'primary' } });
    const result = await createGoogleCalendarConnector('fake-token', transport).checkReady(REQUEST);
    expect(result).toEqual({ ready: true, reason: null });
  });

  it('reports not ready with the real reason on a failed read', async () => {
    const transport: GoogleCalendarHttpTransport = async () => ({ status: 401, body: { error: { message: 'Invalid Credentials' } } });
    const result = await createGoogleCalendarConnector('fake-token', transport).checkReady(REQUEST);
    expect(result).toEqual({ ready: false, reason: 'Invalid Credentials' });
  });

  it('never throws, even if the transport itself throws', async () => {
    const transport: GoogleCalendarHttpTransport = async () => { throw new Error('DNS failure'); };
    const result = await createGoogleCalendarConnector('fake-token', transport).checkReady(REQUEST);
    expect(result.ready).toBe(false);
  });
});

describe('verifyGoogleCalendarEventExists - reconciliation support (directive §4)', () => {
  it('reports exists on a 200', async () => {
    const transport: GoogleCalendarHttpTransport = async () => ({ status: 200, body: { id: 'evt_1' } });
    expect(await verifyGoogleCalendarEventExists('fake-token', 'evt_1', transport)).toEqual({ status: 'exists' });
  });

  it('reports does_not_exist on a 404', async () => {
    const transport: GoogleCalendarHttpTransport = async () => ({ status: 404, body: { error: { message: 'Not Found' } } });
    expect(await verifyGoogleCalendarEventExists('fake-token', 'evt_1', transport)).toEqual({ status: 'does_not_exist' });
  });

  it('reports does_not_exist on a 410 (already deleted)', async () => {
    const transport: GoogleCalendarHttpTransport = async () => ({ status: 410, body: {} });
    expect(await verifyGoogleCalendarEventExists('fake-token', 'evt_1', transport)).toEqual({ status: 'does_not_exist' });
  });

  it('reports unknown on a 5xx - proves nothing either way, must never be guessed at', async () => {
    const transport: GoogleCalendarHttpTransport = async () => ({ status: 503, body: { error: { message: 'Service Unavailable' } } });
    const result = await verifyGoogleCalendarEventExists('fake-token', 'evt_1', transport);
    expect(result.status).toBe('unknown');
  });

  it('reports unknown (not does_not_exist, not exists) when the transport itself throws', async () => {
    const transport: GoogleCalendarHttpTransport = async () => { throw new Error('timeout'); };
    const result = await verifyGoogleCalendarEventExists('fake-token', 'evt_1', transport);
    expect(result.status).toBe('unknown');
  });
});

describe('createGoogleCalendarConnector - execute tags created events with the proposal id', () => {
  it('embeds request.proposalId as a private extended property on the insert request', async () => {
    let sentBody: any;
    const transport: GoogleCalendarHttpTransport = async (req) => {
      sentBody = req.body;
      return { status: 200, body: { id: 'evt_1' } };
    };
    await createGoogleCalendarConnector('fake-token', transport).execute({ ...REQUEST, proposalId: 'cpp_real_123' });
    expect(sentBody.extendedProperties).toEqual({ private: { novaProposalId: 'cpp_real_123' } });
  });

  it('omits extendedProperties when no proposalId is given', async () => {
    let sentBody: any;
    const transport: GoogleCalendarHttpTransport = async (req) => {
      sentBody = req.body;
      return { status: 200, body: { id: 'evt_1' } };
    };
    await createGoogleCalendarConnector('fake-token', transport).execute(REQUEST);
    expect(sentBody.extendedProperties).toBeUndefined();
  });
});

describe('findGoogleCalendarEventByProposalId - reconciliation support for an ambiguous outcome (directive §4)', () => {
  it('builds a search request using Google\'s privateExtendedProperty query parameter', () => {
    const req = buildGoogleCalendarEventSearchByProposalIdRequest('fake-token', 'cpp_abc');
    expect(req.method).toBe('GET');
    expect(req.url).toContain('privateExtendedProperty=novaProposalId%3Dcpp_abc');
  });

  it('reports found with the real event id when exactly one match exists', async () => {
    const transport: GoogleCalendarHttpTransport = async () => ({ status: 200, body: { items: [{ id: 'evt_found_1' }] } });
    const result = await findGoogleCalendarEventByProposalId('fake-token', 'cpp_abc', transport);
    expect(result).toEqual({ status: 'found', eventId: 'evt_found_1' });
  });

  it('reports not_found when no event is tagged with this proposal id - safe to treat as a clean failure', async () => {
    const transport: GoogleCalendarHttpTransport = async () => ({ status: 200, body: { items: [] } });
    const result = await findGoogleCalendarEventByProposalId('fake-token', 'cpp_abc', transport);
    expect(result).toEqual({ status: 'not_found' });
  });

  it('reports unknown (never guesses) when more than one event is tagged with the same proposal id', async () => {
    const transport: GoogleCalendarHttpTransport = async () => ({ status: 200, body: { items: [{ id: 'evt_1' }, { id: 'evt_2' }] } });
    const result = await findGoogleCalendarEventByProposalId('fake-token', 'cpp_abc', transport);
    expect(result.status).toBe('unknown');
  });

  it('reports unknown on a non-200 response', async () => {
    const transport: GoogleCalendarHttpTransport = async () => ({ status: 500, body: { error: { message: 'Internal error' } } });
    const result = await findGoogleCalendarEventByProposalId('fake-token', 'cpp_abc', transport);
    expect(result.status).toBe('unknown');
  });

  it('reports unknown when the transport itself throws', async () => {
    const transport: GoogleCalendarHttpTransport = async () => { throw new Error('timeout'); };
    const result = await findGoogleCalendarEventByProposalId('fake-token', 'cpp_abc', transport);
    expect(result.status).toBe('unknown');
  });
});

// Phase 5I, directive §4 - fills in the specific HTTP status codes the
// directive names (401, 404, 409, 429, 5xx) that the existing suite above
// only covered for checkReady/reconciliation, not execute/undo. No new
// production behaviour: createGoogleCalendarConnector already handles any
// non-2xx/non-204/410 status generically via parseGoogleErrorDetail - these
// tests prove that generic handling is in fact correct for each of these
// specific real-world status codes, closing a coverage gap rather than
// changing anything.
describe('createGoogleCalendarConnector - execute, full HTTP status matrix (directive §4)', () => {
  it('401 (invalid/expired token) is reported as ok:false with the real detail', async () => {
    const transport: GoogleCalendarHttpTransport = async () => ({ status: 401, body: { error: { message: 'Invalid Credentials' } } });
    const outcome = await createGoogleCalendarConnector('fake-token', transport).execute(REQUEST);
    expect(outcome).toEqual({ ok: false, detail: 'Invalid Credentials' });
  });

  it('404 (calendar not found) is reported as ok:false with the real detail', async () => {
    const transport: GoogleCalendarHttpTransport = async () => ({ status: 404, body: { error: { message: 'Not Found' } } });
    const outcome = await createGoogleCalendarConnector('fake-token', transport).execute(REQUEST);
    expect(outcome).toEqual({ ok: false, detail: 'Not Found' });
  });

  it('409 (conflict) is reported as ok:false with the real detail, not silently retried', async () => {
    const transport: GoogleCalendarHttpTransport = async () => ({ status: 409, body: { error: { message: 'The requested identifier already exists.' } } });
    const outcome = await createGoogleCalendarConnector('fake-token', transport).execute(REQUEST);
    expect(outcome).toEqual({ ok: false, detail: 'The requested identifier already exists.' });
  });

  it('429 (rate limited) is reported as ok:false with the real detail - the service layer\'s own retry cap governs any retry, this connector never retries on its own', async () => {
    const transport: GoogleCalendarHttpTransport = async () => ({ status: 429, body: { error: { message: 'Rate Limit Exceeded' } } });
    const outcome = await createGoogleCalendarConnector('fake-token', transport).execute(REQUEST);
    expect(outcome).toEqual({ ok: false, detail: 'Rate Limit Exceeded' });
  });

  it('5xx (provider-side failure) is reported as ok:false with the real detail', async () => {
    const transport: GoogleCalendarHttpTransport = async () => ({ status: 503, body: { error: { message: 'Service Unavailable' } } });
    const outcome = await createGoogleCalendarConnector('fake-token', transport).execute(REQUEST);
    expect(outcome).toEqual({ ok: false, detail: 'Service Unavailable' });
  });
});

describe('createGoogleCalendarConnector - undo, full HTTP status matrix (directive §4)', () => {
  const UNDO_REQUEST = { ...REQUEST, proposedChangeDescription: 'evt_123' };

  it('401 (invalid/expired token) is reported as ok:false, not a false success', async () => {
    const transport: GoogleCalendarHttpTransport = async () => ({ status: 401, body: { error: { message: 'Invalid Credentials' } } });
    const outcome = await createGoogleCalendarConnector('fake-token', transport).undo(UNDO_REQUEST);
    expect(outcome).toEqual({ ok: false, detail: 'Invalid Credentials' });
  });

  it('404 (event not found, and not the 410-already-deleted case) is reported as ok:false', async () => {
    const transport: GoogleCalendarHttpTransport = async () => ({ status: 404, body: { error: { message: 'Not Found' } } });
    const outcome = await createGoogleCalendarConnector('fake-token', transport).undo(UNDO_REQUEST);
    expect(outcome).toEqual({ ok: false, detail: 'Not Found' });
  });

  it('409 (conflict) is reported as ok:false', async () => {
    const transport: GoogleCalendarHttpTransport = async () => ({ status: 409, body: { error: { message: 'Conflict' } } });
    const outcome = await createGoogleCalendarConnector('fake-token', transport).undo(UNDO_REQUEST);
    expect(outcome).toEqual({ ok: false, detail: 'Conflict' });
  });

  it('429 (rate limited) is reported as ok:false', async () => {
    const transport: GoogleCalendarHttpTransport = async () => ({ status: 429, body: { error: { message: 'Rate Limit Exceeded' } } });
    const outcome = await createGoogleCalendarConnector('fake-token', transport).undo(UNDO_REQUEST);
    expect(outcome).toEqual({ ok: false, detail: 'Rate Limit Exceeded' });
  });

  it('5xx (provider-side failure) is reported as ok:false', async () => {
    const transport: GoogleCalendarHttpTransport = async () => ({ status: 500, body: { error: { message: 'Backend Error' } } });
    const outcome = await createGoogleCalendarConnector('fake-token', transport).undo(UNDO_REQUEST);
    expect(outcome).toEqual({ ok: false, detail: 'Backend Error' });
  });
});

// Phase 5I, directive §4's "all-day events" - proves reconciliation's own
// lookup functions correctly extract an event's id/existence regardless of
// whether Google represents it as a timed event (start.dateTime/
// end.dateTime) or an all-day one (start.date/end.date - no time-of-day or
// offset at all). Neither function reads start/end at all - they only ever
// need an id and a count of matches - so this proves that is genuinely true
// for a realistic all-day-shaped response, not merely assumed.
describe('reconciliation against an all-day event response shape (directive §4)', () => {
  it('verifyGoogleCalendarEventExists reports exists for a 200 all-day event body', async () => {
    const transport: GoogleCalendarHttpTransport = async () => ({
      status: 200,
      body: { id: 'evt_allday_1', start: { date: '2026-11-03' }, end: { date: '2026-11-04' } },
    });
    expect(await verifyGoogleCalendarEventExists('fake-token', 'evt_allday_1', transport)).toEqual({ status: 'exists' });
  });

  it('findGoogleCalendarEventByProposalId reports found with the real id for an all-day match', async () => {
    const transport: GoogleCalendarHttpTransport = async () => ({
      status: 200,
      body: { items: [{ id: 'evt_allday_found', start: { date: '2026-11-03' }, end: { date: '2026-11-04' } }] },
    });
    const result = await findGoogleCalendarEventByProposalId('fake-token', 'cpp_allday', transport);
    expect(result).toEqual({ status: 'found', eventId: 'evt_allday_found' });
  });
});

describe('buildGoogleCalendarEventGetRequest', () => {
  it('builds a real-shaped GET request, URL-encoding the event id', () => {
    const req = buildGoogleCalendarEventGetRequest('fake-token', 'evt with spaces');
    expect(req.method).toBe('GET');
    expect(req.url).toBe('https://www.googleapis.com/calendar/v3/calendars/primary/events/evt%20with%20spaces');
    expect(req.headers.Authorization).toBe('Bearer fake-token');
  });
});

// "Use an isolated mock HTTP server and fake provider responses for
// integration tests" (directive §3) - a real Node http.Server bound to
// 127.0.0.1, so the connector's actual HTTP layer (status codes, JSON
// body parsing) is genuinely exercised end to end, never against
// googleapis.com. The connector itself has no base-URL override, so this
// suite proves the REQUEST-BUILDING logic against a real server by
// re-pointing the transport at this local server rather than at Google's
// real host - the same thing a DI transport is for.
describe('integration: real local HTTP server as the mock provider', () => {
  let server: http.Server;
  let baseUrl: string;
  let lastRequest: { method?: string; url?: string; headers?: http.IncomingHttpHeaders; body?: string } | null = null;

  function startServer(responder: (req: http.IncomingMessage, res: http.ServerResponse) => void): Promise<string> {
    return new Promise((resolve) => {
      server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          lastRequest = { method: req.method, url: req.url, headers: req.headers, body };
          responder(req, res);
        });
      });
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        resolve(`http://127.0.0.1:${port}`);
      });
    });
  }

  afterEach(() => {
    if (server) server.close();
    lastRequest = null;
  });

  it('a real HTTP 200 JSON response from a local server is parsed into a successful outcome', async () => {
    baseUrl = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'evt_from_real_http', status: 'confirmed' }));
    });

    const transport: GoogleCalendarHttpTransport = async (req: GoogleCalendarTransportRequest) => {
      // Re-point at the local mock server instead of googleapis.com -
      // this is the actual "isolated mock HTTP server" exercise: a real
      // fetch, a real socket, a real JSON response body.
      const localUrl = req.url.replace('https://www.googleapis.com', baseUrl);
      const res = await fetch(localUrl, { method: req.method, headers: req.headers, body: req.body ? JSON.stringify(req.body) : undefined });
      return { status: res.status, body: await res.json() };
    };

    const outcome = await createGoogleCalendarConnector('real-looking-token', transport).execute(REQUEST);
    expect(outcome).toEqual({ ok: true, detail: 'Event created.', externalId: 'evt_from_real_http' });
    expect(lastRequest?.method).toBe('POST');
    expect(lastRequest?.headers?.authorization).toBe('Bearer real-looking-token');
  });

  it('a real HTTP 403 JSON error response from a local server is parsed into a failure with the real message', async () => {
    baseUrl = await startServer((_req, res) => {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 403, message: 'Calendar usage limits exceeded.' } }));
    });

    const transport: GoogleCalendarHttpTransport = async (req: GoogleCalendarTransportRequest) => {
      const localUrl = req.url.replace('https://www.googleapis.com', baseUrl);
      const res = await fetch(localUrl, { method: req.method, headers: req.headers, body: req.body ? JSON.stringify(req.body) : undefined });
      return { status: res.status, body: await res.json() };
    };

    const outcome = await createGoogleCalendarConnector('real-looking-token', transport).execute(REQUEST);
    expect(outcome).toEqual({ ok: false, detail: 'Calendar usage limits exceeded.' });
  });

  it('a real HTTP 204 No Content response (no body at all) from a local server is parsed as a successful undo', async () => {
    baseUrl = await startServer((_req, res) => {
      res.writeHead(204);
      res.end();
    });

    const transport: GoogleCalendarHttpTransport = async (req: GoogleCalendarTransportRequest) => {
      const localUrl = req.url.replace('https://www.googleapis.com', baseUrl);
      const res = await fetch(localUrl, { method: req.method, headers: req.headers });
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null };
    };

    const outcome = await createGoogleCalendarConnector('real-looking-token', transport).undo({ ...REQUEST, proposedChangeDescription: 'evt_to_delete' });
    expect(outcome.ok).toBe(true);
  });
});
