import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('production release deployment approval', () => {
  it('does not automatically deploy on a main branch push', () => {
    const yaml = readFileSync('.github/workflows/deploy.yml', 'utf8');
    const triggerSection = yaml.split(/^on:\s*$/m)[1]?.split(/^env:\s*$/m)[0] ?? '';
    expect(triggerSection).toContain('workflow_dispatch:');
    expect(triggerSection).not.toMatch(/^\s+push:/m);
  });
  it('requires an exact SHA, main branch and explicit approval before production deployment', () => {
    const yaml = readFileSync('.github/workflows/deploy.yml', 'utf8');
    expect(yaml).toContain('confirm_production:');
    expect(yaml).toContain('approved_sha:');
    expect(yaml).toMatch(/auth_only:[\s\S]*?default: true/);
    const guard = yaml.split('name: Block unapproved or non-main production deployment')[1]
      ?.split('name: Authenticate to Google Cloud with OIDC')[0] ?? '';
    expect(guard).toContain('inputs.auth_only == false');
    expect(guard).toContain('APPROVED_SHA: ${{ inputs.approved_sha }}');
    expect(guard).toContain('CONFIRM_PRODUCTION: ${{ inputs.confirm_production }}');
    expect(guard).toContain('"$GITHUB_REF" != "refs/heads/main"');
    expect(guard).toContain('"$CONFIRM_PRODUCTION" != "true"');
    expect(guard).toContain('^[0-9a-f]{40});
    expect(guard).toContain('"$APPROVED_SHA" != "$GITHUB_SHA"');
    expect(guard).toContain('exit 1');
  });
});
