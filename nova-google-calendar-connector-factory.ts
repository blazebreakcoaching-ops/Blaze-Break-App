// Nova Take the Load - Google Calendar connector FACTORY (Phase 5I,
// directive §2).
//
// nova-google-calendar-connector.ts (Phase 5E) already builds a real,
// tested NovaExternalConnector from an access token someone else
// resolved. What this file adds is the "someone else" part: turning a
// token-resolution callback plus a few real, injected Google Calendar API
// checks into a verified-ready connector, or a specific, honest reason it
// is not ready - WITHOUT this file ever reading Firestore or performing
// its own token refresh. Token resolution stays exactly where it already
// lives (server.ts's existing, private getValidAccessToken, the same
// mechanism Slack/Jira/Asana/Monday/Calendly already use) - this file
// only consumes it through an injected `getAccessToken` callback, so
// nothing here duplicates that refresh/expiry/revocation logic.
//
// STILL STRUCTURALLY INERT BY CONSTRUCTION, same discipline as
// nova-google-calendar-connector.ts's own header: no `fetch` import, no
// hardcoded googleapis.com network call anywhere in this file - every
// Google API call goes through the caller-injected
// GoogleCalendarHttpTransport (createRealGoogleCalendarHttpTransport
// below builds a real one, but nothing in this file calls it itself, and
// nothing in server.ts constructs an instance of this factory's output
// while CALENDAR_PROTECTION_EXECUTION_ENABLED is false - see that
// service's own kill-switch, checked by server.ts BEFORE this factory is
// ever invoked, not merely by this factory internally).
//
// WHY A SEPARATE FILE rather than extending nova-google-calendar-
// connector.ts directly: that file's job is "given a token, talk to
// Google." This file's job is "decide whether we should even try" -
// account ownership, scope, and calendar reachability are orthogonal
// concerns from the request/response translation layer, and keeping them
// separate means nova-google-calendar-connector.test.ts's existing
// coverage of execute/undo/checkReady never needed to change for this
// phase's work (directive's own instruction: "do not rebuild
// functionality already implemented").

import { createGoogleCalendarConnector } from './nova-google-calendar-connector';
import type { GoogleCalendarHttpTransport, GoogleCalendarTransportRequest, GoogleCalendarHttpResponse } from './nova-google-calendar-connector';
import type { NovaExternalConnector } from './nova-take-the-load-connector-contract';

/**
 * Every outcome this factory can produce. `ready` is the only state that
 * hands back a usable connector - every other state is a specific,
 * honest reason execution could not even be attempted, so a caller never
 * has to guess why a `null` connector came back (directive §2: "handle
 * revoked connections and insufficient permissions").
 */
export type GoogleCalendarConnectorReadiness =
  | { status: 'ready'; connector: NovaExternalConnector }
  | { status: 'not_connected' }
  | { status: 'token_unavailable'; detail: string }
  | { status: 'wrong_account'; expectedEmail: string; actualEmail: string | null }
  | { status: 'insufficient_scope'; detail: string }
  | { status: 'calendar_inaccessible'; detail: string };

export interface BuildGoogleCalendarConnectorInput {
  /**
   * Resolves to a valid, already-refreshed access token, or null if the
   * user has no live connection. A real caller (server.ts) implements
   * this as `() => getValidAccessToken(uid, 'google_calendar_actions')` -
   * the exact existing refresh/expiry mechanism every other provider in
   * this codebase reuses; this factory never reimplements it. A thrown
   * error (rather than a resolved null) is treated as `token_unavailable`
   * - it means token resolution itself failed unexpectedly, not that the
   * user is simply disconnected.
   */
  getAccessToken: () => Promise<string | null>;
  /**
   * The Google account email this user's connection was recorded as
   * belonging to at connect-time (users/{uid}/integrations/
   * google_calendar_actions.connectedAccountEmail in server.ts). Pass
   * null only if no connection record exists yet (checkIdentity below
   * will then simply be skipped as a comparison, not as a call - the
   * account that owns this token is still looked up and returned on a
   * `wrong_account` result's `actualEmail`, for whatever caller wants to
   * surface it). This is what makes "the correct target account"
   * (directive §3) an enforced check rather than an assumption: a token
   * that currently resolves to a DIFFERENT Google account than the one
   * the user originally connected (e.g. a stale/mismatched record after
   * a manual Google-side account switch) is refused here, before it ever
   * reaches a connector.
   */
  expectedAccountEmail: string | null;
  /**
   * The one real I/O boundary - every Google Calendar API call this
   * factory and the connector it builds ever make goes through this
   * single injected function. Production code would pass
   * createRealGoogleCalendarHttpTransport()'s result; every test in this
   * file's own suite injects a fake, exactly like
   * nova-google-calendar-connector.test.ts already does.
   */
  transport: GoogleCalendarHttpTransport;
}

