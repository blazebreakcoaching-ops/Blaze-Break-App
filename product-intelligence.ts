// Product Intelligence - Batch 1 (pure aggregation engine).
//
// Three features already record real, abstract, privacy-reviewed
// telemetry per user - Grounding/Rediscovery (grounding_analytics_events),
// Movement Snacks (movement_analytics_events), and Recovery Recipes
// (recovery_recipes_analytics_events). Each event is an enum eventType
// plus at most a taxonomy field, server-validated against a fixed
// allowlist - by the original features' own design, "never raw emotional
// text, private Nova content, faith preference or journal content" (see
// the comments above each /api/.../analytics-event route in server.ts).
// Nothing before this file ever read any of it back - three real,
// already-safe-to-report data sources, completely unused. This file is
// the pure math; server.ts owns the collectionGroup reads and the admin
// route.

import { checkCohortSufficiency } from './anonymous-aggregation-engine';

export interface EventTypeCount {
  eventType: string;
  count: number;
}

// Most-frequent first - that's what a reader scanning the list wants to
// see immediately, same reasoning as summarizeModuleOutcomes's module
// ordering (recovery-outcomes-intelligence.ts).
export function countEventsByType(events: { eventType: string }[]): EventTypeCount[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    counts.set(e.eventType, (counts.get(e.eventType) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([eventType, count]) => ({ eventType, count }))
    .sort((a, b) => b.count - a.count);
}

// Counts how often each value of one optional taxonomy field appears
// (category, lens, movementId, situationKey, stepType, ...) - null/
// undefined values (the field wasn't supplied on that event) are
// excluded from the breakdown entirely rather than counted as a "none"
// bucket, since most event types never carry every optional field.
export function countByDimension(events: Record<string, unknown>[], field: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of events) {
    const value = e[field];
    if (typeof value !== 'string' || !value) continue;
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

export interface FeatureUsageSummary {
  totalEvents: number;
  byEventType: EventTypeCount[];
  sufficientSample: boolean;
  sampleThreshold: number;
}

export const DEFAULT_PRODUCT_INTELLIGENCE_SAMPLE_THRESHOLD = 20;

// Same reliability-floor reasoning as summarizeModuleOutcomes: a feature
// with only a handful of events reporting a loud "100% completed" isn't
// a privacy risk at platform scale, but it is a misleading one -
// sufficientSample says whether this feature has enough volume this
// window to read anything into the breakdown, without ever hiding the
// underlying numbers (this is platform-wide admin reporting, not
// per-person data - there's nothing here that needs withholding the way
// an org-level view would).
export function summarizeFeatureUsage(
  events: { eventType: string }[],
  threshold: number = DEFAULT_PRODUCT_INTELLIGENCE_SAMPLE_THRESHOLD,
): FeatureUsageSummary {
  const sufficiency = checkCohortSufficiency(events.length, threshold);
  return {
    totalEvents: events.length,
    byEventType: countEventsByType(events),
    sufficientSample: sufficiency.sufficient,
    sampleThreshold: threshold,
  };
}
