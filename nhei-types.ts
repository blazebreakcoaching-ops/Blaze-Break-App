// NOVA HUMAN EXPERIENCE INTELLIGENCE (NHEI) v2.1 - PHASE 1 SHARED TYPES
//
// These are conceptual coaching categories, not medically or psychologically
// established separate entities, and nothing in this module (or any other
// nhei-*.ts file) produces a diagnostic score, a personality determination,
// or a clinical/crisis-risk assessment. See the NHEI architecture audit for
// full context; this file is the shared contract every NHEI engine builds on.
//
// Deliberate design choice: NheiEvidenceRecord carries NO raw text field at
// all (no content/description/note string). "Evidence" here is metadata
// ABOUT something the user reported - a source identifier, a type, a time,
// a confidence, which self-systems/dimensions it touches - never the
// reported content itself. That content stays wherever it already lives
// (a checkin, a journal entry, a chat message); NHEI never duplicates it.
// This is what makes "no raw-text leakage through classification metadata"
// a structural guarantee rather than a best-effort one: there is no field
// capable of holding raw text, and validateEvidenceRecord strips anything
// outside this contract before an engine ever sees it.

export type SelfSystem = 'INTERNAL_SELF' | 'RELATIONAL_SELF' | 'PERCEIVED_RECEIVED_SELF';

export const SELF_SYSTEMS: readonly SelfSystem[] = ['INTERNAL_SELF', 'RELATIONAL_SELF', 'PERCEIVED_RECEIVED_SELF'];

export const isValidSelfSystem = (value: unknown): value is SelfSystem =>
  typeof value === 'string' && (SELF_SYSTEMS as readonly string[]).includes(value);

export type Dimension = 'METAPHYSICAL' | 'PHYSICAL' | 'MENTAL' | 'EMOTIONAL';

export const DIMENSIONS: readonly Dimension[] = ['METAPHYSICAL', 'PHYSICAL', 'MENTAL', 'EMOTIONAL'];

export const isValidDimension = (value: unknown): value is Dimension =>
  typeof value === 'string' && (DIMENSIONS as readonly string[]).includes(value);

// What KIND of evidence a record is - never how much the model trusts it
// (see EvidenceQuality) and never how confident a derived interpretation
// built from it is (see InterpretationConfidence). Three separate axes,
// deliberately not conflated.
export type EvidenceSourceType =
  | 'USER_REPORTED_EVENT'
  | 'USER_REPORTED_THOUGHT'
  | 'USER_REPORTED_EMOTION'
  | 'USER_REPORTED_BEHAVIOUR'
  | 'USER_REPORTED_OUTCOME'
  | 'EXTERNALLY_VERIFIED_EVENT'
  | 'SYSTEM_OBSERVATION'
  | 'SYSTEM_HYPOTHESIS'
  | 'USER_CONFIRMED_INTERPRETATION'
  | 'UNKNOWN';

export const EVIDENCE_SOURCE_TYPES: readonly EvidenceSourceType[] = [
  'USER_REPORTED_EVENT', 'USER_REPORTED_THOUGHT', 'USER_REPORTED_EMOTION',
  'USER_REPORTED_BEHAVIOUR', 'USER_REPORTED_OUTCOME', 'EXTERNALLY_VERIFIED_EVENT',
  'SYSTEM_OBSERVATION', 'SYSTEM_HYPOTHESIS', 'USER_CONFIRMED_INTERPRETATION', 'UNKNOWN',
];

export const isValidEvidenceSourceType = (value: unknown): value is EvidenceSourceType =>
  typeof value === 'string' && (EVIDENCE_SOURCE_TYPES as readonly string[]).includes(value);

// EXTERNALLY_VERIFIED_EVENT is reserved for evidence genuinely backed by an
// independently authorised and verified source - never used as a default
// or inferred from the absence of other information. No Phase 1 engine
// assigns this source type itself; it can only ever arrive already set on
// an input record, from a caller that has actually done that verification.
export const sourceTypeRequiresExternalVerification = (sourceType: EvidenceSourceType): boolean =>
  sourceType === 'EXTERNALLY_VERIFIED_EVENT';

// Evidence quality: how reliable/well-evidenced the RAW record itself is.
export type EvidenceQuality = 'low' | 'medium' | 'high' | 'unknown';
export const EVIDENCE_QUALITIES: readonly EvidenceQuality[] = ['low', 'medium', 'high', 'unknown'];
export const isValidEvidenceQuality = (value: unknown): value is EvidenceQuality =>
  typeof value === 'string' && (EVIDENCE_QUALITIES as readonly string[]).includes(value);

// Interpretation confidence: how confident a DERIVED pattern/relation built
// from one or more evidence records is. Kept as a distinct type from
// EvidenceQuality on purpose - a single high-quality record can still
// support only a low-confidence interpretation (e.g. one data point), and a
// handful of low-quality records can never add up to a high-confidence one.
export type InterpretationConfidence = 'low' | 'medium' | 'high' | 'unknown';
export const INTERPRETATION_CONFIDENCES: readonly InterpretationConfidence[] = ['low', 'medium', 'high', 'unknown'];
export const isValidInterpretationConfidence = (value: unknown): value is InterpretationConfidence =>
  typeof value === 'string' && (INTERPRETATION_CONFIDENCES as readonly string[]).includes(value);

