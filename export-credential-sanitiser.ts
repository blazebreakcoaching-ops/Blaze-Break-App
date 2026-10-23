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
// THE POLICY: two layers, deliberately redundant with each other -
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

const GENERIC_SECRET_FIELD_PATTERN =
  /(access|refresh|id|session|bearer|auth|api|csrf|xsrf)?[-_]?token$|secret|credential|password|apikey|api[-_]?key|code[-_]?verifier|private[-_]?key|signing[-_]?key|client[-_]?secret|^hash$/i;

// Fields that are genuine reusable credentials but don't match the naming
// pattern above.
const EXPLICIT_SECRET_FIELD_NAMES = new Set<string>(['recoveryCodesHashed']);

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
 * Sanitises the `collections` map `/api/user/export` assembles
 * (`{ [collectionId]: docs[] }`), and the standalone root profile
 * document, in one call.
 */
export function sanitiseExportCollectionsMap(
  collections: Record<string, Record<string, unknown>[]>,
): Record<string, Record<string, unknown>[]> {
  const out: Record<string, Record<string, unknown>[]> = {};
  for (const [collectionId, docs] of Object.entries(collections)) {
    out[collectionId] = sanitiseExportDocs(docs);
  }
  return out;
}
