// NHEI PHASE 1 - TEMPORAL SELF INTERACTION ENGINE
//
// Tracks chronological relationships between evidence records - sequence,
// co-occurrence, recurrence - without ever confusing any of those with
// causation. The one rule this entire file exists to enforce: timing alone
// never implies influence.
//
// SEQUENCE, COOCCURRENCE and RECURRENCE are the only relation types this
// engine computes on its own, purely from timestamps/ordering and repeated
// tag overlap. USER_ATTRIBUTED_INFLUENCE and HYPOTHESISED_INFLUENCE are
// never derived here - they can only be CARRIED from an explicit assertion
// a caller supplies (a user saying "B happened because of A" is
// USER_ATTRIBUTED_INFLUENCE; a coach or a later analytical step proposing
// an unconfirmed hypothesis is HYPOTHESISED_INFLUENCE) - this engine will
// validate and pass such an assertion through, tagged as caller-supplied,
// but will never promote a SEQUENCE it computed itself into an influence
// claim. CORRELATION is not a value this module can produce at all - see
// nhei-types.ts for why.
//
// When there isn't enough evidence to say anything else, every function
// here returns UNKNOWN (or an empty result) rather than inventing a
// relation - "insufficient evidence" is a first-class, expected outcome,
// not an error case.

import {
  type NheiEvidenceRecord,
  type TemporalRelationType,
  type InterpretationConfidence,
  type SelfSystem,
} from './nhei-types';

export interface NheiTemporalRelation {
  fromEventId: string;
  toEventId: string;
  relationType: TemporalRelationType;
  interpretationConfidence: InterpretationConfidence;
  derivedBy: 'engine_computed' | 'caller_asserted';
  rationale:
    | 'timestamp_order'
    | 'reported_order_only'
    | 'simultaneous_timestamp'
    | 'repeated_tag_overlap'
    | 'caller_supplied'
    | 'insufficient_timestamp_data';
}

// The only two relation types a caller may assert directly (never computed
// by this engine). Each assertion still goes through validation below.
export interface NheiAssertedInfluence {
  fromEventId: string;
  toEventId: string;
  relationType: 'USER_ATTRIBUTED_INFLUENCE' | 'HYPOTHESISED_INFLUENCE';
  interpretationConfidence: InterpretationConfidence;
}

// Minimum distinct occurrences of an overlapping self-system/dimension tag
// before a later one counts as RECURRENCE of an earlier one - a single
// repeat is still "repeated," but this makes the threshold explicit and
// matches this app's existing evidence-threshold convention elsewhere
// (e.g. boundary-outcome-engine.ts's MIN_ENTRIES_FOR_SOURCE_PATTERN).
export const MIN_OCCURRENCES_FOR_RECURRENCE = 2;

function bestEffortOrder(record: NheiEvidenceRecord): { value: number; exact: boolean } | null {
  if (record.occurredAt !== undefined && record.timeUncertainty !== 'unknown') {
    const parsed = Date.parse(record.occurredAt);
    if (!Number.isNaN(parsed)) return { value: parsed, exact: record.timeUncertainty === 'exact' };
  }
  if (record.reportedOrder !== undefined) {
    return { value: record.reportedOrder, exact: false };
  }
  return null;
}

// Pairwise relation between two specific evidence records, looked up by
// id. Returns UNKNOWN (never a guess) when there is nothing to go on for
// this specific pair - e.g. when asked about two events that are only
// related by both having happened to the same person, with no shared tag
// and no usable ordering information between them.
export function deriveRelationBetween(
  records: NheiEvidenceRecord[],
  fromEventId: string,
  toEventId: string,
): NheiTemporalRelation {
  const from = records.find((r) => r.id === fromEventId);
  const to = records.find((r) => r.id === toEventId);
  if (!from || !to) {
    return {
      fromEventId, toEventId, relationType: 'UNKNOWN',
      interpretationConfidence: 'unknown', derivedBy: 'engine_computed', rationale: 'insufficient_timestamp_data',
    };
  }

  const fromOrder = bestEffortOrder(from);
  const toOrder = bestEffortOrder(to);

  if (fromOrder === null || toOrder === null) {
    return {
      fromEventId, toEventId, relationType: 'UNKNOWN',
      interpretationConfidence: 'unknown', derivedBy: 'engine_computed', rationale: 'insufficient_timestamp_data',
    };
  }

  if (fromOrder.value === toOrder.value) {
    return {
      fromEventId, toEventId, relationType: 'COOCCURRENCE',
      interpretationConfidence: fromOrder.exact && toOrder.exact ? 'high' : 'medium',
      derivedBy: 'engine_computed', rationale: 'simultaneous_timestamp',
    };
  }

  const earlier = fromOrder.value < toOrder.value ? fromEventId : toEventId;
  const later = earlier === fromEventId ? toEventId : fromEventId;
  const bothExact = fromOrder.exact && toOrder.exact;

  return {
    fromEventId: earlier,
    toEventId: later,
    relationType: 'SEQUENCE',
    interpretationConfidence: bothExact ? 'high' : 'low',
    derivedBy: 'engine_computed',
    rationale: bothExact ? 'timestamp_order' : 'reported_order_only',
  };
}