export type TimeUncertainty = 'exact' | 'approximate' | 'unknown';
export const TIME_UNCERTAINTIES: readonly TimeUncertainty[] = ['exact', 'approximate', 'unknown'];
export const isValidTimeUncertainty = (value: unknown): value is TimeUncertainty =>
  typeof value === 'string' && (TIME_UNCERTAINTIES as readonly string[]).includes(value);

// Whether the user has confirmed, disputed, or never been asked about a
// particular record - most meaningful for SYSTEM_HYPOTHESIS /
// USER_CONFIRMED_INTERPRETATION records; 'not_applicable' is the honest
// default for a plain first-person report with nothing to confirm.
export type ConfirmationState = 'user_confirmed' | 'user_disputed' | 'unconfirmed' | 'not_applicable';
export const CONFIRMATION_STATES: readonly ConfirmationState[] = ['user_confirmed', 'user_disputed', 'unconfirmed', 'not_applicable'];
export const isValidConfirmationState = (value: unknown): value is ConfirmationState =>
  typeof value === 'string' && (CONFIRMATION_STATES as readonly string[]).includes(value);

// Temporal relationship types an engine is allowed to assign. CORRELATION
// is deliberately absent - the spec this module implements is explicit that
// CORRELATION may only be used when a genuine statistical method supports
// it, and no such method exists in Phase 1 (or anywhere else in this app
// yet), so it is not a reachable value here at all, not merely unused.
export type TemporalRelationType =
  | 'SEQUENCE'
  | 'COOCCURRENCE'
  | 'RECURRENCE'
  | 'USER_ATTRIBUTED_INFLUENCE'
  | 'HYPOTHESISED_INFLUENCE'
  | 'UNKNOWN';

export const TEMPORAL_RELATION_TYPES: readonly TemporalRelationType[] = [
  'SEQUENCE', 'COOCCURRENCE', 'RECURRENCE', 'USER_ATTRIBUTED_INFLUENCE', 'HYPOTHESISED_INFLUENCE', 'UNKNOWN',
];

export const isValidTemporalRelationType = (value: unknown): value is TemporalRelationType =>
  typeof value === 'string' && (TEMPORAL_RELATION_TYPES as readonly string[]).includes(value);

// The one shared evidence contract every NHEI engine consumes. Metadata
// only - see the file header for why there is no raw-text field.
export interface NheiEvidenceRecord {
  id: string;
  sourceType: EvidenceSourceType;
  occurredAt?: string;        // ISO 8601 - present only when a real time is known
  reportedOrder?: number;     // fallback relative ordering when no real timestamp exists
  timeUncertainty: TimeUncertainty;
  evidenceQuality: EvidenceQuality;
  confirmationState: ConfirmationState;
  selfSystems: SelfSystem[];  // zero or more; empty = not yet classified, never forced
  dimensions: Dimension[];    // zero or more; empty = not yet classified, never forced
  relatedEventIds: string[];  // optional links to other evidence records, by id
  // Phase 3C-2A (section 3): which single reported experience/occasion this
  // record is a facet of. Two records from the SAME episode that happen to
  // share a self-system or dimension tag are NOT a recurring pattern - they
  // are two aspects of one story (e.g. "felt anxious asking" and "felt
  // guilty afterward" both tagged EMOTIONAL, from one single retelling).
  // Only records from DIFFERENT episodes sharing a tag are genuine
  // recurrence candidates - see nhei-temporal-engine.ts's
  // deriveRecurrenceRelations. Optional and absent on every record from
  // Phase 1 through 3C-1 (none of them ever set this) - deriveRecurrenceRelations
  // treats an absent episodeId as "this record is its own singleton
  // episode," which reproduces those phases' exact prior behaviour
  // unchanged. Never raw text - just an opaque grouping label.
  episodeId?: string;
}

export interface EvidenceValidationResult {
  ok: boolean;
  record?: NheiEvidenceRecord; // present, and strictly normalized to known fields only, iff ok
  errors: string[];
}

