// Phase 5E (directive §3): static guard proving nova-google-calendar-connector.ts,
// despite being a REAL, working connector (unlike Phase 5D's structurally-
// inert stub), still never performs a real network call of its own and is
// never imported by server.ts or any route - the only thing standing
// between this real code and a real external write is that nothing in
// production ever constructs or calls it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname);

describe('nova-google-calendar-connector.ts never calls fetch or http directly', () => {
  const content = fs.readFileSync(path.join(ROOT, 'nova-google-calendar-connector.ts'), 'utf8');

  it('has no fetch() call anywhere - all I/O goes through the injected transport', () => {
    expect(content).not.toMatch(/\bfetch\s*\(/);
  });

  it('has no import of node:http/https or any googleapis.com module', () => {
    expect(content).not.toMatch(/from\s+['"](node:)?https?['"]/);
    expect(content).not.toMatch(/from\s+['"][^'"]*googleapis[^'"]*['"]/);
  });
});

describe('nova-google-calendar-connector.ts is never imported by production code', () => {
  const importRegex = /from\s+['"]\.\/nova-google-calendar-connector['"]/;

  it('server.ts does not import it', () => {
    expect(fs.readFileSync(path.join(ROOT, 'server.ts'), 'utf8')).not.toMatch(importRegex);
  });

  it('no .tsx file imports it', () => {
    function walk(dir: string): string[] {
      let results: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.git')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) results = results.concat(walk(full));
        else if (entry.name.endsWith('.tsx')) results.push(full);
      }
      return results;
    }
    for (const file of walk(path.join(ROOT, 'src'))) {
      expect(fs.readFileSync(file, 'utf8')).not.toMatch(importRegex);
    }
  });
});
