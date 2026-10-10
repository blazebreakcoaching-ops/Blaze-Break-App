// Data provenance labeling (Work Design Pulse PR13) - the spec's own
// mandatory label format for every aggregate figure shown to an admin or
// executive: "Derived from X, Window, Coverage, Privacy Gate: Passed".
// Pure string formatting only - server.ts supplies the real values for
// each field; this file never invents or defaults any of them beyond the
// documented "not tracked" fallback for an optional field.

export interface DataProvenanceInput {
  // What real collection/computation this figure comes from, in plain
  // language (e.g. "work_design_interventions", "calendar connector").
  source: string;
  // How many days of history this aggregate looks back over, or null
  // when the figure is a live snapshot with no real time window (e.g. a
  // simple count of currently-open records).
  windowDays: number | null;
  // What share of the relevant population actually contributed real
  // data, or null when coverage isn't a meaningful concept for this
  // figure (e.g. it's a count of org-level records, not a per-member
  // aggregate).
  coveragePercent: number | null;
  // Whether this figure actually passed the Anonymous Aggregation
  // Engine's privacy gate (k-anonymity threshold) - false/omitted data
  // is never shown upstream of this in the first place, so in practice
  // this is always true by the time a label is built for a figure that
  // genuinely goes through that gate. Pass null for a figure that never
  // goes through a k-anonymity gate at all (e.g. an org-level record
  // count with no personal data behind it) - "Passed" would claim a
  // check ran when none did, so this is a third, honest state, never
  // defaulted to true just to avoid handling it.
  privacyGatePassed: boolean | null;
}

export const formatDataProvenance = (input: DataProvenanceInput): string => {
  const parts = [`Derived from ${input.source}`];
  parts.push(input.windowDays != null ? `Last ${input.windowDays} days` : 'Live snapshot');
  parts.push(input.coveragePercent != null ? `Coverage: ${input.coveragePercent}%` : 'Coverage: not applicable');
  const gateLabel = input.privacyGatePassed === null ? 'Not Applicable (no personal data)' : (input.privacyGatePassed ? 'Passed' : 'Insufficient');
  parts.push(`Privacy Gate: ${gateLabel}`);
  return parts.join(' · ');
};
