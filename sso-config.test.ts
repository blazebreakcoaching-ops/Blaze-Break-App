import { describe, it, expect } from 'vitest';
import {
  SSO_PROVIDER_TYPES,
  isSsoProviderType,
  ALLOWED_JIT_ROLES,
  isAllowedJitRole,
  validateSsoConfigInput,
  encryptSecret,
  decryptSecret,
  canEnableSsoEnforcement,
  redactSsoConfig,
} from './sso-config';

describe('isSsoProviderType / isAllowedJitRole', () => {
  it('accepts every registered provider type and JIT role', () => {
    for (const t of SSO_PROVIDER_TYPES) expect(isSsoProviderType(t)).toBe(true);
    for (const r of ALLOWED_JIT_ROLES) expect(isAllowedJitRole(r)).toBe(true);
  });

  it('rejects unknown values', () => {
    expect(isSsoProviderType('ldap')).toBe(false);
    expect(isAllowedJitRole('owner')).toBe(false);
    expect(isAllowedJitRole('admin')).toBe(false);
    expect(isAllowedJitRole('security_admin')).toBe(false);
  });
});

describe('validateSsoConfigInput', () => {
  const valid = { providerType: 'oidc', issuer: 'https://idp.example.com', clientId: 'client-123' };

  it('accepts a minimal valid config', () => {
    expect(validateSsoConfigInput(valid, false)).toEqual({ valid: true });
  });

  it('rejects null, undefined, and non-object input', () => {
    expect(validateSsoConfigInput(null, false).valid).toBe(false);
    expect(validateSsoConfigInput(undefined, false).valid).toBe(false);
    expect(validateSsoConfigInput('nope', false).valid).toBe(false);
  });

  it('rejects an unknown providerType', () => {
    expect(validateSsoConfigInput({ ...valid, providerType: 'ldap' }, false).valid).toBe(false);
  });

  it('rejects a missing or empty issuer/clientId', () => {
    expect(validateSsoConfigInput({ providerType: 'oidc', clientId: 'x' }, false).valid).toBe(false);
    expect(validateSsoConfigInput({ providerType: 'oidc', issuer: '  ', clientId: 'x' }, false).valid).toBe(false);
    expect(validateSsoConfigInput({ ...valid, clientId: '' }, false).valid).toBe(false);
  });

  it('rejects a non-https metadataUrl', () => {
    expect(validateSsoConfigInput({ ...valid, metadataUrl: 'http://idp.example.com/meta' }, false).valid).toBe(false);
    expect(validateSsoConfigInput({ ...valid, metadataUrl: 'not-a-url' }, false).valid).toBe(false);
  });

  it('accepts a valid https metadataUrl', () => {
    expect(validateSsoConfigInput({ ...valid, metadataUrl: 'https://idp.example.com/meta' }, false).valid).toBe(true);
  });

  it('rejects a malformed allowedDomains entry', () => {
    expect(validateSsoConfigInput({ ...valid, allowedDomains: ['not a domain'] }, false).valid).toBe(false);
    expect(validateSsoConfigInput({ ...valid, allowedDomains: 'example.com' }, false).valid).toBe(false);
  });

  it('accepts valid allowedDomains', () => {
    expect(validateSsoConfigInput({ ...valid, allowedDomains: ['example.com', 'sub.example.co.uk'] }, false).valid).toBe(true);
  });

  it('rejects defaultRole outside member/viewer - never lets JIT provisioning grant an elevated role', () => {
    expect(validateSsoConfigInput({ ...valid, defaultRole: 'owner' }, false).valid).toBe(false);
    expect(validateSsoConfigInput({ ...valid, defaultRole: 'admin' }, false).valid).toBe(false);
    expect(validateSsoConfigInput({ ...valid, defaultRole: 'security_admin' }, false).valid).toBe(false);
  });

  it('accepts defaultRole of member or viewer', () => {
    expect(validateSsoConfigInput({ ...valid, defaultRole: 'member' }, false).valid).toBe(true);
    expect(validateSsoConfigInput({ ...valid, defaultRole: 'viewer' }, false).valid).toBe(true);
  });

  it('rejects both clientSecret and secretRef provided at once', () => {
    const res = validateSsoConfigInput({ ...valid, clientSecret: 's3cret', secretRef: 'vault://x' }, true);
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/not both/);
  });

  it('rejects an inline clientSecret when encryption is not configured', () => {
    const res = validateSsoConfigInput({ ...valid, clientSecret: 's3cret' }, false);
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/SSO_CONFIG_ENCRYPTION_KEY/);
  });

  it('accepts an inline clientSecret when encryption is configured', () => {
    expect(validateSsoConfigInput({ ...valid, clientSecret: 's3cret' }, true).valid).toBe(true);
  });

  it('accepts a secretRef regardless of whether encryption is configured', () => {
    expect(validateSsoConfigInput({ ...valid, secretRef: 'vault://path' }, false).valid).toBe(true);
    expect(validateSsoConfigInput({ ...valid, secretRef: 'vault://path' }, true).valid).toBe(true);
  });

  it('rejects an empty secretRef', () => {
    expect(validateSsoConfigInput({ ...valid, secretRef: '  ' }, false).valid).toBe(false);
  });
});

