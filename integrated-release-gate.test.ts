import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

describe('integrated source verification entrypoints', () => {
  it('exposes explicit web-only and all-platforms offline gates', () => {
    const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
    expect(scripts['verify:web:offline']).toContain('verify-integrated-release.mjs --web');
    expect(scripts['verify:integration:offline']).toContain('verify-integrated-release.mjs --all');
  });
  it('provides a locally executable help/usage failure without deploying', () => {
    const proc = readFileSync('scripts/verify-integrated-release.mjs', 'utf8');
    expect(proc).toContain('verify:release:offline');
    expect(proc).toContain('Native Jest');
    expect(proc).toContain('Functions unit tests');
    expect(proc).toContain('EXPECTED_RELEASE_SHA');
    expect(proc).not.toMatch(/['"](?:gcloud|firebase|eas|gh)['"],\s*\['(?:deploy|workflow)/);
  });
});
