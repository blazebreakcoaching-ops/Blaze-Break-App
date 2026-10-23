// Phase 5F, directive §2 (PRIORITY ZERO) — regression tests proving
// deliberately injected sentinel secrets never appear in export output,
// and that normal, non-secret user data continues to export unchanged.

import { describe, it, expect } from 'vitest';
import { sanitiseExportDoc, sanitiseExportDocs, sanitiseExportCollectionsMap } from './export-credential-sanitiser';

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
