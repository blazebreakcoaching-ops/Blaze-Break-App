import { describe, it, expect } from 'vitest';
import { buildDependencyGraph, rankByDependents } from './dependency-map';
import { FeatureRegistryEntry } from './feature-registry-v2';

const makeEntry = (featureId: string, dependencies: string[] = []): FeatureRegistryEntry => ({
  featureId,
  displayName: featureId,
  description: '',
  productOwner: null,
  technicalOwner: null,
  lifecycleState: 'live',
  enforcementState: 'unknown',
  featureFlag: null,
  entitlementRequirement: null,
  dataZones: [],
  dependencies,
  downstreamConsumers: [],
  requiredConnectors: [],
  requiredPermissions: [],
  minAppVersion: null,
  fallbackMode: null,
  rollbackMethod: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  lastChangedAt: '2026-01-01T00:00:00.000Z',
  expectedFlagRetirement: null,
  notes: null,
});

describe('buildDependencyGraph', () => {
  it('resolves a dependency string that matches another entry', () => {
    const entries = [makeEntry('a', ['b']), makeEntry('b')];
    const graph = buildDependencyGraph(entries);
    const a = graph.find((n) => n.featureId === 'a')!;
    expect(a.resolvedDependencies).toEqual(['b']);
    expect(a.unresolvedDependencies).toEqual([]);
  });

  it('leaves a dependency string with no matching entry as unresolved', () => {
    const entries = [makeEntry('a', ['calendar_integration'])];
    const graph = buildDependencyGraph(entries);
    const a = graph[0];
    expect(a.unresolvedDependencies).toEqual(['calendar_integration']);
    expect(a.resolvedDependencies).toEqual([]);
  });

  it('computes dependents by reversing the real dependency edges', () => {
    const entries = [makeEntry('a', ['c']), makeEntry('b', ['c']), makeEntry('c')];
    const graph = buildDependencyGraph(entries);
    const c = graph.find((n) => n.featureId === 'c')!;
    expect([...c.dependents].sort()).toEqual(['a', 'b']);
    expect(graph.find((n) => n.featureId === 'a')!.dependents).toEqual([]);
  });

  it('ignores a self-referential dependency', () => {
    const entries = [makeEntry('a', ['a'])];
    const graph = buildDependencyGraph(entries);
    expect(graph[0].resolvedDependencies).toEqual([]);
    expect(graph[0].unresolvedDependencies).toEqual([]);
    expect(graph[0].dependents).toEqual([]);
  });

  it('handles an empty registry', () => {
    expect(buildDependencyGraph([])).toEqual([]);
  });
});

describe('rankByDependents', () => {
  it('orders highest dependent count first, alphabetically on ties', () => {
    const entries = [makeEntry('a', ['z']), makeEntry('b', ['z']), makeEntry('c', ['z']), makeEntry('y', ['z']), makeEntry('z')];
    const ranked = rankByDependents(buildDependencyGraph(entries));
    expect(ranked[0].featureId).toBe('z');
    expect(ranked[0].dependents.length).toBe(4);
    // Everything else has 0 dependents - alphabetical tiebreak.
    expect(ranked.slice(1).map((n) => n.featureId)).toEqual(['a', 'b', 'c', 'y']);
  });

  it('does not mutate the input array', () => {
    const entries = [makeEntry('b'), makeEntry('a')];
    const graph = buildDependencyGraph(entries);
    const original = [...graph];
    rankByDependents(graph);
    expect(graph).toEqual(original);
  });
});
