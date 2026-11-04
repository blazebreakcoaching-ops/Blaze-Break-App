import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Google Cloud launch check remains read only', () => {
  const src = readFileSync('scripts/cloud-readonly-preflight.mjs', 'utf8');
  it('has an explicit staging and production target', () => {
    expect(src).toContain("['production', 'staging']");
    expect(src).toContain("aliases.staging");
    expect(src).toContain("firebase-applet-config.json");
  });
  it('fails closed on wrong Firestore project, mismatched staging app and runtime identity', () => {
    expect(src).toContain("dbInfo.name === 'projects/' + project + '/databases/' + database");
    expect(src).toContain("web.appId !== productionWeb.appId");
    expect(src).toContain("explicitProject ? 'FAIL' : 'CHECK'");
  });
  it('checks live service traffic is assigned to named revisions', () => {
    expect(src).toContain("totalTraffic === 100");
    expect(src).toContain("typeof item.revisionName === 'string'");
  });
  it('does not contain mutating gcloud commands, token dumps or secret reads', () => {
    expect(src).not.toMatch(/run\(\[\s*['"](?:run|firestore|projects|secrets|iam)['"]\s*,\s*['"](?:deploy|update|delete|create|access|set-iam-policy)/);
    expect(src).not.toMatch(/run\(\[\s*['"]auth['"]\s*,\s*['"]print-access-token/);
    expect(src).not.toContain('p.stdout.slice');
    expect(src).not.toContain('console.log(p.stdout)');
  });
});
