import { existsSync } from 'node:fs';

// Respect Playwright's own managed Chromium on macOS/Windows/ordinary Linux.
// Retain support for the special sandbox's pre-provisioned binary when present.
const LEGACY_SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';

export function chromiumLaunchOptions(fileExists: (path: string) => boolean = existsSync):
  { executablePath?: string } {
  return fileExists(LEGACY_SANDBOX_CHROMIUM)
    ? { executablePath: LEGACY_SANDBOX_CHROMIUM }
    : {};
}
