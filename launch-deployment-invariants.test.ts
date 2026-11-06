import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('staging and production release invariants', () => {
  it('excludes generated OIDC credentials from Cloud Build uploads', () => {
    const cloudignore = read('.gcloudignore');
    expect(read('.gitignore')).toContain('gha-creds-*.json');
    expect(cloudignore).toContain('#!include:.gitignore');
    expect(cloudignore).toContain('gha-creds-*.json');
    expect(cloudignore).toContain('**/gha-creds-*.json');
    const deploy = read('.github/workflows/deploy.yml');
    expect(deploy).toContain('gcloud meta list-files-for-upload');
    expect(deploy).toContain('Temporary Google credentials would be included');
  });
  it('requires a manual action and a nondefault setting for deployment', () => {
    const deploy = read('.github/workflows/deploy.yml');
    const triggers = deploy.split('\nenv:')[0];
    expect(triggers).toContain('  workflow_dispatch:');
    expect(triggers).not.toMatch(/^  push:/m);
    expect(deploy).toContain('default: true');
    expect(deploy).toContain('id-token: write');
    expect(deploy).not.toContain('credentials_json:');
    expect((deploy.match(/if: \${{ inputs.auth_only == false }}/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
  it('checks the named production Firestore database with read-only calls', () => {
    const deploy = read('.github/workflows/deploy.yml');
    expect(deploy).toContain('gcloud firestore databases describe');
    expect(deploy).toContain('gcloud run services describe');
    expect(deploy).toContain('FIRESTORE_DATABASE: ai-studio-67723f85-0bfc-4690-ac83-580d6face1fc');
  });
  it('uses the staging Cloud Run service for staging checks', () => {
    const preflight = read('scripts/cloud-readonly-preflight.mjs');
    expect(preflight).toContain("const service = target === 'staging' ? 'blaze-break-staging' : 'blaze-break';");
    expect(preflight).toContain("const project = target === 'production' ? productionProject : aliases.staging;");
  });
});
