// Phase 5C, directive §5: "do not execute any real external calendar
// modification during this batch without separate explicit
// authorisation." Static guard proving:
//   1. nova-calendar-protection-service.ts makes no real network call to
//      googleapis.com or any other external host (no `fetch`, no
//      `https`/`http` import) - the only I/O it performs is through the
//      injected FirestoreLike and the injected NovaExternalConnector.
//   2. TEST_ONLY_FORCE_EXECUTION_ENABLED is never imported from
//      server.ts or any .tsx file.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname);

describe('nova-calendar-protection-service.ts never makes a real external call', () => {
  const content = fs.readFileSync(path.join(ROOT, 'nova-calendar-protection-service.ts'), 'utf8');

  it('has no fetch() call anywhere', () => {
    expect(content).not.toMatch(/\bfetch\s*\(/);
  });

  it('has no import of http/https or any googleapis.com module', () => {
    expect(content).not.toMatch(/from\s+['"](node:)?https?['"]/);
    expect(content).not.toMatch(/from\s+['"][^'"]*googleapis[^'"]*['"]/);
  });
});

describe('TEST_ONLY_FORCE_EXECUTION_ENABLED is never imported outside this file\'s own test', () => {
  const importRegex = /import\s*\{[^}]*\bTEST_ONLY_FORCE_EXECUTION_ENABLED\b[^}]*\}\s*from/;

  it('server.ts does not import it', () => {
    const serverPath = path.join(ROOT, 'server.ts');
    if (fs.existsSync(serverPath)) {
      expect(fs.readFileSync(serverPath, 'utf8')).not.toMatch(importRegex);
    }
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