// Strict, allow-list validation/normalization. Unknown input - including
// any extra field a careless caller attaches (e.g. a raw text field that
// was never part of this contract) - is rejected from the normalized
// record rather than carried through, which is what makes the "no raw-text
// leakage" guarantee hold even against a caller that gets it wrong.
export function validateEvidenceRecord(input: unknown): EvidenceValidationResult {
  const errors: string[] = [];
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['record must be a non-null object'] };
  }
  const raw = input as Record<string, unknown>;

  if (typeof raw.id !== 'string' || raw.id.length === 0) errors.push('id must be a non-empty string');
  if (!isValidEvidenceSourceType(raw.sourceType)) errors.push('sourceType must be a valid EvidenceSourceType');

  if (raw.occurredAt !== undefined) {
    if (typeof raw.occurredAt !== 'string' || Number.isNaN(Date.parse(raw.occurredAt))) {
      errors.push('occurredAt must be a valid ISO 8601 string when present');
    }
  }
  if (raw.reportedOrder !== undefined && typeof raw.reportedOrder !== 'number') {
    errors.push('reportedOrder must be a number when present');
  }

  const timeUncertainty = raw.timeUncertainty;
  if (!isValidTimeUncertainty(timeUncertainty)) errors.push('timeUncertainty must be a valid TimeUncertainty');

  const evidenceQuality = raw.evidenceQuality;
  if (!isValidEvidenceQuality(evidenceQuality)) errors.push('evidenceQuality must be a valid EvidenceQuality');

  const confirmationState = raw.confirmationState;
  if (!isValidConfirmationState(confirmationState)) errors.push('confirmationState must be a valid ConfirmationState');

  const selfSystems = Array.isArray(raw.selfSystems) ? raw.selfSystems : undefined;
  if (selfSystems === undefined || !selfSystems.every(isValidSelfSystem)) {
    errors.push('selfSystems must be an array of valid SelfSystem values (may be empty)');
  }

  const dimensions = Array.isArray(raw.dimensions) ? raw.dimensions : undefined;
  if (dimensions === undefined || !dimensions.every(isValidDimension)) {
    errors.push('dimensions must be an array of valid Dimension values (may be empty)');
  }

  const relatedEventIds = raw.relatedEventIds === undefined ? [] : raw.relatedEventIds;
  if (!Array.isArray(relatedEventIds) || !relatedEventIds.every((v) => typeof v === 'string')) {
    errors.push('relatedEventIds must be an array of strings when present');
  }

  if (raw.episodeId !== undefined && (typeof raw.episodeId !== 'string' || raw.episodeId.length === 0)) {
    errors.push('episodeId must be a non-empty string when present');
  }

  if (
    raw.sourceType === 'EXTERNALLY_VERIFIED_EVENT' &&
    (confirmationState === 'unconfirmed')
  ) {
    errors.push('EXTERNALLY_VERIFIED_EVENT must not carry an unconfirmed confirmation state - independent verification is the confirmation');
  }

  if (errors.length > 0) return { ok: false, errors };

  // Normalized record contains ONLY the fields declared on NheiEvidenceRecord
  // above - this is the allow-list step, not a spread of `raw`.
  const record: NheiEvidenceRecord = {
    id: raw.id as string,
    sourceType: raw.sourceType as EvidenceSourceType,
    ...(raw.occurredAt !== undefined ? { occurredAt: raw.occurredAt as string } : {}),
    ...(raw.reportedOrder !== undefined ? { reportedOrder: raw.reportedOrder as number } : {}),
    timeUncertainty: timeUncertainty as TimeUncertainty,
    evidenceQuality: evidenceQuality as EvidenceQuality,
    confirmationState: confirmationState as ConfirmationState,
    selfSystems: [...(selfSystems as SelfSystem[])],
    dimensions: [...(dimensions as Dimension[])],
    relatedEventIds: [...(relatedEventIds as string[])],
    ...(raw.episodeId !== undefined ? { episodeId: raw.episodeId as string } : {}),
  };
  return { ok: true, record, errors: [] };
}

export function validateEvidenceRecords(inputs: unknown[]): { valid: NheiEvidenceRecord[]; invalid: EvidenceValidationResult[] } {
  const valid: NheiEvidenceRecord[] = [];
  const invalid: EvidenceValidationResult[] = [];
  for (const input of inputs) {
    const result = validateEvidenceRecord(input);
    if (result.ok && result.record) valid.push(result.record);
    else invalid.push(result);
  }
  return { valid, invalid };
}

// "User correction of an interpretation" - any downstream engine that
// summarises SYSTEM_HYPOTHESIS / USER_CONFIRMED_INTERPRETATION records
// should run its input through this first, so a disputed interpretation
// never silently continues to influence anything.
export function excludeDisputedInterpretations(records: NheiEvidenceRecord[]): NheiEvidenceRecord[] {
  return records.filter((r) => r.confirmationState !== 'user_disputed');
}

// Generic, order-preserving bucketing helper shared by the Trifecta and
// Dimensions engines - a record touching multiple tags appears, unmodified,
// in every matching bucket. Never merges or collapses tags into one.
export function bucketByTag<TTag extends string>(
  records: NheiEvidenceRecord[],
  tagsOf: (record: NheiEvidenceRecord) => TTag[],
  allTags: readonly TTag[],
): { buckets: Record<TTag, NheiEvidenceRecord[]>; unclassified: NheiEvidenceRecord[] } {
  const buckets = Object.fromEntries(allTags.map((tag) => [tag, [] as NheiEvidenceRecord[]])) as Record<TTag, NheiEvidenceRecord[]>;
  const unclassified: NheiEvidenceRecord[] = [];
  for (const record of records) {
    const tags = tagsOf(record);
    if (tags.length === 0) {
      unclassified.push(record);
      continue;
    }
    for (const tag of tags) {
      buckets[tag].push(record);
    }
  }
  return { buckets, unclassified };
}