/**
 * Real Google endpoint, Authorization header (never a query-string
 * token, so it can never end up in a URL that some layer logs) - the
 * same approach server.ts's own OAUTH_PROVIDERS.google_calendar_actions.
 * fetchAccountIdentity already uses for this exact purpose at connect
 * time. This is intentionally NOT exposed as a caller-injectable
 * override - unlike the transport, there is only one real way to ask
 * "whose token is this," and keeping it fixed means a test only ever has
 * to fake the transport, not a second, separate identity mechanism.
 */
async function checkGoogleAccountIdentity(
  accessToken: string,
  transport: GoogleCalendarHttpTransport,
): Promise<{ email: string | null } | { error: string }> {
  try {
    const response = await transport({
      method: 'GET',
      url: 'https://www.googleapis.com/oauth2/v3/userinfo',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status < 200 || response.status >= 300) {
      const message = typeof response.body?.error === 'string' ? response.body.error : null;
      return { error: message || `Google account lookup returned HTTP ${response.status}.` };
    }
    const email = typeof response.body?.email === 'string' ? response.body.email : null;
    return { email };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown transport error during account lookup.' };
  }
}

/**
 * Best-effort classification of checkReady()'s own failure reason into
 * "insufficient scope" vs. "calendar otherwise inaccessible," purely for
 * clearer user-facing wording - NOT a security boundary (both outcomes
 * already refuse to hand back a connector either way). Google's Calendar
 * API does not expose a dedicated scope-introspection call without
 * putting the access token in a URL query string (the only real
 * tokeninfo endpoint Google documents takes it that way); rather than add
 * a second token-bearing network call purely to produce a nicer label,
 * this reads the real error text Google's Calendar API itself already
 * returned to checkReady's own request, which - for a genuine missing-
 * scope case - reliably contains wording to this effect
 * ("insufficient authentication scopes" is Google's own standard
 * message). A detail that doesn't match is simply shown as
 * `calendar_inaccessible` instead, which is equally honest and never
 * wrong, just less specific.
 */
function looksLikeScopeError(detail: string): boolean {
  return /insufficient|scope/i.test(detail);
}

/**
 * Orchestrates the full pre-execution readiness check (directive §2/§3):
 * resolve a token, verify it belongs to the account this user actually
 * connected, then verify the calendar itself is reachable with it. Only
 * on every one of those succeeding does this return a connector at all.
 * Never throws - every failure mode, including an unexpected exception
 * from `getAccessToken` itself, resolves to a specific readiness value.
 */
export async function buildGoogleCalendarConnector(
  input: BuildGoogleCalendarConnectorInput,
): Promise<GoogleCalendarConnectorReadiness> {
  let accessToken: string | null;
  try {
    accessToken = await input.getAccessToken();
  } catch (err) {
    return { status: 'token_unavailable', detail: err instanceof Error ? err.message : 'Could not resolve an access token.' };
  }
  if (!accessToken) {
    return { status: 'not_connected' };
  }

  const identity = await checkGoogleAccountIdentity(accessToken, input.transport);
  if ('error' in identity) {
    return { status: 'token_unavailable', detail: identity.error };
  }
  if (input.expectedAccountEmail && identity.email !== input.expectedAccountEmail) {
    return { status: 'wrong_account', expectedEmail: input.expectedAccountEmail, actualEmail: identity.email };
  }

  const connector = createGoogleCalendarConnector(accessToken, input.transport);
  const readiness = await connector.checkReady({ category: 'calendar_protection', proposedChangeDescription: '' });
  if (!readiness.ready) {
    const detail = readiness.reason ?? 'The calendar could not be reached.';
    return looksLikeScopeError(detail) ? { status: 'insufficient_scope', detail } : { status: 'calendar_inaccessible', detail };
  }

  return { status: 'ready', connector };
}

/**
 * A real, fetch-backed GoogleCalendarHttpTransport - the one this
 * factory's own tests never use (they inject a fake instead, like every
 * other connector test in this codebase) and that server.ts does not
 * call either while CALENDAR_PROTECTION_EXECUTION_ENABLED is false (see
 * this file's own header). `fetchImpl` is injectable so even THIS
 * function's own shape can be unit-tested without a real network call.
 */
export function createRealGoogleCalendarHttpTransport(fetchImpl: typeof fetch = fetch): GoogleCalendarHttpTransport {
  return async (request: GoogleCalendarTransportRequest): Promise<GoogleCalendarHttpResponse> => {
    const response = await fetchImpl(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body ? JSON.stringify(request.body) : undefined,
    });
    // Google's delete returns 204 No Content - nothing to parse, and
    // calling .json() on an empty body would throw.
    let body: any = null;
    if (response.status !== 204) {
      try {
        body = await response.json();
      } catch {
        body = null; // A non-JSON body is treated the same as no body - callers only ever read specific known fields off it.
      }
    }
    return { status: response.status, body };
  };
}
