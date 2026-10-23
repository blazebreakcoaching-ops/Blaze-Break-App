// NHEI PHASE 5 - SAFEGUARDING & TRUST BOUNDARY AUDIT (directive §9)
//
// "Audit exported test-only clearance helpers and ensure they cannot
// accidentally become active in production integration." This is a
// STATIC, enforceable regression guard, not a one-time manual check: it
// greps the actual source tree for every reference to the two test-only
// escape hatches this codebase defines -
// SIMULATED_TEST_ONLY_CLEARED_GATE (nhei-recovery-orchestration.ts) and
// grantNheiSystemAuthorityForTestingOnly (nhei-persistence-service.ts) -
// and fails if either is ever imported from server.ts or any .tsx
// component. A future edit that accidentally wires a test helper into
// production code breaks this test immediately, rather than waiting to
// be caught by a manual review that might not happen.
//
// Deliberately implemented as a plain grep over files, not an import
// graph analysis - this mirrors other static safety checks already in
// this codebase (e.g. dashboard-titles.test.ts's placeholder-tab check)
// and needs no new tooling.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, extname } from 'path';

const TEST_ONLY_SYMBOLS = ['SIMULATED_TEST_ONLY_CLEARED_GATE', 'grantNheiSystemAuthorityForTestingOnly'];

const SKIP_DIRS = new Set(['node_modules', 'dist', 'functions', 'mobile', '.git']);

function listFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) listFiles(full, out);
    else out.push(full);
  }
  return out;
}

describe('safeguarding/authority test-only helpers never reach production code', () => {
  it('server.ts never references either test-only symbol', () => {
    const content = readFileSync(join(__dirname, 'server.ts'), 'utf-8');
    for (const symbol of TEST_ONLY_SYMBOLS) {
      expect(content.includes(symbol)).toBe(false);
    }
  });

  it('no .tsx file anywhere in the repo references either test-only symbol', () => {
    const offenders: string[] = [];
    for (const file of listFiles(__dirname)) {
      if (extname(file) !== '.tsx') continue;
      const content = readFileSync(file, 'utf-8');
      for (const symbol of TEST_ONLY_SYMBOLS) {
        if (content.includes(symbol)) offenders.push(`${file}: ${symbol}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no non-test .ts file outside the two defining files actually IMPORTS either test-only symbol', () => {
    // Checks real import statements only (not mere mentions, e.g. in a
    // comment explaining why a file deliberately does NOT import one -
    // nhei-authority-contract.ts does exactly that).
    const DEFINING_FILES = new Set(['nhei-recovery-orchestration.ts', 'nhei-persistence-service.ts']);
    const offenders: string[] = [];
    for (const file of listFiles(__dirname)) {
      if (extname(file) !== '.ts') continue;
      const base = file.slice(__dirname.length + 1);
      if (base.includes('/')) continue; // only this project's own root-level .ts files are in scope here
      if (base.endsWith('.test.ts')) continue; // test files are expected/allowed to import these
      if (DEFINING_FILES.has(base)) continue; // the definition site itself always "contains" its own name
      const content = readFileSync(file, 'utf-8');
      for (const symbol of TEST_ONLY_SYMBOLS) {
        const importPattern = new RegExp(`import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from`);
        if (importPattern.test(content)) offenders.push(`${base}: ${symbol}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('UNINTEGRATED_SAFEGUARDING_GATE remains the only default clearance mechanism', () => {
  it('nhei-recovery-orchestration.ts never supplies a default value for its safeguardingGate parameter', () => {
    const content = readFileSync(join(__dirname, 'nhei-recovery-orchestration.ts'), 'utf-8');
    // A required parameter has no `= someDefault` after its type - this
    // greps for the specific shape a default would take, to catch a
    // future edit that quietly makes the gate optional-with-a-permissive-
    // fallback instead of a hard requirement.
    expect(content).not.toMatch(/safeguardingGate\s*[?]?\s*:\s*NheiSafeguardingGate\s*=/);
  });

  it('UNINTEGRATED_SAFEGUARDING_GATE itself still always returns cleared: false, for any input', async () => {
    const { UNINTEGRATED_SAFEGUARDING_GATE } = await import('./nhei-safeguarding-contract');
    const result = await UNINTEGRATED_SAFEGUARDING_GATE({ uid: 'anyone', conversationId: 'any-convo' });
    expect(result.cleared).toBe(false);
  });
});
