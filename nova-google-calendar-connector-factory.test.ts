// Nova Take the Load - Google Calendar connector factory (Phase 5I,
// directive §2/§4). Every test here injects a fake transport/getAccessToken
// - no real network call, no real OAuth, matching the exact discipline
// nova-google-calendar-connector.test.ts already established. These tests
// prove the readiness orchestration (account/scope/calendar checks) is
// correct; nova-google-calendar-connector.test.ts already proves the
// execute/undo/checkReady request-response handling this factory's
// `ready` connector reuses unchanged.

import { describe, it, expect } from 'vitest';
import {
  buildGoogleCalendarConnector, createRealGoogleCalendarHttpTransport,
  type BuildGoogleCalendarConnectorInput,
} from './nova-google-calendar-connector-factory';
import type { GoogleCalendarHttpTransport, GoogleCalendarTransportRequest, GoogleCalendarHttpResponse } from './nova-google-calendar-connector';

const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const CALENDAR_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary';

function fakeTransport(responses: {
  identity?: GoogleCalendarHttpResponse | (() => Promise<GoogleCalendarHttpResponse>);
  calendar?: GoogleCalendarHttpResponse | (() => Promise<GoogleCalendarHttpResponse>);
}): GoogleCalendarHttpTransport {
  return async (request: GoogleCalendarTransportRequest): Promise<GoogleCalendarHttpResponse> => {
    const pick = request.url === USERINFO_URL ? responses.identity : request.url === CALENDAR_URL ? responses.calendar : undefined;
    if (!pick) throw new Error(`fakeTransport: no fake response configured for ${request.url}`);
    return typeof pick === 'function' ? pick() : pick;
  };
}

function baseInput(overrides: Partial<BuildGoogleCalendarConnectorInput> = {}): BuildGoogleCalendarConnectorInput {
  return {
    getAccessToken: async () => 'fake-access-token',
    expectedAccountEmail: 'user@example.com',
    transport: fakeTransport({
      identity: { status: 200, body: { email: 'user@example.com' } },
      calendar: { status: 200, body: { id: 'primary' } },
    }),
    ...overrides,
  };
}

