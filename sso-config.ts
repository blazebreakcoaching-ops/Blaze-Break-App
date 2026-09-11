import crypto from 'crypto';

// Pure logic (plus real, but I/O-free, AES-256-GCM encryption) for
// Enterprise SSO configuration - kept unit-tested, same pattern as the
// rest of this Enterprise backend. server.ts owns reading/writing
// organisations/{orgId}/sso_config/config, reading the
// SSO_CONFIG_ENCRYPTION_KEY env var and the platform feature flag that
// gates real enforcement, and any network calls (e.g. the "test
// configuration" route's metadataUrl reachability check).
//
// The real blocker this chunk cannot resolve on its own: there is no real
// SAML/OIDC assertion validation possible on this Firebase project without
// either a paid Identity Platform upgrade or a third-party IdP proxy - both
// real infrastructure decisions outside a single backend-foundation PR's
// authority. See docs/SSO_INTEGRATION_PLAN.md. This module is the schema
// and service boundary that real integration would plug into, built so
// nothing here has to change when that decision is made - except swapping
// out whatever performs the actual assertion/token validation.

export const SSO_PROVIDER_TYPES = ['saml', 'oidc'] as const;
export type SsoProviderType = (typeof SSO_PROVIDER_TYPES)[number];
export const isSsoProviderType = (value: unknown): value is SsoProviderType =>
  typeof value === 'string' && (SSO_PROVIDER_TYPES as readonly string[]).includes(value);

// SSO auto-provisioning (jitProvisioning) can only ever hand a new user one
// of these two roles - never 'owner', 'admin', or any of the specialised
// admin roles. An identity provider asserting a user's org membership is
// not a basis for granting administrative access; that must always be a
// deliberate action by an existing org admin.
export const ALLOWED_JIT_ROLES = ['member', 'viewer'] as const;
export type AllowedJitRole = (typeof ALLOWED_JIT_ROLES)[number];
export const isAllowedJitRole = (value: unknown): value is AllowedJitRole =>
  typeof value === 'string' && (ALLOWED_JIT_ROLES as readonly string[]).includes(value);

const isHttpsUrl = (value: string): boolean => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const MAX_ALLOWED_DOMAINS = 50;

export interface SsoValidationResult {
  valid: boolean;
  error?: string;
}

const validateAllowedDomains = (value: unknown): SsoValidationResult => {
  if (!Array.isArray(value)) {
    return { valid: false, error: '"allowedDomains" must be an array of domain names.' };
  }
  if (value.length > MAX_ALLOWED_DOMAINS) {
    return { valid: false, error: `"allowedDomains" cannot list more than ${MAX_ALLOWED_DOMAINS} domains.` };
  }
  for (const domain of value) {
    if (typeof domain !== 'string' || !DOMAIN_PATTERN.test(domain)) {
      return { valid: false, error: `"${domain}" is not a valid domain name.` };
    }
  }
  return { valid: true };
};

