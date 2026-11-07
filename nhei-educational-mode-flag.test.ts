// NHEI PHASE 3C-2B CHECKPOINT 2 - SECTION 2: EDUCATIONAL MODE FEATURE FLAG TESTS

import { describe, it, expect } from 'vitest';
import { nheiEducationalModeIsEnabled, nheiEducationalModeIsEnabledNow, NHEI_EDUCATIONAL_MODE_ENV_VAR } from './nhei-educational-mode-flag';

describe('nheiEducationalModeIsEnabled - defaults OFF, same polarity as nudgeSchedulerIsEnabled', () => {
  it('is false when the env var is unset', () => {
    expect(nheiEducationalModeIsEnabled(undefined)).toBe(false);
  });

  it('is false for an empty string', () => {
    expect(nheiEducationalModeIsEnabled('')).toBe(false);
  });

  it('is false for common "truthy-looking" values that are not the exact string "true"', () => {
    expect(nheiEducationalModeIsEnabled('1')).toBe(false);
    expect(nheiEducationalModeIsEnabled('yes')).toBe(false);
    expect(nheiEducationalModeIsEnabled('True')).toBe(false);
    expect(nheiEducationalModeIsEnabled('TRUE')).toBe(false);
    expect(nheiEducationalModeIsEnabled('enabled')).toBe(false);
  });

  it('is true only for the exact string "true"', () => {
    expect(nheiEducationalModeIsEnabled('true')).toBe(true);
  });

  it('reflects this actual environment as disabled - per this checkpoint\'s explicit instruction, nothing sets this env var here', () => {
    expect(nheiEducationalModeIsEnabledNow()).toBe(false);
    expect(process.env[NHEI_EDUCATIONAL_MODE_ENV_VAR]).toBeUndefined();
  });
});
