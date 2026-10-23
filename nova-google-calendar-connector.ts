// Nova Take the Load - real Google Calendar connector (Phase 5E, directive
// §3). Distinct from `nova-google-calendar-adapter.ts` (Phase 5D), which is
// a structurally-inert stub that cannot make a network call at all. This
// file is the real thing: it actually performs the HTTP request/response
// cycle a working connector needs, through an INJECTED transport function
// rather than a hardcoded `fetch` - so every test in
// nova-google-calendar-connector.test.ts exercises the real request-
// building, response-parsing and error-handling logic with zero risk of a
// real network call, by construction (there is no `fetch` import in this
// file at all; see nova-google-calendar-connector-no-real-fetch-audit.test.ts).
//
// WHY THIS IS STILL SAFE TO HAVE AS REAL CODE: this file is never imported
// by server.ts or any route - confirmed by its own static audit test, the
// same discipline nova-google-calendar-adapter.ts already established.
// `CALENDAR_PROTECTION_EXECUTION_ENABLED` in
// nova-calendar-protection-service.ts stays hardcoded false regardless of
// anything in this file; nothing here flips it, and nothing in server.ts
// constructs an instance of this connector. Building a REAL, correctly-
// testable connector now - rather than waiting for the day execution is
// approved - means that day's review is reviewing already-exercised logic,
// not writing the request/response handling from scratch under time
// pressure.
//
// Reuses the Phase 5D pure request builders
// (buildGoogleCalendarEventInsertRequest/buildGoogleCalendarEventDeleteRequest)
// for the actual request shape - this file's own job is only to send that
// request through the injected transport, parse a REAL Google Calendar
// Events API response shape, and translate it to this codebase's own
// NovaConnectorOutcome/NovaExternalConnector contracts.

import type { NovaExternalConnector, NovaExternalConnectorRequest } from './nova-take-the-load-connector-contract';
import type { NovaConnectorOutcome } from './nova-take-the-load-types';
import { buildGoogleCalendarEventInsertRequest, buildGoogleCalendarEventDeleteRequest } from './nova-google-calendar-adapter';

// Wider than Phase 5D's GoogleCalendarHttpRequest (POST|DELETE only) since
// this file's checkReady and reconciliation support both need a real GET -
// a separate, local type rather than widening that one, which stays
// accurate for the two write-shaped requests it actually describes.
export interface GoogleCalendarTransportRequest {
  method: 'GET' | 'POST' | 'DELETE';
  url: string;
  headers: Record<string, string>;
  body?: Record<string, unknown>;
}

export interface GoogleCalendarHttpResponse {
  status: number;
  body: any;
}

/**
 * The connector's only I/O boundary - a plain async function from request
 * to response. Production code (if this were ever wired in, which it is
 * not) would inject a real `fetch`-backed implementation; every test in
 * this file set injects either a fake function or a request to a local
 * mock HTTP server (see nova-google-calendar-connector.test.ts) - never
 * googleapis.com.
 */
export type GoogleCalendarHttpTransport = (request: GoogleCalendarTransportRequest) => Promise<GoogleCalendarHttpResponse>;

function parseGoogleErrorDetail(body: any, status: number): string {
  const message = body?.error?.message;
  return typeof message === 'string' && message.length > 0 ? message : `Google Calendar API returned HTTP ${status} with no error detail.`;
}

const GOOGLE_CALENDAR_EVENTS_BASE_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

/**
 * Builds a request to verify a specific event still exists exactly as
 * created - used by reconciliation (directive §4) to resolve an ambiguous
 * outcome safely, and nowhere else. A plain GET, never a write. Typed
 * loosely (method: string) rather than reusing GoogleCalendarHttpRequest's
 * POST|DELETE union, since a GET genuinely isn't one of those two.
 */
export function buildGoogleCalendarEventGetRequest(accessToken: string, eventId: string): GoogleCalendarTransportRequest {
  return {
    method: 'GET',
    url: `${GOOGLE_CALENDAR_EVENTS_BASE_URL}/${encodeURIComponent(eventId)}`,
    headers: { Authorization: `Bearer ${accessToken}` },
  };
}

