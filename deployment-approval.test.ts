import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('production release deployment approval', () => {
  const yaml = readFileSync('.github/workflows/deploy.yml', 'utf8');
  it('does not automatically deploy on a main branch push', () => {
    const triggerSection = yaml.split(/^on:\s*$/m)[1]?.split(/^env:\s*$/m)[0] ?? '';
    expect(triggerSection).toContain('workflow_dispatch:');
    expect(triggerSection).not.toMatch(/^\s+push:/m);
  });
  it('blocks deployment without approved SHA, main ref and confirmation', () => {
    expect(yaml).toContain('confirm_production:');
    expect(yaml).toContain('approved_sha:');
    expect(yaml).toMatch(/auth_only:[\s\S]*?default: true/);
    const guard = yaml.split('name: Block unapproved or non-main production deployment')[1]
      ?.split('name: Authenticate to Google Cloud with OIDC')[0] ?? '';
    expect(guard).toContain('inputs.auth_only == false');
    expect(guard).toContain('APPROVED_SHA:');
    expect(guard).toContain('CONFIRM_PRODUCTION:');
    expect(guard).toContain('refs/heads/main');
    expect(guard).toContain('CONFIRM_PRODUCTION');
    expect(guard).toContain('^[0-9a-f]{40}');
    expect(guard).toContain('GITHUB_SHA');
    expect(guard).toContain('exit 1');
  });
});
