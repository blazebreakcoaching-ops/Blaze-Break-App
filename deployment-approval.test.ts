import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('production release deployment approval', () => {
  it('does not automatically deploy on a main branch push', () => {
    const yaml = readFileSync('.github/workflows/deploy.yml', 'utf8');
    const triggerSection = yaml.split(/^on:\s*$/m)[1]?.split(/^env:\s*$/m)[0] ?? '';
    expect(triggerSection).toContain('workflow_dispatch:');
    expect(triggerSection).not.toMatch(/^\s+push:/m);
  });
});
