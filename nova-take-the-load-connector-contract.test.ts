import { describe, it, expect } from 'vitest';
import { createFakeConnectorForTesting } from './nova-take-the-load-connector-contract';

describe('createFakeConnectorForTesting', () => {
  it('defaults to a successful, clearly-labelled simulated outcome', async () => {
    const connector = createFakeConnectorForTesting();
    const result = await connector.execute({ category: 'calendar_protection', proposedChangeDescription: 'x' });
    expect(result.ok).toBe(true);
    expect(result.detail).toMatch(/simulated/i);
    expect(connector.connectorKind).toBe('fake_test_only');
  });

  it('lets a test override the ready/execute/undo outcomes explicitly', async () => {
    const connector = createFakeConnectorForTesting({
      readyResult: { ready: false, reason: 'no slot available' },
      executeResult: { ok: false, detail: 'denied' },
      undoResult: { ok: false, detail: 'cannot undo' },
    });
    expect(await connector.checkReady({ category: 'task_deferral', proposedChangeDescription: 'x' })).toEqual({ ready: false, reason: 'no slot available' });
    expect(await connector.execute({ category: 'task_deferral', proposedChangeDescription: 'x' })).toEqual({ ok: false, detail: 'denied' });
    expect(await connector.undo({ category: 'task_deferral', proposedChangeDescription: 'x' })).toEqual({ ok: false, detail: 'cannot undo' });
  });
});

describe('no real connector exists in this codebase (static guard)', () => {
  it('this file performs no network call - no fetch/http/https import anywhere in it', async () => {
    const fs = await import('node:fs');
    const content = fs.readFileSync(new URL('./nova-take-the-load-connector-contract.ts', import.meta.url), 'utf8');
    expect(content).not.toMatch(/\bfetch\s*\(/);
    expect(content).not.toMatch(/from\s+['"]https?['"]/);
    expect(content).not.toMatch(/from\s+['"]node:https?['"]/);
  });

  it('createFakeConnectorForTesting is never imported from server.ts or any .tsx file', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(new URL('.', import.meta.url).pathname);
    const importRegex = /import\s*\{[^}]*\bcreateFakeConnectorForTesting\b[^}]*\}\s*from/;

    const serverPath = path.join(root, 'server.ts');
    if (fs.existsSync(serverPath)) {
      expect(fs.readFileSync(serverPath, 'utf8')).not.toMatch(importRegex);
    }

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

    for (const file of walk(path.join(root, 'src'))) {
      expect(fs.readFileSync(file, 'utf8')).not.toMatch(importRegex);
    }
  });
});
