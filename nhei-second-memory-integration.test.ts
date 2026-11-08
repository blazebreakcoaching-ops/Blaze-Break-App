import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const read = (path: string) => readFileSync(path, 'utf8');

describe('Second Memory and Nova memory rights integration', () => {
  it('routes private user-created notes through authenticated server endpoints', () => {
    const server = read('server.ts');
    for (const route of [
      'app.get("/api/nova/second-memory"',
      'app.post("/api/nova/second-memory"',
      'app.patch("/api/nova/second-memory/:id"',
      'app.delete("/api/nova/second-memory"',
      'app.delete("/api/nova/second-memory/:id"',
    ]) expect(server).toContain(route);
    expect(server).toContain('transaction.get(permissionsRef)');
    expect(server).toContain('transaction.get(collection.limit(MAX_OPEN_LOOPS))');
    expect(server).toContain('transaction.create(ref');
  });

  it('keeps memory and note review available after consent withdrawal', () => {
    const rules = read('firestore.rules');
    const start = rules.indexOf('match /nova_memories/{memoryId}');
    const end = rules.indexOf('// M. nudge_history', start);
    const block = rules.slice(start, end);
    expect(block).toContain('allow read: if isOwner(uid)');
    expect(block).toContain('resource.data.canEdit == true');
    expect(block).toContain('allowNovaMemory == true');
    expect(block).toContain("affectedKeys().hasOnly(['content', 'updatedAt'])");
    const centre = read('src/components/MemoryCentre.tsx');
    expect(centre).toContain('<PastNovaMemoriesReview />');
    expect(centre).toContain('<SecondMemoryCard />');
  });

  it('rejects stale shared memory loads from another account and checks active consent', () => {
    const source = read('src/lib/nova-brain.ts');
    expect(source).toContain('requestedEpoch !== cacheEpoch');
    expect(source).toContain('auth.currentUser?.uid !== uid');
    expect(source).toContain('permissionSnap.data().allowNovaMemory === true');
    expect(source).toContain('permissionSnap.data().allowNovaUseSavedMemories === true');
    expect(source).toContain('if (!succeeded) {');
  });

  it('shows actual adaptive influence and access to private notes in the Recovery Hub', () => {
    const hub = read('src/components/RecoveryIntelligenceHub.tsx');
    expect(hub).toContain('decision?.adaptiveLearningUsed === true');
    expect(hub).toContain('<SecondMemoryCard minimal />');
    expect(hub).toContain("navigateToTab('privacy')");
  });
});