// RECURRENCE: a record is a recurrence of an earlier one when they share at
// least one self-system or dimension tag and there are at least
// MIN_OCCURRENCES_FOR_RECURRENCE such records in the set. A single
// occurrence never produces a RECURRENCE relation, however strongly it's
// tagged - "repeated versus isolated" is exactly what this threshold
// enforces.
export function deriveRecurrenceRelations(records: NheiEvidenceRecord[]): NheiTemporalRelation[] {
  const relations: NheiTemporalRelation[] = [];
  const sharesTag = (a: NheiEvidenceRecord, b: NheiEvidenceRecord): boolean =>
    a.selfSystems.some((s) => b.selfSystems.includes(s)) || a.dimensions.some((d) => b.dimensions.includes(d));

  for (let i = 0; i < records.length; i++) {
    const group = [records[i], ...records.slice(i + 1).filter((r) => sharesTag(records[i], r))];
    if (group.length < MIN_OCCURRENCES_FOR_RECURRENCE) continue;

    const ordered = group
      .map((r) => ({ record: r, order: bestEffortOrder(r) }))
      .filter((entry): entry is { record: NheiEvidenceRecord; order: { value: number; exact: boolean } } => entry.order !== null)
      .sort((a, b) => a.order.value - b.order.value);

    for (let j = 1; j < ordered.length; j++) {
      const earlier = ordered[j - 1];
      const later = ordered[j];
      // Avoid duplicating a pair already covered by an earlier group in
      // this loop (recurrence is reported once per adjacent repeat, not
      // once per combinatorial pairing).
      const alreadyPresent = relations.some(
        (rel) => rel.fromEventId === earlier.record.id && rel.toEventId === later.record.id && rel.relationType === 'RECURRENCE',
      );
      if (alreadyPresent) continue;
      relations.push({
        fromEventId: earlier.record.id,
        toEventId: later.record.id,
        relationType: 'RECURRENCE',
        interpretationConfidence: group.length >= MIN_OCCURRENCES_FOR_RECURRENCE + 1 ? 'medium' : 'low',
        derivedBy: 'engine_computed',
        rationale: 'repeated_tag_overlap',
      });
    }
  }
  return relations;
}

// Validates and carries through a caller-asserted influence relation. This
// is the ONLY path by which USER_ATTRIBUTED_INFLUENCE or
// HYPOTHESISED_INFLUENCE can ever appear in this engine's output - never
// computed from timing, always supplied. Returns null (not a guess) if the
// referenced event ids don't exist in the provided record set.
export function carryAssertedInfluence(
  records: NheiEvidenceRecord[],
  assertion: NheiAssertedInfluence,
): NheiTemporalRelation | null {
  const fromExists = records.some((r) => r.id === assertion.fromEventId);
  const toExists = records.some((r) => r.id === assertion.toEventId);
  if (!fromExists || !toExists) return null;
  return {
    fromEventId: assertion.fromEventId,
    toEventId: assertion.toEventId,
    relationType: assertion.relationType,
    interpretationConfidence: assertion.interpretationConfidence,
    derivedBy: 'caller_asserted',
    rationale: 'caller_supplied',
  };
}

export interface TemporalTimelineEntry {
  record: NheiEvidenceRecord;
  position: number; // 0-based index in best-available chronological order
  orderBasis: 'timestamp' | 'reported_order' | 'unknown';
}

// Full ordered view of a record set, preserving reported order as a
// fallback whenever a real timestamp isn't available - "preserve the event
// order" even when nothing but narrative sequence is known.
export function buildTimeline(records: NheiEvidenceRecord[]): TemporalTimelineEntry[] {
  const withOrder = records.map((record) => {
    const order = bestEffortOrder(record);
    return {
      record,
      sortKey: order?.value ?? Number.POSITIVE_INFINITY,
      orderBasis: (order === null ? 'unknown' : record.occurredAt !== undefined && record.timeUncertainty !== 'unknown' ? 'timestamp' : 'reported_order') as TemporalTimelineEntry['orderBasis'],
      hasOrder: order !== null,
    };
  });
  // Stable sort: records with no usable order at all keep their original
  // relative position rather than being reshuffled arbitrarily.
  const indexed = withOrder.map((entry, originalIndex) => ({ ...entry, originalIndex }));
  indexed.sort((a, b) => (a.sortKey - b.sortKey) || (a.originalIndex - b.originalIndex));
  return indexed.map((entry, position) => ({ record: entry.record, position, orderBasis: entry.orderBasis }));
}

// Different self-systems becoming relevant at different times - the
// ordered subset of the timeline relevant to one self-system, without
// pulling in or merging anything from the other self-systems.
export function buildSelfSystemTimeline(records: NheiEvidenceRecord[], selfSystem: SelfSystem): TemporalTimelineEntry[] {
  return buildTimeline(records.filter((r) => r.selfSystems.includes(selfSystem)));
}