describe('encryptSecret / decryptSecret', () => {
  const key = 'a-sufficiently-random-test-key-value';

  it('round-trips a secret exactly', () => {
    const encrypted = encryptSecret('super-secret-client-secret', key);
    expect(decryptSecret(encrypted, key)).toBe('super-secret-client-secret');
  });

  it('never stores the plaintext anywhere in the encrypted output', () => {
    const plaintext = 'super-secret-client-secret';
    const encrypted = encryptSecret(plaintext, key);
    const serialized = JSON.stringify(encrypted);
    expect(serialized).not.toContain(plaintext);
  });

  it('produces a different ciphertext each time (random IV), even for the same input', () => {
    const a = encryptSecret('same-secret', key);
    const b = encryptSecret('same-secret', key);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });

  it('fails to decrypt with the wrong key', () => {
    const encrypted = encryptSecret('super-secret-client-secret', key);
    expect(() => decryptSecret(encrypted, 'a-completely-different-key')).toThrow();
  });

  it('fails to decrypt if the ciphertext has been tampered with', () => {
    const encrypted = encryptSecret('super-secret-client-secret', key);
    const tampered = { ...encrypted, ciphertext: Buffer.from('tampered-data-here').toString('base64') };
    expect(() => decryptSecret(tampered, key)).toThrow();
  });
});

describe('canEnableSsoEnforcement', () => {
  it('is false while the platform feature flag is off - the default, safe state', () => {
    expect(canEnableSsoEnforcement(false)).toBe(false);
  });

  it('is true only when the flag is explicitly on', () => {
    expect(canEnableSsoEnforcement(true)).toBe(true);
  });
});

describe('redactSsoConfig', () => {
  const stored = {
    providerType: 'oidc' as const,
    issuer: 'https://idp.example.com',
    clientId: 'client-123',
    metadataUrl: null,
    allowedDomains: ['example.com'],
    enforceSso: false,
    jitProvisioning: false,
    defaultRole: 'member' as const,
    encryptedSecret: { iv: 'abc', authTag: 'def', ciphertext: 'ghi' },
    secretRef: null,
  };

  it('never includes the raw encryptedSecret fields', () => {
    const redacted = redactSsoConfig(stored);
    expect((redacted as any).encryptedSecret).toBeUndefined();
    expect(JSON.stringify(redacted)).not.toContain('ghi');
  });

  it('reports hasSecret: true when an encrypted secret is present', () => {
    expect(redactSsoConfig(stored).hasSecret).toBe(true);
  });

  it('reports hasSecret: true when only a secretRef is present, and includes the ref', () => {
    const redacted = redactSsoConfig({ ...stored, encryptedSecret: null, secretRef: 'vault://path' });
    expect(redacted.hasSecret).toBe(true);
    expect(redacted.secretRef).toBe('vault://path');
  });

  it('reports hasSecret: false when neither is present', () => {
    expect(redactSsoConfig({ ...stored, encryptedSecret: null, secretRef: null }).hasSecret).toBe(false);
  });
});
