import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * GEMINI_API_KEY is a Cloud Run server secret. It must never be
 * substituted into browser JS by Vite's define or loadEnv.
 * Web chat/voice must use authenticated server endpoints.
 */
describe('browser bundle secret boundary', () => {
  it('does not expose or define a server Gemini key in the frontend build configuration', () => {
    const config = readFileSync('vite.config.ts', 'utf8');
    expect(config).not.toMatch(/process\.env\.GEMINI_API_KEY/);
    expect(config).not.toMatch(/\bloadEnv\s*\(/);
    expect(config).not.toMatch(/env\.GEMINI_API_KEY/);
  });
});
