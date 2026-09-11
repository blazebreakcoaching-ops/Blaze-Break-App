// Pure logic for the Enterprise desktop-deployment control plane - kept
// I/O-free and unit-tested, same pattern as org-rbac.ts. server.ts owns
// reading/writing organisations/{orgId}/devices/{id} and the platform-wide
// app_config/release_channels document; this file only defines valid
// input shapes and the update-check math.
//
// IMPORTANT: there is no real Blaze Break desktop client in this codebase
// today - the PWA (installable via the existing service worker) is the
// only client actually shipped. This module is a backend control plane
// only, built so a future desktop client has somewhere real to register
// itself, report its version, and be centrally managed - not a claim that
// such a client exists yet. See docs/DESKTOP_DEPLOYMENT.md.

export const DEVICE_CHANNELS = ['stable', 'beta'] as const;
export type DeviceChannel = (typeof DEVICE_CHANNELS)[number];

export const isDeviceChannel = (value: unknown): value is DeviceChannel =>
  typeof value === 'string' && (DEVICE_CHANNELS as readonly string[]).includes(value);

export const DEVICE_STATUSES = ['active', 'revoked'] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export const isValidAppVersion = (value: unknown): value is string =>
  typeof value === 'string' && VERSION_PATTERN.test(value);

export interface DeviceRegistrationValidationResult {
  valid: boolean;
  error?: string;
}

const MAX_DEVICE_NAME_LENGTH = 200;

export const validateDeviceRegistration = (input: unknown): DeviceRegistrationValidationResult => {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'A device registration object is required.' };
  }
  const candidate = input as Record<string, unknown>;
  if (!isDeviceChannel(candidate.channel)) {
    return { valid: false, error: `"channel" must be one of: ${DEVICE_CHANNELS.join(', ')}.` };
  }
  if (!isValidAppVersion(candidate.appVersion)) {
    return { valid: false, error: '"appVersion" must be a semantic version string like "1.2.3".' };
  }
  if (candidate.deviceName !== undefined) {
    if (typeof candidate.deviceName !== 'string' || candidate.deviceName.trim().length === 0) {
      return { valid: false, error: '"deviceName" must be a non-empty string if provided.' };
    }
    if (candidate.deviceName.length > MAX_DEVICE_NAME_LENGTH) {
      return { valid: false, error: `"deviceName" must be ${MAX_DEVICE_NAME_LENGTH} characters or fewer.` };
    }
  }
  return { valid: true };
};

// Compares two `major.minor.patch` version strings (the only shape
// isValidAppVersion accepts). Returns -1 if a < b, 1 if a > b, 0 if equal.
export const compareVersions = (a: string, b: string): number => {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (partsA[i] !== partsB[i]) {
      return partsA[i] < partsB[i] ? -1 : 1;
    }
  }
  return 0;
};

export interface ReleaseChannelConfig {
  minVersion: string;
  latestVersion: string;
}

export interface UpdateCheckResult {
  updateRequired: boolean;
  updateAvailable: boolean;
  latestVersion: string | null;
  note?: string;
}

// Given a device's own reported appVersion and the release config for the
// channel it's registered on (or null/malformed if no admin has set one up
// yet), decides whether the device MUST update (below the enforced
// minimum) or simply COULD (a newer version is available). A missing or
// invalid config is never treated as "everything is fine" - it's reported
// plainly as unconfigured, so a caller can't mistake silence for an
// up-to-date device.
export const evaluateUpdateStatus = (
  appVersion: string,
  config: ReleaseChannelConfig | null | undefined
): UpdateCheckResult => {
  if (!config || !isValidAppVersion(config.minVersion) || !isValidAppVersion(config.latestVersion)) {
    return {
      updateRequired: false,
      updateAvailable: false,
      latestVersion: null,
      note: 'This release channel has not been configured yet.',
    };
  }
  return {
    updateRequired: compareVersions(appVersion, config.minVersion) < 0,
    updateAvailable: compareVersions(appVersion, config.latestVersion) < 0,
    latestVersion: config.latestVersion,
  };
};
