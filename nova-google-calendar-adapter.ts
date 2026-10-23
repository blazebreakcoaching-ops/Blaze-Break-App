// Nova Take the Load - Google Calendar adapter (Phase 5D, directive §5).
//
// AUDIT FINDING THIS FILE IS BUILT AROUND: `server.ts`'s `OAUTH_PROVIDERS`
// config (the real server-side OAuth token store used by Slack/Jira/
// Asana/Calendly/Monday - each with a stored refresh token) has NO entry
// for Google Calendar. The only Google Calendar connection anywhere in
// this codebase is the client-side Firebase popup flow
// (`signInWithCalendar`, src/lib/auth.tsx) that requests
// `https://www.googleapis.com/auth/calendar.readonly` and
// `https://www.googleapis.com/auth/calendar.events` - the resulting
// access token is held only in transient React state
// (`AuthContext.accessToken`), never persisted server-side, never
// refreshed. There is therefore no secure server-side path through which
// a real connector built from this file could ever actually be invoked
// today - server.ts does not, and cannot, hold a Google access token to
// pass to one.
//
// This file does not try to paper over that gap. It provides:
//   1. Pure, testable REQUEST-CONSTRUCTION functions for the two Google
//      Calendar Events API calls Nova Take the Load's calendar_protection
//      category would need (insert, delete-by-id) - proving the shape of
//      what a real call would look like, nothing more.
//   2. A `NovaExternalConnector` implementation built from them that is
//      STRUCTURALLY INCAPABLE of a real network call: this file imports
//      no `fetch`, no `http`/`https` module, and makes no call to
//      googleapis.com anywhere (see
//      nova-google-calendar-adapter-no-real-call-audit.test.ts). Its
//      `execute`/`undo` methods always return `{ ok: false }` - there is
//      no flag anywhere in this file, test-only or otherwise, that makes
//      them do anything else. Unlike nova-calendar-protection-service.ts
//      (whose kill-switch gates a connector call that could, in
//      principle, happen once server-side OAuth storage exists), this
//      adapter's lack of a working `execute` path is not a flag - it is
//      the absence of any code that could perform one.
//   3. This file is never imported by server.ts, any route, or any
//      .tsx component - confirmed by grep before this phase's delivery
//      report.
//
// Building the real, network-capable version of this adapter requires,
// at minimum: a Google Calendar OAuth entry in server.ts's
// OAUTH_PROVIDERS (so a refresh token can be stored and renewed
// server-side the way Slack/Jira/Asana already are), a decision on how
// `calendar.events` write-scope consent is surfaced to the user as
// distinct from the existing read-only `calendar.readonly` flow, and
// separate, explicit authorisation to turn on
// CALENDAR_PROTECTION_EXECUTION_ENABLED in
// nova-calendar-protection-service.ts. None of that is in scope for this
// phase.

import type { NovaExternalConnector, NovaExternalConnectorRequest } from './nova-take-the-load-connector-contract';

const GOOGLE_CALENDAR_EVENTS_BASE_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export interface GoogleCalendarHttpRequest {
  method: 'POST' | 'DELETE';
  url: string;
  headers: Record<string, string>;
  body?: Record<string, unknown>;
}

/**
 * Builds (never sends) the exact request a real Google Calendar Events
 * API insert call would need, for a proposal's own start/end/title. Pure -
 * no I/O, no fetch. The `accessToken` parameter exists only so this shape
 * is complete and testable; nothing in this codebase has a real one to
 * pass in (see this file's own header).
 *
 * `proposalId`, when given, is embedded as a Google Calendar "private
 * extended property" (`extendedProperties.private.novaProposalId`) -
 * Google's own supported mechanism for tagging an event with an
 * application-defined id, queryable later via
 * `privateExtendedProperty=novaProposalId=<id>` (see
 * nova-google-calendar-connector.ts's search support, Phase 5E directive
 * §4). This is what makes genuine provider-level reconciliation possible
 * for an ambiguous outcome: a connector call that throws with the outcome
 * genuinely unknown can later SEARCH for an event tagged with this exact
 * proposal id, rather than needing to have already remembered one.
 */
export function buildGoogleCalendarEventInsertRequest(
  accessToken: string,
  change: { startIso: string; endIso: string; title: string },
  proposalId?: string,
): GoogleCalendarHttpRequest {
  return {
    method: 'POST',
    url: GOOGLE_CALENDAR_EVENTS_BASE_URL,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: {
      summary: change.title,
      start: { dateTime: change.startIso },
      end: { dateTime: change.endIso },
      ...(proposalId ? { extendedProperties: { private: { novaProposalId: proposalId } } } : {}),
    },
  };
}

/** Same reasoning as the insert request above - pure, never sent. */
export function buildGoogleCalendarEventDeleteRequest(accessToken: string, externalEventId: string): GoogleCalendarHttpRequest {
  return {
    method: 'DELETE',
    url: `${GOOGLE_CALENDAR_EVENTS_BASE_URL}/${encodeURIComponent(externalEventId)}`,
    headers: { Authorization: `Bearer ${accessToken}` },
  };
}

/**
 * A `NovaExternalConnector` that is structurally unable to make a real
 * call - see this file's own header. `checkReady` only checks that an
 * access token string was supplied (a shape check, not a network call);
 * `execute`/`undo` always report failure, with a detail message that
 * names the real reason (no server-side OAuth storage exists) rather
 * than pretending a transient error occurred.
 */
export function createGoogleCalendarAdapterStub(accessToken: string | null): NovaExternalConnector {
  const NO_SERVER_SIDE_TOKEN_DETAIL = 'Google Calendar execution is not available: this codebase has no server-side OAuth token storage for Google Calendar (see nova-google-calendar-adapter.ts).';
  return {
    connectorKind: 'google_calendar_stub_never_executes',
    checkReady: async (_request: NovaExternalConnectorRequest) => ({
      ready: false,
      reason: accessToken ? NO_SERVER_SIDE_TOKEN_DETAIL : 'No access token was supplied.',
    }),
    execute: async (_request: NovaExternalConnectorRequest) => ({ ok: false, detail: NO_SERVER_SIDE_TOKEN_DETAIL }),
    undo: async (_request: NovaExternalConnectorRequest) => ({ ok: false, detail: NO_SERVER_SIDE_TOKEN_DETAIL }),
  };
}
