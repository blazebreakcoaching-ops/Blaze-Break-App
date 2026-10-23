// Centralised server-side export sanitisation (Phase 5F, directive §2 —
// PRIORITY ZERO).
//
// THE FINDING THIS FILE CLOSES: `/api/user/export`'s generic
// `listCollections()` dump (server.ts) copies every direct subcollection
// under `users/{uid}` into the export response VERBATIM, with only
// `nhei_evidence`/`nhei_temporal_relations` excluded (they get their own
// properly-assembled export instead). That generic dump never excluded
// `integration_tokens` (raw OAuth access/refresh tokens),
// `oauth_pkce` (a live PKCE code_verifier), `security` (the AES-256-GCM-
// encrypted TOTP secret, a pending enrollment secret, and hashed recovery
// codes), or `recovery_ally` (a live bearer `shareToken` used by
// `where("shareToken", "==", token)` lookups in the ally-consent routes —
// a real magic-link credential, not just metadata). A user's own GDPR
// export file is downloaded, and from that point on lives wherever THEY
// put it — synced to cloud storage, emailed to themselves, left on a
// shared machine — none of which is a boundary this app controls. A
// right of access to "what personal data do you hold about me" does not
// require handing back a live, reusable credential that could be used
// to authenticate as them (OAuth tokens), pose as their calendar-write
// grant (same), reconstruct their 2FA secret (ciphertext, but still
// defense-in-depth), or claim their pending Recovery Ally invite before
// the real invitee does (shareToken).
//
// THE POLICY: three layers, deliberately redundant with each other -
// 1. A generic, naming-pattern redaction that fires on ANY field whose
//    name matches a known credential-naming convention, regardless of
//    which collection it's in. This is the guard against a FUTURE
//    collection introducing a new secret field without anyone updating
//    this file - the same "don't rely on a hand-maintained list staying
//    current" reasoning user-data-collections.ts already applies to
//    stray top-level collections.
// 2. An explicit list for fields that are genuinely reusable credentials
//    but whose name doesn't say so (`recoveryCodesHashed` — a recovery
//    code is a password, even though the field name doesn't contain
//    "secret" or "token").
// 3. (Added by the independent security-hotfix review) For collections
//    KNOWN in advance to hold a reusable credential
//    (KNOWN_SECRET_COLLECTION_SAFE_FIELDS), an explicit safe-field
//    ALLOWLIST - deny-by-default, not deny-by-pattern. This is strictly
//    stronger than layers 1-2 for those specific collections: a field
//    that matches no naming convention at all is still dropped there,
//    because it isn't on the list of fields known to be safe. Layers 1-2
//    remain the only defence for every OTHER representation this route
//    assembles (the NHEI export, the root profile doc, any not-yet-
//    classified stray collection) - this layer intentionally does not
//    replace them.
//
// A redacted field is OMITTED entirely, never replaced with a placeholder
// string - a placeholder could itself be mistaken for real data by
// whatever the user does with the exported file next. `redactedFields`
// summarises what (if anything) was removed from a given document, so a
// caller can note the omission without guessing at it.
//
// Applied to EVERY representation this route assembles (the generic
// per-collection dump, the stray top-level collections, and even the NHEI
// export and the root profile doc, as defense-in-depth) - not just a
// hand-picked subset - per the directive's own "apply to every supported
// export representation" instruction.

// Independent review finding (security-hotfix review, directive §2): the
// original pattern anchored its hash check to `^hash$` - an EXACT field
// name match - while every other alternative here is a "contains"/"ends
// with" match. That inconsistency meant a hypothetical future field named
// e.g. `otpHash` or `verificationHash` would NOT be caught by this generic
// layer at all (it isn't "hash" exactly, and contains none of the other
// substrings), and would depend entirely on someone remembering to add it
// to EXPLICIT_SECRET_FIELD_NAMES below or to a collection's safe-field
// allowlist. Changed to `hash$` (an unanchored suffix match, consistent
// with how `token$` already behaves) so any field name ending in "hash"
// is caught by this layer alone, with no realistic false-positive risk -
// no legitimate, non-hash-related field in this codebase ends in that
// substring.
const GENERIC_SECRET_FIELD_PATTERN =
  /(access|refresh|id|session|bearer|auth|api|csrf|xsrf)?[-_]?token$|secret|credential|password|apikey|api[-_]?key|code[-_]?verifier|private[-_]?key|signing[-_]?key|client[-_]?secret|hash$/i;

// Fields that are genuine reusable credentials but don't match the naming
// pattern above.
const EXPLICIT_SECRET_FIELD_NAMES = new Set<string>(['recoveryCodesHashed']);

