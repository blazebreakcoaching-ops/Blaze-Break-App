// Real dependency graph over the feature registry (Evolution Engine
// PR7) - computed live from FeatureRegistryEntry.dependencies, never
// stored or invented. `dependencies` itself is migrated from the legacy
// FEATURE_REGISTRY's hand-authored `allowedConnections` lists
// (src/lib/feature-registry.ts) - a real, intentionally-declared list of
// related concepts, but one nobody has ever independently verified
// against actual code-level imports/calls. This module is honest about
// that: it reports what the declared data says, not a static-analysis
// result.
//
// `downstreamConsumers` on FeatureRegistryEntry itself is always an
// empty array today (nothing populates it - see feature-registry-v2.ts).
// Rather than leaving that field as dead weight or guessing values for
// it, this module computes the same concept live, each time, by
// reversing the real `dependencies` edges - "who declares a dependency
// on me" - so it can never go stale or drift from the one real source
// of truth.
//
// Deliberately does NOT attempt to cross-link dependency strings to
// Connector Layer provider ids (connector-layer.ts) or Protected Core
// invariant ids (protected-core.ts): none of the legacy dependency
// strings (e.g. "slack_integration", "guardian_protocol") are an exact
// match for those modules' real identifiers (e.g. "slack",
// "guardian_alert_explicit_trigger_only"), and a fuzzy/heuristic match
// would be an invented link, not a verified one. The UI states this
// gap explicitly rather than papering over it.

import { FeatureRegistryEntry } from './feature-registry-v2';

export interface DependencyNode {
  featureId: string;
  displayName: string;
  // Dependency strings that match another real entry's featureId.
  resolvedDependencies: string[];
  // Dependency strings with no matching registry entry - either an
  // external integration this registry doesn't model (e.g. "calendar_
  // integration"), or a stale reference to a retired/renamed concept.
  // Not determined automatically; shown as-is.
  unresolvedDependencies: string[];
  // Other entries' featureIds whose own `dependencies` list includes
  // this node - computed in reverse from the same real data, every time.
  dependents: string[];
}

// Only the three fields this computation actually needs - matching
// feature-registry-v2.ts's own isGovernanceWarning pattern of taking a
// Pick<> rather than the full entry, so any caller with a compatible
// subset shape (e.g. a client-side type built from a JSON response)
// can pass its own data in without an unnecessary cast.
export type DependencyGraphInput = Pick<FeatureRegistryEntry, 'featureId' | 'displayName' | 'dependencies'>;

export const buildDependencyGraph = (entries: readonly DependencyGraphInput[]): DependencyNode[] => {
  const idSet = new Set(entries.map((e) => e.featureId));
  const nodes: DependencyNode[] = entries.map((e) => ({
    featureId: e.featureId,
    displayName: e.displayName,
    resolvedDependencies: e.dependencies.filter((d) => idSet.has(d) && d !== e.featureId),
    unresolvedDependencies: e.dependencies.filter((d) => !idSet.has(d)),
    dependents: [],
  }));
  const byId = new Map(nodes.map((n) => [n.featureId, n]));
  for (const entry of entries) {
    for (const dep of entry.dependencies) {
      if (dep === entry.featureId) continue;
      const target = byId.get(dep);
      if (target) target.dependents.push(entry.featureId);
    }
  }
  return nodes;
};

// Highest-blast-radius-first: entries most other entries declare a
// dependency on come first, since breaking one of those has the widest
// declared impact. Ties broken alphabetically for a stable order.
export const rankByDependents = (nodes: readonly DependencyNode[]): DependencyNode[] =>
  [...nodes].sort((a, b) => b.dependents.length - a.dependents.length || a.featureId.localeCompare(b.featureId));
