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

// Phase 5I, directive §9 - static companion to the dynamic spy-based
// regression in nova-calendar-protection-route.test.ts ("never calls the
// real Google Calendar connector factory on execute/undo... while the
// kill-switch is off"). That test proves the factory is never actually
// CALLED at runtime; this proves the SOURCE itself never constructs a
// connector unconditionally - both routes' connector assignment is
// syntactically gated behind the same `CALENDAR_PROTECTION_EXECUTION_ENABLED`
// check used everywhere else in this file, not merely relying on the
// service layer's own internal kill-switch check as the only guard.
describe('server.ts gates the real Google Calendar connector factory behind CALENDAR_PROTECTION_EXECUTION_ENABLED at both call sites', () => {
  const serverContent = fs.readFileSync(path.join(ROOT, 'server.ts'), 'utf8');
  const gatedConnectorAssignment = /const connector = CALENDAR_PROTECTION_EXECUTION_ENABLED \? await resolveGoogleCalendarConnectorForExecution\(uid\) : null;/g;

  it('appears exactly twice - once for execute, once for undo', () => {
    const matches = serverContent.match(gatedConnectorAssignment);
    expect(matches?.length).toBe(2);
  });

  it('resolveGoogleCalendarConnectorForExecution appears exactly 3 times: its own declaration, plus the two gated call sites above - never a third, unguarded call', () => {
    const allOccurrences = serverContent.match(/resolveGoogleCalendarConnectorForExecution\(/g) || [];
    expect(allOccurrences.length).toBe(3);
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