// Independent review finding (security-hotfix review, directive §2): for
// collections KNOWN to hold a genuine reusable credential, deny-by-default
// (an explicit allowlist of safe fields to KEEP) is a stronger guarantee
// than negative naming-pattern matching (a denylist of secret-shaped names
// to DROP) - a field that doesn't happen to match any naming convention
// above, in one of these specific collections, is still dropped here,
// rather than silently exported because nobody anticipated its name.
//
// `push_subscriptions` (users/{uid}/push_subscriptions/{id}) is a genuine
// finding from this independent review, not part of the original Phase 5F
// audit: its `keys.auth` field is a real, reusable Web Push authentication
// secret (RFC 8291) that matched NO existing pattern - "auth" alone is too
// generic a word to safely denylist globally (it would wrongly redact
// legitimate fields like `isAuthenticated` or `authorName` elsewhere), but
// is trivially safe to exclude from this one collection's own allowlist.
// The sibling `keys.p256dh` field is the subscription's PUBLIC key (not
// secret, per the same RFC) but is dropped too anyway, since a whole
// nested object is either in the allowlist or it isn't - nothing in this
// codebase's export UI depends on the user seeing their own p256dh value.
const KNOWN_SECRET_COLLECTION_SAFE_FIELDS: Record<string, Set<string>> = {
  integration_tokens: new Set(['id', 'expiresAt', 'updatedAt']),
  oauth_pkce: new Set(['id', 'createdAt']),
  security: new Set(['id', 'enabled', 'enrolledAt', 'lastVerifiedAt', 'failedAttempts', 'lockedUntil', 'updatedAt']),
  recovery_ally: new Set([
    'id', 'isInvited', 'allyName', 'allyEmail', 'invitedAt', 'consentStatus',
    'inviteExpiresAt', 'updatedAt', 'consentRespondedAt', 'permissions',
    'sharingPaused', 'lastViewedAt',
  ]),
  push_subscriptions: new Set(['id', 'endpoint', 'expirationTime', 'subscribedAt']),
};

export interface SanitisedExportDoc {
  doc: Record<string, unknown>;
  redactedFields: string[];
}

/**
 * Sanitises one plain object (a Firestore document's data, or any other
 * record destined for a GDPR export response) by removing every field
 * whose name matches a known credential-naming convention. Recurses
 * through arbitrarily nested plain objects and arrays (not into class
 * instances or Firestore Timestamps, which are treated as leaf values) so
 * a deeply nested shape - e.g. `exportAllNheiData`'s own
 * `{ evidence: [{ evidence: {...}, corrections: [...] }] }` - is covered
 * without this function needing to know any collection's exact shape in
 * advance. Matched by the SAME field-name pattern at every depth, so a
 * nested `accessToken` is redacted exactly as a top-level one would be.
 */
export function sanitiseExportDoc(doc: Record<string, unknown>): SanitisedExportDoc {
  const redactedFields: string[] = [];

  const sanitiseValue = (value: unknown): unknown => {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((item) => sanitiseValue(item));
    // A Firestore Timestamp (or any object with a toDate function) is a
    // leaf value, not a plain record to recurse into - recursing would
    // silently strip its internal seconds/nanoseconds representation.
    if (typeof (value as { toDate?: unknown }).toDate === 'function') return value;
    return sanitiseObject(value as Record<string, unknown>);
  };

  function sanitiseObject(obj: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (GENERIC_SECRET_FIELD_PATTERN.test(key) || EXPLICIT_SECRET_FIELD_NAMES.has(key)) {
        redactedFields.push(key);
        continue;
      }
      out[key] = sanitiseValue(value);
    }
    return out;
  }

  const sanitised = sanitiseObject(doc);
  return { doc: sanitised, redactedFields };
}

/**
 * Sanitises one document known to belong to a specific collection. For a
 * collection in KNOWN_SECRET_COLLECTION_SAFE_FIELDS, every field NOT on
 * that collection's allowlist is dropped - deny-by-default, regardless of
 * whether its name happens to match GENERIC_SECRET_FIELD_PATTERN - and
 * whatever IS kept is still run back through the generic, naming-pattern
 * sanitiser as defense-in-depth (in case an allowlisted field unexpectedly
 * grows a secret-shaped nested value in the future). A collection not in
 * that map falls back to the plain, pattern-only `sanitiseExportDoc`.
 */
function sanitiseKnownCollectionDoc(collectionId: string, raw: Record<string, unknown>): SanitisedExportDoc {
  const allowlist = KNOWN_SECRET_COLLECTION_SAFE_FIELDS[collectionId];
  if (!allowlist) return sanitiseExportDoc(raw);

  const redactedFields: string[] = [];
  const doc: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!allowlist.has(key)) {
      redactedFields.push(key);
      continue;
    }
    const nested = sanitiseExportDoc({ [key]: value });
    doc[key] = nested.doc[key];
    redactedFields.push(...nested.redactedFields);
  }
  return { doc, redactedFields };
}

