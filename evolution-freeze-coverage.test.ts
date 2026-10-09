import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Structural/text-based verification against the real server.ts source -
// the same technique protected-core-invariants.test.ts and
// tab-visibility.test.ts use. A freeze kill-switch is only as real as its
// coverage: this reads every actual `app.post("/api/admin/evolution/...")`
// handler and asserts it calls requireEvolutionNotFrozen(), so a future
// new mutating Evolution Engine route can never be silently exempt
// without this test failing. The freeze toggle route itself is the one
// deliberate exception - it must NOT call its own check, or freezing
// would be permanent.
describe('Freeze Evolution coverage (structural)', () => {
  const serverSource = readFileSync(join(__dirname, 'server.ts'), 'utf-8');

  // Matches each `app.post("/api/admin/evolution/<path>", ...` declaration.
  const routeMatches = [...serverSource.matchAll(/app\.post\("(\/api\/admin\/evolution\/[^"]+)"/g)];

  it('found at least the 12 known mutating Evolution Engine routes', () => {
    expect(routeMatches.length).toBeGreaterThanOrEqual(12);
  });

  for (const match of routeMatches) {
    const path = match[1];
    const startIdx = match.index!;
    const endIdx = serverSource.indexOf('\n});', startIdx);

    it(`"${path}" ${path === '/api/admin/evolution/freeze' ? 'is the toggle itself and must NOT call requireEvolutionNotFrozen' : 'calls requireEvolutionNotFrozen before mutating anything'}`, () => {
      expect(endIdx).toBeGreaterThan(startIdx);
      const body = serverSource.slice(startIdx, endIdx);
      if (path === '/api/admin/evolution/freeze') {
        expect(body).not.toMatch(/requireEvolutionNotFrozen\(\)/);
      } else {
        expect(body).toMatch(/await requireEvolutionNotFrozen\(\);/);
      }
    });
  }
});
