// Phase 5F, directive §2 (PRIORITY ZERO) — regression tests proving
// deliberately injected sentinel secrets never appear in export output,
// and that normal, non-secret user data continues to export unchanged.

import { describe, it, expect } from 'vitest';
import {
  sanitiseExportDoc, sanitiseExportDocs, sanitiseExportCollectionsMap, sanitiseExportDocsForCollection,
  extractOAuthFailureDiagnostics,
} from './export-credential-sanitiser';

// A sentinel value distinctive enough that its presence anywhere in a
// JSON.stringify of the output is unambiguous proof of a leak.
const SENTINEL = 'SENTINEL_SECRET_MUST_NEVER_LEAK_9f3a7c';

describe('sanitiseExportDoc - the exact three Phase 5E-identified collections', () => {
  it('redacts integration_tokens (accessToken, refreshToken)', () => {
    const { doc, redactedFields } = sanitiseExportDoc({
      accessToken: SENTINEL, refreshToken: SENTINEL, expiresAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(JSON.stringify(doc)).not.toContain(SENTINEL);
    expect(doc).toEqual({ expiresAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
    expect(redactedFields.sort()).toEqual(['accessToken', 'refreshToken']);
  });

  it('redacts oauth_pkce (codeVerifier)', () => {
    const { doc, redactedFields } = sanitiseExportDoc({ codeVerifier: SENTINEL, createdAt: '2026-01-01T00:00:00.000Z' });
    expect(JSON.stringify(doc)).not.toContain(SENTINEL);
    expect(doc).toEqual({ createdAt: '2026-01-01T00:00:00.000Z' });
    expect(redactedFields).toEqual(['codeVerifier']);
  });

  it('redacts security/mfa_totp (secretEncrypted, pendingSecretEncrypted, recoveryCodesHashed) while keeping safe status fields', () => {
    const { doc, redactedFields } = sanitiseExportDoc({
      secretEncrypted: SENTINEL,
      pendingSecretEncrypted: SENTINEL,
      recoveryCodesHashed: [{ hash: SENTINEL, usedAt: null }],
      enabled: true,
      enrolledAt: '2026-01-01T00:00:00.000Z',
      lastVerifiedAt: '2026-01-01T00:00:00.000Z',
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(JSON.stringify(doc)).not.toContain(SENTINEL);
    expect(doc).toEqual({
      enabled: true, enrolledAt: '2026-01-01T00:00:00.000Z', lastVerifiedAt: '2026-01-01T00:00:00.000Z',
      failedAttempts: 0, lockedUntil: null, updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(redactedFields.sort()).toEqual(['pendingSecretEncrypted', 'recoveryCodesHashed', 'secretEncrypted']);
  });
});

describe('sanitiseExportDoc - the new finding this phase: recovery_ally.shareToken', () => {
  it('redacts the live ally-invite bearer token while keeping relationship metadata', () => {
    const { doc, redactedFields } = sanitiseExportDoc({
      isInvited: true, allyName: 'Jordan', allyEmail: 'jordan@example.com',
      shareToken: SENTINEL, invitedAt: '2026-01-01T00:00:00.000Z',
      consentStatus: 'pending', inviteExpiresAt: '2026-01-08T00:00:00.000Z',
    });
    expect(JSON.stringify(doc)).not.toContain(SENTINEL);
    expect(doc).toEqual({
      isInvited: true, allyName: 'Jordan', allyEmail: 'jordan@example.com',
      invitedAt: '2026-01-01T00:00:00.000Z', consentStatus: 'pending', inviteExpiresAt: '2026-01-08T00:00:00.000Z',
    });
    expect(redactedFields).toEqual(['shareToken']);
  });
});

describe('sanitiseExportDoc - generic naming-pattern catch, independent of any hand-maintained collection list', () => {
  it.each([
    'accessToken', 'refreshToken', 'idToken', 'sessionToken', 'bearerToken', 'apiToken', 'csrfToken', 'xsrfToken', 'shareToken', 'inviteToken',
    'clientSecret', 'webhookSecret', 'signingSecret', 'secretValue',
    'password', 'userPassword',
    'apiKey', 'api_key', 'ApiKey',
    'codeVerifier', 'code_verifier',
    'privateKey', 'signingKey',
    'credential', 'oauthCredential',
  ])('redacts a never-before-seen field named "%s" by naming pattern alone', (fieldName) => {
    const { doc, redactedFields } = sanitiseExportDoc({ [fieldName]: SENTINEL, harmlessField: 'keep me' });
    expect(JSON.stringify(doc)).not.toContain(SENTINEL);
    expect(doc).toEqual({ harmlessField: 'keep me' });
    expect(redactedFields).toEqual([fieldName]);
  });

  it('redacts a secret nested one level deep (e.g. a future { auth: { accessToken } } shape)', () => {
    const { doc } = sanitiseExportDoc({ auth: { accessToken: SENTINEL, provider: 'google' }, title: 'keep me' });
    expect(JSON.stringify(doc)).not.toContain(SENTINEL);
    expect(doc).toEqual({ auth: { provider: 'google' }, title: 'keep me' });
  });

  it('does not recurse into arrays of primitives or Firestore-Timestamp-like objects', () => {
    const fakeTimestamp = { toDate: () => new Date('2026-01-01T00:00:00.000Z'), seconds: 1, nanoseconds: 0 };
    const { doc } = sanitiseExportDoc({ tags: ['a', 'b'], when: fakeTimestamp });
    expect(doc.tags).toEqual(['a', 'b']);
    expect(doc.when).toBe(fakeTimestamp);
  });
});

describe('sanitiseExportDoc - normal, non-secret user data is never touched', () => {
  it.each([
    'title', 'description', 'startIso', 'endIso', 'state', 'failureReason', 'retryCount', 'externalEventId',
    'createdAt', 'updatedAt', 'expiresAt', 'connectedAt', 'enrolledAt', 'invitedAt', 'inviteExpiresAt',
    'connectedAccountEmail', 'allyName', 'allyEmail', 'contactDisplayName', 'consentStatus', 'isInvited',
    'proposalId', 'idempotencyKey', 'approvalFingerprint',
  ])('leaves an ordinary field named "%s" completely unchanged', (fieldName) => {
    const value = 'some ordinary value';
    const { doc, redactedFields } = sanitiseExportDoc({ [fieldName]: value });
    expect(doc).toEqual({ [fieldName]: value });
    expect(redactedFields).toEqual([]);
  });

  it('a document with nothing to redact gets no redactedForSecurity marker', () => {
    const docs = sanitiseExportDocs([{ id: 'a', title: 'hello' }]);
    expect(docs).toEqual([{ id: 'a', title: 'hello' }]);
  });
});

describe('sanitiseExportDocs / sanitiseExportCollectionsMap', () => {
  it('marks a document that had something redacted, across a whole array', () => {
    const docs = sanitiseExportDocs([
      { id: 'a', accessToken: SENTINEL, refreshToken: SENTINEL },
      { id: 'b', title: 'nothing secret here' },
    ]);
    expect(JSON.stringify(docs)).not.toContain(SENTINEL);
    expect(docs).toEqual([
      { id: 'a', redactedForSecurity: true },
      { id: 'b', title: 'nothing secret here' },
    ]);
  });

  it('sanitises every collection in a full collections map, including one never explicitly named in this file', () => {
    const map = sanitiseExportCollectionsMap({
      integration_tokens: [{ id: 'slack', accessToken: SENTINEL }],
      some_future_collection_nobody_has_seen_yet: [{ id: 'x', apiKey: SENTINEL, label: 'keep' }],
      guardian_alerts: [{ id: 'g1', contactName: 'Alex', state: 'sent' }],
    });
    expect(JSON.stringify(map)).not.toContain(SENTINEL);
    expect(map.integration_tokens).toEqual([{ id: 'slack', redactedForSecurity: true }]);
    expect(map.some_future_collection_nobody_has_seen_yet).toEqual([{ id: 'x', label: 'keep', redactedForSecurity: true }]);
    expect(map.guardian_alerts).toEqual([{ id: 'g1', contactName: 'Alex', state: 'sent' }]);
  });
});

// Independent security-hotfix review (SECURITY_HOTFIX_INDEPENDENT_REVIEW_REPORT.md).
describe('sanitiseExportDocsForCollection - deny-by-default allowlist for known secret-bearing collections', () => {
  it.each([
    ['integration_tokens', { id: 'slack', accessToken: SENTINEL, refreshToken: SENTINEL, expiresAt: 'x', updatedAt: 'x' }, { id: 'slack', expiresAt: 'x', updatedAt: 'x', redactedForSecurity: true }],
    ['oauth_pkce', { id: 'google_calendar_actions', codeVerifier: SENTINEL, createdAt: 'x' }, { id: 'google_calendar_actions', createdAt: 'x', redactedForSecurity: true }],
    ['security', { id: 'mfa_totp', secretEncrypted: SENTINEL, pendingSecretEncrypted: SENTINEL, recoveryCodesHashed: [{ hash: SENTINEL }], enabled: true, enrolledAt: 'x', lastVerifiedAt: 'x', failedAttempts: 0, lockedUntil: null, updatedAt: 'x' }, { id: 'mfa_totp', enabled: true, enrolledAt: 'x', lastVerifiedAt: 'x', failedAttempts: 0, lockedUntil: null, updatedAt: 'x', redactedForSecurity: true }],
    ['recovery_ally', { id: 'state', isInvited: true, allyName: 'Jordan', allyEmail: 'jordan@example.com', shareToken: SENTINEL, invitedAt: 'x', consentStatus: 'pending', inviteExpiresAt: 'x', consentRespondedAt: null, permissions: {}, sharingPaused: false, lastViewedAt: null }, { id: 'state', isInvited: true, allyName: 'Jordan', allyEmail: 'jordan@example.com', invitedAt: 'x', consentStatus: 'pending', inviteExpiresAt: 'x', consentRespondedAt: null, permissions: {}, sharingPaused: false, lastViewedAt: null, redactedForSecurity: true }],
    ['push_subscriptions', { id: 'sub1', endpoint: 'https://fcm.example/x', expirationTime: null, keys: { p256dh: 'pub', auth: SENTINEL }, subscribedAt: 'x' }, { id: 'sub1', endpoint: 'https://fcm.example/x', expirationTime: null, subscribedAt: 'x', redactedForSecurity: true }],
  ])('%s: keeps only the allowlisted fields, drops everything else including fields matching no naming pattern', (collectionId, input, expected) => {
    const [result] = sanitiseExportDocsForCollection(collectionId, [input]);
    expect(JSON.stringify(result)).not.toContain(SENTINEL);
    expect(result).toEqual(expected);
  });

  it('an unanticipated, non-secret-shaped field on a known collection is still dropped (deny-by-default, not deny-by-pattern)', () => {
    const [result] = sanitiseExportDocsForCollection('integration_tokens', [
      { id: 'slack', expiresAt: 'x', updatedAt: 'x', somethingNobodyNamedYet: 'not secret-shaped at all' },
    ]);
    expect(result).toEqual({ id: 'slack', expiresAt: 'x', updatedAt: 'x', redactedForSecurity: true });
  });

  it('falls back to the generic pattern-based sanitiser for a collection not in the known-secret allowlist', () => {
    const [result] = sanitiseExportDocsForCollection('mood_pulses', [
      { id: 'mp1', moodLabel: 'calm', accessToken: SENTINEL },
    ]);
    expect(result).toEqual({ id: 'mp1', moodLabel: 'calm', redactedForSecurity: true });
  });

  it('sanitiseExportCollectionsMap routes a known collection through the allowlist and an unknown one through the generic pattern', () => {
    const map = sanitiseExportCollectionsMap({
      push_subscriptions: [{ id: 'sub1', endpoint: 'https://fcm.example/x', keys: { p256dh: 'pub', auth: SENTINEL } }],
      guardian_alerts: [{ id: 'g1', contactName: 'Alex' }],
    });
    expect(JSON.stringify(map)).not.toContain(SENTINEL);
    expect(map.push_subscriptions[0].keys).toBeUndefined();
    expect(map.guardian_alerts).toEqual([{ id: 'g1', contactName: 'Alex' }]);
  });
});

describe('generic pattern broadened hash$ suffix (independent review finding)', () => {
  it.each(['verificationHash', 'otpHash', 'pinHash', 'deviceHash'])(
    'redacts a field named "%s" even though it is not the exact literal name "hash"',
    (fieldName) => {
      const { doc, redactedFields } = sanitiseExportDoc({ [fieldName]: SENTINEL, title: 'keep' });
      expect(doc).toEqual({ title: 'keep' });
      expect(redactedFields).toEqual([fieldName]);
    },
  );

  it('still redacts the exact literal field name "hash"', () => {
    const { doc, redactedFields } = sanitiseExportDoc({ hash: SENTINEL, title: 'keep' });
    expect(doc).toEqual({ title: 'keep' });
    expect(redactedFields).toEqual(['hash']);
  });

  it('does not false-positive on an unrelated field that merely contains a similar substring', () => {
    const { doc, redactedFields } = sanitiseExportDoc({ hashtagsUsed: ['#recovery'], crashReportId: 'cr1' });
    expect(doc).toEqual({ hashtagsUsed: ['#recovery'], crashReportId: 'cr1' });
    expect(redactedFields).toEqual([]);
  });
});

// Independent security-hotfix review, directive §3: logging an OAuth
// failure must collect ONLY a fixed, known-safe diagnostic allowlist -
// never the raw payload with secrets subtracted out after the fact.
describe('extractOAuthFailureDiagnostics', () => {
  it('never includes a sentinel access/refresh token or client secret present alongside a standard OAuth2 error shape', () => {
    const diagnostics = extractOAuthFailureDiagnostics({
      error: 'invalid_grant',
      error_description: 'Token has been expired or revoked.',
      access_token: SENTINEL,
      refresh_token: SENTINEL,
      client_secret: SENTINEL,
    });
    expect(JSON.stringify(diagnostics)).not.toContain(SENTINEL);
    expect(diagnostics.error).toBe('invalid_grant');
    expect(diagnostics.errorDescription).toBe('Token has been expired or revoked.');
    expect(diagnostics.otherFieldNames.sort()).toEqual(['access_token', 'client_secret', 'refresh_token']);
  });

  it('handles Slack\'s own {ok, error} shape, never including a sentinel authed_user token block', () => {
    const diagnostics = extractOAuthFailureDiagnostics({
      ok: false,
      error: 'invalid_code',
      authed_user: { access_token: SENTINEL, refresh_token: SENTINEL },
    });
    expect(JSON.stringify(diagnostics)).not.toContain(SENTINEL);
    expect(diagnostics.ok).toBe(false);
    expect(diagnostics.error).toBe('invalid_code');
    expect(diagnostics.otherFieldNames).toEqual(['authed_user']);
  });

  it('handles a null/undefined body without throwing', () => {
    expect(extractOAuthFailureDiagnostics(null)).toEqual({ error: null, errorDescription: null, errorUri: null, ok: null, otherFieldNames: [] });
    expect(extractOAuthFailureDiagnostics(undefined)).toEqual({ error: null, errorDescription: null, errorUri: null, ok: null, otherFieldNames: [] });
  });

  it('only reports field NAMES for unrecognised fields, never their values, even when the value is itself an object', () => {
    const diagnostics = extractOAuthFailureDiagnostics({ error: 'server_error', weirdNestedThing: { nested: SENTINEL } });
    expect(JSON.stringify(diagnostics)).not.toContain(SENTINEL);
    expect(diagnostics.otherFieldNames).toEqual(['weirdNestedThing']);
  });
});