describe('buildGoogleCalendarConnector - readiness orchestration', () => {
  it('returns ready with a usable connector when token, identity, and calendar all check out', async () => {
    const result = await buildGoogleCalendarConnector(baseInput());
    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      expect(result.connector.connectorKind).toBe('google_calendar_real');
    }
  });

  it('returns not_connected when getAccessToken resolves to null (no live connection)', async () => {
    const result = await buildGoogleCalendarConnector(baseInput({ getAccessToken: async () => null }));
    expect(result).toEqual({ status: 'not_connected' });
  });

  it('returns token_unavailable (not not_connected) when getAccessToken itself throws', async () => {
    const result = await buildGoogleCalendarConnector(baseInput({
      getAccessToken: async () => { throw new Error('Firestore unavailable'); },
    }));
    expect(result).toEqual({ status: 'token_unavailable', detail: 'Firestore unavailable' });
  });

  it('returns token_unavailable when the identity lookup itself fails (e.g. a revoked/invalid token)', async () => {
    const result = await buildGoogleCalendarConnector(baseInput({
      transport: fakeTransport({ identity: { status: 401, body: { error: 'invalid_token' } } }),
    }));
    expect(result.status).toBe('token_unavailable');
  });

  it('returns token_unavailable when the identity transport call itself throws', async () => {
    const result = await buildGoogleCalendarConnector(baseInput({
      transport: fakeTransport({ identity: () => { throw new Error('DNS failure'); } }),
    }));
    expect(result.status).toBe('token_unavailable');
  });

  it('returns wrong_account when the token resolves to a different Google account than the one on record', async () => {
    const result = await buildGoogleCalendarConnector(baseInput({
      expectedAccountEmail: 'original-owner@example.com',
      transport: fakeTransport({ identity: { status: 200, body: { email: 'someone-else@example.com' } } }),
    }));
    expect(result).toEqual({ status: 'wrong_account', expectedEmail: 'original-owner@example.com', actualEmail: 'someone-else@example.com' });
  });

  it('skips the account-match comparison when no expected account email is on record yet', async () => {
    const result = await buildGoogleCalendarConnector(baseInput({
      expectedAccountEmail: null,
      transport: fakeTransport({
        identity: { status: 200, body: { email: 'whoever@example.com' } },
        calendar: { status: 200, body: { id: 'primary' } },
      }),
    }));
    expect(result.status).toBe('ready');
  });

  const IDENTITY_OK = { status: 200 as const, body: { email: 'user@example.com' } };

  it('returns insufficient_scope when checkReady fails with Google\'s own "insufficient scope" wording', async () => {
    const result = await buildGoogleCalendarConnector(baseInput({
      transport: fakeTransport({ identity: IDENTITY_OK, calendar: { status: 403, body: { error: { message: 'Request had insufficient authentication scopes.' } } } }),
    }));
    expect(result).toEqual({ status: 'insufficient_scope', detail: 'Request had insufficient authentication scopes.' });
  });

  it('returns calendar_inaccessible (not insufficient_scope) for an unrelated calendar-read failure', async () => {
    const result = await buildGoogleCalendarConnector(baseInput({
      transport: fakeTransport({ identity: IDENTITY_OK, calendar: { status: 404, body: { error: { message: 'Not Found' } } } }),
    }));
    expect(result).toEqual({ status: 'calendar_inaccessible', detail: 'Not Found' });
  });

  it('returns calendar_inaccessible when the calendar-readiness transport call itself throws', async () => {
    const result = await buildGoogleCalendarConnector(baseInput({
      transport: fakeTransport({ identity: IDENTITY_OK, calendar: () => { throw new Error('ETIMEDOUT'); } }),
    }));
    expect(result.status).toBe('calendar_inaccessible');
  });

  it('never throws - every injected failure mode resolves to a specific readiness value', async () => {
    const inputs: BuildGoogleCalendarConnectorInput[] = [
      baseInput({ getAccessToken: async () => { throw new Error('boom'); } }),
      baseInput({ transport: fakeTransport({ identity: () => { throw new Error('boom'); } }) }),
      baseInput({ transport: fakeTransport({ calendar: () => { throw new Error('boom'); } }) }),
    ];
    for (const input of inputs) {
      await expect(buildGoogleCalendarConnector(input)).resolves.toBeTruthy();
    }
  });
});

describe('createRealGoogleCalendarHttpTransport', () => {
  it('sends the request method/headers/body and parses a JSON response, via an injected fetch (never a real network call)', async () => {
    let seenRequest: { url: string; init: RequestInit } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seenRequest = { url, init };
      return new Response(JSON.stringify({ id: 'evt_1' }), { status: 200 });
    }) as unknown as typeof fetch;

    const transport = createRealGoogleCalendarHttpTransport(fakeFetch);
    const response = await transport({
      method: 'POST',
      url: 'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: { summary: 'Test' },
    });

    expect(response).toEqual({ status: 200, body: { id: 'evt_1' } });
    expect(seenRequest?.url).toBe('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    expect(seenRequest?.init.method).toBe('POST');
    expect(seenRequest?.init.body).toBe(JSON.stringify({ summary: 'Test' }));
  });

  it('treats a 204 No Content response as having no body, never attempting to parse JSON from an empty body', async () => {
    const fakeFetch = (async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    const transport = createRealGoogleCalendarHttpTransport(fakeFetch);
    const response = await transport({ method: 'DELETE', url: 'https://www.googleapis.com/calendar/v3/calendars/primary/events/evt_1', headers: {} });
    expect(response).toEqual({ status: 204, body: null });
  });

  it('treats a non-JSON body as null rather than throwing', async () => {
    const fakeFetch = (async () => new Response('not json', { status: 503 })) as unknown as typeof fetch;
    const transport = createRealGoogleCalendarHttpTransport(fakeFetch);
    const response = await transport({ method: 'GET', url: 'https://www.googleapis.com/calendar/v3/calendars/primary', headers: {} });
    expect(response).toEqual({ status: 503, body: null });
  });
});