// Validates a proposed SSO config write. `encryptionConfigured` reflects
// whether SSO_CONFIG_ENCRYPTION_KEY is set on the server - an inline
// clientSecret is refused outright when it isn't, rather than being stored
// unencrypted or fake-encrypted. `secretRef` (a pointer to a secret held
// elsewhere, e.g. a secret manager path) is always accepted regardless,
// since this backend never needs to see that secret at all in that case.
export const validateSsoConfigInput = (input: unknown, encryptionConfigured: boolean): SsoValidationResult => {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'An SSO configuration object is required.' };
  }
  const candidate = input as Record<string, unknown>;
  if (!isSsoProviderType(candidate.providerType)) {
    return { valid: false, error: `"providerType" must be one of: ${SSO_PROVIDER_TYPES.join(', ')}.` };
  }
  if (typeof candidate.issuer !== 'string' || candidate.issuer.trim().length === 0) {
    return { valid: false, error: '"issuer" must be a non-empty string.' };
  }
  if (typeof candidate.clientId !== 'string' || candidate.clientId.trim().length === 0) {
    return { valid: false, error: '"clientId" must be a non-empty string.' };
  }
  if (candidate.metadataUrl !== undefined && candidate.metadataUrl !== null) {
    if (typeof candidate.metadataUrl !== 'string' || !isHttpsUrl(candidate.metadataUrl)) {
      return { valid: false, error: '"metadataUrl" must be a valid https:// URL.' };
    }
  }
  if (candidate.allowedDomains !== undefined) {
    const domainsResult = validateAllowedDomains(candidate.allowedDomains);
    if (!domainsResult.valid) return domainsResult;
  }
  if (candidate.jitProvisioning !== undefined && typeof candidate.jitProvisioning !== 'boolean') {
    return { valid: false, error: '"jitProvisioning" must be true or false.' };
  }
  if (candidate.defaultRole !== undefined && !isAllowedJitRole(candidate.defaultRole)) {
    return {
      valid: false,
      error: `"defaultRole" must be one of: ${ALLOWED_JIT_ROLES.join(', ')} - SSO auto-provisioning can never grant an elevated role.`,
    };
  }
  if (candidate.clientSecret !== undefined && candidate.secretRef !== undefined) {
    return { valid: false, error: 'Provide either "clientSecret" or "secretRef", not both.' };
  }
  if (candidate.clientSecret !== undefined) {
    if (typeof candidate.clientSecret !== 'string' || candidate.clientSecret.length === 0) {
      return { valid: false, error: '"clientSecret" must be a non-empty string.' };
    }
    if (!encryptionConfigured) {
      return {
        valid: false,
        error:
          'An inline "clientSecret" cannot be stored because SSO_CONFIG_ENCRYPTION_KEY is not configured on this server. Provide "secretRef" (a reference to a secret stored elsewhere) instead.',
      };
    }
  }
  if (candidate.secretRef !== undefined && (typeof candidate.secretRef !== 'string' || candidate.secretRef.trim().length === 0)) {
    return { valid: false, error: '"secretRef" must be a non-empty string.' };
  }
  return { valid: true };
};

// ---- Real encryption, gated entirely by the caller supplying a key ----

const ALGORITHM = 'aes-256-gcm';

export interface EncryptedSecret {
  iv: string;
  authTag: string;
  ciphertext: string;
}

// Derives a 32-byte AES key from whatever string SSO_CONFIG_ENCRYPTION_KEY
// holds, via SHA-256, so an operator isn't required to hand-generate an
// exact-length key.
const deriveKey = (rawKey: string): Buffer => crypto.createHash('sha256').update(rawKey).digest();

export const encryptSecret = (plaintext: string, rawKey: string): EncryptedSecret => {
  const key = deriveKey(rawKey);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
};

export const decryptSecret = (encrypted: EncryptedSecret, rawKey: string): string => {
  const key = deriveKey(rawKey);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(encrypted.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(encrypted.ciphertext, 'base64')), decipher.final()]);
  return plaintext.toString('utf8');
};

// ---- Enforcement gating ----

// Turning enforceSso on for any org would lock every one of that org's
// members out the moment they don't have a working SSO login path - since
// no real SAML/OIDC validation is wired up yet (see the module docstring),
// that is true for every org today. This function is the single place
// that decision is made: enforcement can only ever be enabled while a
// platform-wide feature flag is explicitly on. Disabling enforcement is
// never gated - turning off something risky must always be possible.
export const canEnableSsoEnforcement = (featureFlagEnabled: boolean): boolean => featureFlagEnabled === true;

// ---- Redaction ----

export interface StoredSsoConfig {
  providerType: SsoProviderType;
  issuer: string;
  clientId: string;
  metadataUrl: string | null;
  allowedDomains: string[];
  enforceSso: boolean;
  jitProvisioning: boolean;
  defaultRole: AllowedJitRole;
  encryptedSecret: EncryptedSecret | null;
  secretRef: string | null;
  updatedAt?: string;
  updatedBy?: string;
}

// The only shape of an SSO config that should ever leave this backend in a
// response. `encryptedSecret`'s raw fields (iv/authTag/ciphertext) are
// never included, even though they're already encrypted - only whether a
// secret is present at all. `secretRef` is safe to return as-is: it's a
// pointer to where a secret lives, not the secret itself.
export const redactSsoConfig = (stored: StoredSsoConfig) => ({
  providerType: stored.providerType,
  issuer: stored.issuer,
  clientId: stored.clientId,
  metadataUrl: stored.metadataUrl,
  allowedDomains: stored.allowedDomains,
  enforceSso: stored.enforceSso,
  jitProvisioning: stored.jitProvisioning,
  defaultRole: stored.defaultRole,
  hasSecret: !!(stored.encryptedSecret || stored.secretRef),
  secretRef: stored.secretRef,
  updatedAt: stored.updatedAt,
});
