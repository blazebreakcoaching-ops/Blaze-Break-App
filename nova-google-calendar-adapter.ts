// Nova Take the Load - Google Calendar adapter (Phase 5D, directive §5).
//
// Phase 5H, directive §6 CORRECTION of this file's own prior claim: an
// earlier version of this header said `server.ts`'s `OAUTH_PROVIDERS`
// had no entry for Google Calendar, and that there was therefore no
// secure server-side path for a real connector's access token. That is
// no longer true - `OAUTH_PROVIDERS.google_calendar_actions` (added in
// the same Phase 5E commit as this file's own last edit) is a real,
// tested connect/callback/disconnect flow: PKCE, a `calendar.events`
// scope, `access_type=offline`+`prompt=consent` for a durable refresh
// token, account-identity capture, and revoke-on-disconnect, all
// covered by oauth-integrations.route.test.ts. A server-side Google
// Calendar access token CAN exist today, under
// `users/{uid}/integration_tokens/google_calendar_actions`.
//
// What is still genuinely missing, confirmed by grep across this
// codebase (see NOVA_PHASE5H_EXPERIENCE_READINESS_REPORT.md's own
// Google Calendar readiness checklist for the full breakdown): nothing
// anywhere ever reads that stored token and passes it to a connector -
// `executeCalendarProtectionProposal`'s own call site in server.ts
// hardcodes `null` for the connector argument, unconditionally, and
// neither this file's `createGoogleCalendarAdapterStub` nor the real,
// tested `nova-google-calendar-connector.ts` is ever imported by
// server.ts. The gap this file was built around is real - it is just a
// missing WIRING step and an unmade activation decision, not a missing
// credential store.
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
// Making this adapter (or nova-google-calendar-connector.ts) real still
// requires, at minimum: wiring a real connector built from a real,
// per-user `google_calendar_actions` access token into
// `executeCalendarProtectionProposal`'s call site in server.ts (today
// hardcoded to `null`), a decision on how `calendar.events` write-scope
// consent is surfaced to the user as distinct from any existing
// read-only calendar consent flow, and separate, explicit authorisation
// to turn on CALENDAR_PROTECTION_EXECUTION_ENABLED in
// nova-calendar-protection-service.ts. None of that is in scope for
// this phase.

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
