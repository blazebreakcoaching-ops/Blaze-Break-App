import { describe, it, expect } from 'vitest';
import {
  DEVICE_CHANNELS,
  isDeviceChannel,
  isValidAppVersion,
  validateDeviceRegistration,
  compareVersions,
  evaluateUpdateStatus,
} from './desktop-deployment';

describe('isDeviceChannel', () => {
  it('accepts every registered channel', () => {
    for (const channel of DEVICE_CHANNELS) {
      expect(isDeviceChannel(channel)).toBe(true);
    }
  });

  it('rejects unknown or non-string values', () => {
    expect(isDeviceChannel('nightly')).toBe(false);
    expect(isDeviceChannel(undefined)).toBe(false);
    expect(isDeviceChannel(null)).toBe(false);
  });
});

describe('isValidAppVersion', () => {
  it('accepts a well-formed semantic version', () => {
    expect(isValidAppVersion('1.2.3')).toBe(true);
    expect(isValidAppVersion('0.0.1')).toBe(true);
  });

  it('rejects malformed versions', () => {
    expect(isValidAppVersion('1.2')).toBe(false);
    expect(isValidAppVersion('1.2.3-beta')).toBe(false);
    expect(isValidAppVersion('v1.2.3')).toBe(false);
    expect(isValidAppVersion('')).toBe(false);
    expect(isValidAppVersion(123)).toBe(false);
  });
});

describe('validateDeviceRegistration', () => {
  const valid = { channel: 'stable', appVersion: '1.0.0' };

  it('accepts a valid minimal registration', () => {
    expect(validateDeviceRegistration(valid)).toEqual({ valid: true });
  });

  it('accepts a valid registration with a deviceName', () => {
    expect(validateDeviceRegistration({ ...valid, deviceName: "Alex's laptop" })).toEqual({ valid: true });
  });

  it('rejects null, undefined, and non-object input', () => {
    expect(validateDeviceRegistration(null).valid).toBe(false);
    expect(validateDeviceRegistration(undefined).valid).toBe(false);
    expect(validateDeviceRegistration('nope').valid).toBe(false);
  });

  it('rejects an unknown channel', () => {
    expect(validateDeviceRegistration({ ...valid, channel: 'nightly' }).valid).toBe(false);
  });

  it('rejects a malformed appVersion', () => {
    expect(validateDeviceRegistration({ ...valid, appVersion: 'latest' }).valid).toBe(false);
  });

  it('rejects an empty or overlong deviceName', () => {
    expect(validateDeviceRegistration({ ...valid, deviceName: '  ' }).valid).toBe(false);
    expect(validateDeviceRegistration({ ...valid, deviceName: 'x'.repeat(201) }).valid).toBe(false);
  });
});

describe('compareVersions', () => {
  it('detects less-than, equal, and greater-than across major/minor/patch', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(compareVersions('1.0.0', '1.1.0')).toBe(-1);
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1); // numeric, not lexicographic
  });
});

describe('evaluateUpdateStatus', () => {
  const config = { minVersion: '1.0.0', latestVersion: '1.5.0' };

  it('an unconfigured channel (null config) is reported honestly, never as "up to date"', () => {
    const result = evaluateUpdateStatus('1.0.0', null);
    expect(result.updateRequired).toBe(false);
    expect(result.updateAvailable).toBe(false);
    expect(result.latestVersion).toBeNull();
    expect(result.note).toMatch(/not been configured/);
  });

  it('a malformed stored config is treated the same as unconfigured', () => {
    const result = evaluateUpdateStatus('1.0.0', { minVersion: 'bad', latestVersion: '1.5.0' } as any);
    expect(result.note).toMatch(/not been configured/);
  });

  it('a version below the enforced minimum requires an update', () => {
    const result = evaluateUpdateStatus('0.9.0', config);
    expect(result.updateRequired).toBe(true);
    expect(result.updateAvailable).toBe(true);
  });

  it('a version at the minimum but below latest is available but not required', () => {
    const result = evaluateUpdateStatus('1.0.0', config);
    expect(result.updateRequired).toBe(false);
    expect(result.updateAvailable).toBe(true);
  });

  it('a version already at latest needs nothing', () => {
    const result = evaluateUpdateStatus('1.5.0', config);
    expect(result.updateRequired).toBe(false);
    expect(result.updateAvailable).toBe(false);
    expect(result.latestVersion).toBe('1.5.0');
  });

  it('a version ahead of latest (e.g. a dev build) needs nothing', () => {
    const result = evaluateUpdateStatus('2.0.0', config);
    expect(result.updateRequired).toBe(false);
    expect(result.updateAvailable).toBe(false);
  });
});
