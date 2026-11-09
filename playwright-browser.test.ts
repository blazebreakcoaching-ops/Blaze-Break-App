import { describe, expect, it } from 'vitest';
import { chromiumLaunchOptions } from './playwright-browser';

describe('portable Playwright Chromium resolution', () => {
  it('uses Playwright-managed Chromium when the sandbox binary is absent', () => {
    expect(chromiumLaunchOptions(() => false)).toEqual({});
  });
  it('retains the pre-provisioned sandbox Chromium when installed', () => {
    expect(chromiumLaunchOptions(() => true)).toEqual({ executablePath: '/opt/pw-browsers/chromium' });
  });
});
