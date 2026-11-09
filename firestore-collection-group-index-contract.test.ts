import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Future new collection-group filters must declare their index before
// silently shipping a 500 FAILED_PRECONDITION at runtime. This is a
// manifest/source contract; it does NOT prove indexes are deployed.
const server = readFileSync('server.ts', 'utf8');
const manifest = JSON.parse(readFileSync('firestore.indexes.json', 'utf8'));
const filteredGroupQueries = [...server.matchAll(
  /collectionGroup\(\s*["']([^"']+)["']\s*\)\s*\.where\(\s*["']([^"']+)["']/g,
)].map(match => ({ collectionGroup: match[1], fieldPath: match[2] }));

describe('collection-group query index declarations', () => {
  it('declares a COLLECTION_GROUP index for every literal filtered group query in server.ts', () => {
    expect(filteredGroupQueries.length).toBeGreaterThanOrEqual(10);
    for (const query of filteredGroupQueries) {
      const field = (manifest.fieldOverrides ?? []).find((entry: any) =>
        entry.collectionGroup === query.collectionGroup && entry.fieldPath === query.fieldPath,
      );
      expect(field, `Missing field override for ${query.collectionGroup}/${query.fieldPath}`).toBeDefined();
      expect(field.indexes).toContainEqual({ order: 'ASCENDING', queryScope: 'COLLECTION_GROUP' });
    }
  });

  it('preserves default collection-scope asc/desc indexes on every overridden scalar field', () => {
    for (const field of manifest.fieldOverrides) {
      expect(field.indexes).toContainEqual({ order: 'ASCENDING', queryScope: 'COLLECTION' });
      expect(field.indexes).toContainEqual({ order: 'DESCENDING', queryScope: 'COLLECTION' });
    }
  });

  it('preserves the existing recommendation reservation composite index', () => {
    expect(manifest.indexes).toContainEqual({
      collectionGroup: 'recovery_routing_decisions',
      queryScope: 'COLLECTION',
      fields: [
        { fieldPath: 'selectedModule', order: 'ASCENDING' },
        { fieldPath: 'createdAt', order: 'DESCENDING' },
      ],
    });
  });
});