/**
 * Sanitises an array of export documents (the shape every collection dump
 * in `/api/user/export` already produces: `{ id, ...data }[]`). Returns
 * the sanitised array; a document that had anything redacted gets a
 * `redactedForSecurity: true` marker so the export is honest about having
 * withheld something, rather than silently looking complete.
 */
export function sanitiseExportDocs(docs: Record<string, unknown>[]): Record<string, unknown>[] {
  return docs.map((raw) => {
    const { doc, redactedFields } = sanitiseExportDoc(raw);
    return redactedFields.length > 0 ? { ...doc, redactedForSecurity: true } : doc;
  });
}

/**
 * Same as `sanitiseExportDocs`, but collection-aware: a collection in
 * KNOWN_SECRET_COLLECTION_SAFE_FIELDS is sanitised via its explicit
 * safe-field allowlist (deny-by-default) rather than the generic
 * naming-pattern denylist.
 */
export function sanitiseExportDocsForCollection(
  collectionId: string,
  docs: Record<string, unknown>[],
): Record<string, unknown>[] {
  return docs.map((raw) => {
    const { doc, redactedFields } = sanitiseKnownCollectionDoc(collectionId, raw);
    return redactedFields.length > 0 ? { ...doc, redactedForSecurity: true } : doc;
  });
}

/**
 * Sanitises the `collections` map `/api/user/export` assembles
 * (`{ [collectionId]: docs[] }`), and the standalone root profile
 * document, in one call. Each collection ID is checked against the known
 * secret-bearing allowlist above before falling back to the generic
 * pattern-only sanitiser.
 */
export function sanitiseExportCollectionsMap(
  collections: Record<string, Record<string, unknown>[]>,
): Record<string, Record<string, unknown>[]> {
  const out: Record<string, Record<string, unknown>[]> = {};
  for (const [collectionId, docs] of Object.entries(collections)) {
    out[collectionId] = sanitiseExportDocsForCollection(collectionId, docs);
  }
  return out;
}

// Independent review finding (security-hotfix review, directive §3): the
// original Phase 5F fix logged an OAuth token-exchange/refresh failure's
// response body by running it through `sanitiseExportDoc` first - i.e.
// "collect the whole provider payload, then strip out what we recognise
// as secret-shaped." That is the weaker of the two approaches this
// review's own instructions distinguish ("prefer logging bounded, safe
// diagnostic fields rather than attempting to redact arbitrary provider
// payloads after collection") - it is only as safe as the redaction
// patterns are complete, for EVERY current and future OAuth provider's
// own response shape, which is a much larger surface than this file's
// author can fully anticipate (a provider could return a secret-shaped
// value under a field name nobody has seen yet).
//
// This function flips that: rather than collecting the full payload and
// subtracting what looks dangerous, it collects ONLY a fixed, known-safe
// allowlist of standard OAuth2 diagnostic fields (`error`,
// `error_description`, `error_uri` - RFC 6749 §5.2) plus Slack's own
// `ok` boolean (`oauth.v2.access` uses `{ok: false, error: "..."}` rather
// than the RFC 6749 shape). Every other field in the payload is reduced
// to its NAME only, in `otherFieldNames` - a field name alone is safe to
// log (it says "a field called x was present", never what x's value
// was), and is useful for noticing a provider's failure shape has
// changed without ever risking the value underneath.
const OAUTH_SAFE_DIAGNOSTIC_FIELDS = new Set(['error', 'error_description', 'error_uri', 'ok']);

export interface OAuthFailureDiagnostics {
  error: string | null;
  errorDescription: string | null;
  errorUri: string | null;
  ok: boolean | null;
  otherFieldNames: string[];
  // logger.ts's LogFields carries its own index signature (`[key: string]:
  // unknown`) so arbitrary extra fields can be attached at any log call
  // site; TypeScript only allows passing a named interface where an
  // index-signature type is expected if that interface declares a
  // compatible index signature of its own (passing a literal avoids this,
  // but this value is built and returned from a function, never written
  // inline at the call site). This line carries no runtime meaning - nothing
  // ever reads an arbitrary key off a value typed as OAuthFailureDiagnostics.
  [key: string]: unknown;
}

export function extractOAuthFailureDiagnostics(body: Record<string, unknown> | null | undefined): OAuthFailureDiagnostics {
  const safeBody = body || {};
  const otherFieldNames = Object.keys(safeBody).filter((key) => !OAUTH_SAFE_DIAGNOSTIC_FIELDS.has(key));
  return {
    error: typeof safeBody.error === 'string' ? safeBody.error : null,
    errorDescription: typeof safeBody.error_description === 'string' ? safeBody.error_description : null,
    errorUri: typeof safeBody.error_uri === 'string' ? safeBody.error_uri : null,
    ok: typeof safeBody.ok === 'boolean' ? safeBody.ok : null,
    otherFieldNames,
  };
}