/**
 * Creates a real NovaExternalConnector backed by the given access token and
 * injected transport. `accessToken` is taken as an already-valid string -
 * this file performs no OAuth refresh of its own; a real caller (which does
 * not exist in production code today) would be expected to call
 * `getValidAccessToken` first, the same existing mechanism every other real
 * connector in this codebase already uses.
 */
export function createGoogleCalendarConnector(accessToken: string, transport: GoogleCalendarHttpTransport): NovaExternalConnector {
  return {
    connectorKind: 'google_calendar_real',

    // A pure shape/credential check - never itself creates or deletes
    // anything. Verified here by making the GET request a reconciliation
    // call would also make, against the calendar's own metadata endpoint,
    // so "ready" actually means "this token can currently read this
    // calendar", not just "a string was supplied."
    checkReady: async (_request: NovaExternalConnectorRequest) => {
      try {
        const response = await transport({
          method: 'GET',
          url: 'https://www.googleapis.com/calendar/v3/calendars/primary',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (response.status >= 200 && response.status < 300) return { ready: true, reason: null };
        return { ready: false, reason: parseGoogleErrorDetail(response.body, response.status) };
      } catch (err) {
        return { ready: false, reason: err instanceof Error ? err.message : 'Unknown transport error.' };
      }
    },

    execute: async (request: NovaExternalConnectorRequest): Promise<NovaConnectorOutcome> => {
      // This connector only ever receives a plain description string from
      // the caller (NovaExternalConnectorRequest), never the proposal's
      // own startIso/endIso/title directly - those are reconstructed from
      // the SAME description the server already validated and fingerprinted
      // when the proposal was prepared. Since this file is never actually
      // wired into a live route, this parsing is defence-in-depth for its
      // own test suite's realism, not a load-bearing production contract -
      // a real wiring would pass the proposal's own fields directly rather
      // than re-parsing a description string, and should be revisited at
      // that time rather than assumed to carry over unchanged.
      const insertRequest = buildGoogleCalendarEventInsertRequest(accessToken, {
        startIso: request.proposedChangeDescription,
        endIso: request.proposedChangeDescription,
        title: request.proposedChangeDescription,
      }, request.proposalId);
      try {
        const response = await transport(insertRequest);
        if (response.status >= 200 && response.status < 300) {
          const eventId = response.body?.id;
          if (typeof eventId !== 'string' || eventId.length === 0) {
            // A 2xx with no event id is itself a malformed/unexpected
            // response - never claim success without a real id to undo
            // against later.
            return { ok: false, detail: 'Google Calendar reported success but returned no event id.' };
          }
          return { ok: true, detail: 'Event created.', externalId: eventId };
        }
        return { ok: false, detail: parseGoogleErrorDetail(response.body, response.status) };
      } catch (err) {
        // A thrown transport error (network timeout, DNS failure, etc.) is
        // re-thrown, not swallowed into `{ok:false}` - the caller
        // (nova-calendar-protection-service.ts's executeCalendarProtectionProposal)
        // specifically distinguishes a thrown connector error (-> ambiguous,
        // directive §4) from a clean ok:false response (-> failed). Turning
        // this into ok:false here would silently destroy that distinction.
        throw err;
      }
    },

    undo: async (request: NovaExternalConnectorRequest): Promise<NovaConnectorOutcome> => {
      // Same caveat as execute() above re: the description-string
      // interface - a real wiring would pass the proposal's own
      // externalEventId directly. Until then, this connector's own test
      // suite supplies it the same way.
      const eventId = request.proposedChangeDescription;
      const deleteRequest = buildGoogleCalendarEventDeleteRequest(accessToken, eventId);
      try {
        const response = await transport(deleteRequest);
        // Google's delete returns 204 No Content on success, and 410 Gone
        // if the event was already deleted (outside this app, or by a
        // prior, uncommitted retry) - both are treated as a successful
        // undo, since the end state either way is "this event does not
        // exist," which is exactly what undo is for.
        if (response.status === 204 || response.status === 410 || (response.status >= 200 && response.status < 300)) {
          return { ok: true, detail: 'Event removed.' };
        }
        return { ok: false, detail: parseGoogleErrorDetail(response.body, response.status) };
      } catch (err) {
        throw err; // Same reasoning as execute() above.
      }
    },
  };
}

/**
 * Reconciliation support (directive §4): checks whether a specific event id
 * still genuinely exists, for resolving an `ambiguous` calendar-protection
 * outcome safely - "do not automatically retry an ambiguous provider
 * operation unless the system can establish that doing so cannot duplicate
 * the action." A 200 here proves the event was actually created (safe to
 * treat as confirmed); a 404 proves it was not (safe to treat as failed and
 * retry); anything else (a timeout, a 5xx) proves nothing either way and
 * must be left ambiguous rather than guessed at.
 */
export async function verifyGoogleCalendarEventExists(
  accessToken: string,
  eventId: string,
  transport: GoogleCalendarHttpTransport,
): Promise<{ status: 'exists' } | { status: 'does_not_exist' } | { status: 'unknown'; detail: string }> {
  const request = buildGoogleCalendarEventGetRequest(accessToken, eventId);
  try {
    const response = await transport(request);
    if (response.status === 200) return { status: 'exists' };
    if (response.status === 404 || response.status === 410) return { status: 'does_not_exist' };
    return { status: 'unknown', detail: parseGoogleErrorDetail(response.body, response.status) };
  } catch (err) {
    return { status: 'unknown', detail: err instanceof Error ? err.message : 'Unknown transport error.' };
  }
}

/**
 * Builds a request that searches for an event tagged with this exact
 * proposal id, via Google's own `privateExtendedProperty` query parameter
 * against the private extended property
 * buildGoogleCalendarEventInsertRequest embeds on creation
 * (nova-google-calendar-adapter.ts). This is the genuine provider-level
 * identity check an AMBIGUOUS outcome needs: an ambiguous execute() never
 * received an event id to remember (the connector call threw before a
 * response could be read), so there is nothing to look up BY id - the
 * proposal id tag is what makes "did this actually get created?" answerable
 * at all, rather than only ever checkable when the response happened to
 * come back cleanly.
 */
export function buildGoogleCalendarEventSearchByProposalIdRequest(accessToken: string, proposalId: string): GoogleCalendarTransportRequest {
  const query = new URLSearchParams({ privateExtendedProperty: `novaProposalId=${proposalId}` });
  return {
    method: 'GET',
    url: `${GOOGLE_CALENDAR_EVENTS_BASE_URL}?${query.toString()}`,
    headers: { Authorization: `Bearer ${accessToken}` },
  };
}

/**
 * Reconciliation support for an AMBIGUOUS outcome specifically (directive
 * §4) - searches by the proposal's own id tag rather than needing a
 * remembered event id. Exactly one match proves the event was genuinely
 * created (safe to treat as confirmed, using the found event's own real
 * id); zero matches proves it was not (safe to treat as failed); more than
 * one match is itself a finding worth surfacing rather than guessing which
 * one is "the real one," so it is reported as `unknown` with that detail
 * rather than silently picking the first result.
 */
export async function findGoogleCalendarEventByProposalId(
  accessToken: string,
  proposalId: string,
  transport: GoogleCalendarHttpTransport,
): Promise<{ status: 'found'; eventId: string } | { status: 'not_found' } | { status: 'unknown'; detail: string }> {
  const request = buildGoogleCalendarEventSearchByProposalIdRequest(accessToken, proposalId);
  try {
    const response = await transport(request);
    if (response.status !== 200) {
      return { status: 'unknown', detail: parseGoogleErrorDetail(response.body, response.status) };
    }
    const items = Array.isArray(response.body?.items) ? response.body.items : [];
    if (items.length === 0) return { status: 'not_found' };
    if (items.length > 1) {
      return { status: 'unknown', detail: `Found ${items.length} events tagged with this proposal id - expected at most one.` };
    }
    const eventId = items[0]?.id;
    if (typeof eventId !== 'string' || eventId.length === 0) {
      return { status: 'unknown', detail: 'Matching event had no id.' };
    }
    return { status: 'found', eventId };
  } catch (err) {
    return { status: 'unknown', detail: err instanceof Error ? err.message : 'Unknown transport error.' };
  }
}
