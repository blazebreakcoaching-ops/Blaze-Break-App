import { describe, expect, it } from 'vitest';
import {
  MAX_PROFILE_IMAGE_BYTES, profileImageFileError, profileImageDimensions,
} from './profile-image-safety';

describe('profile photo client safety', () => {
  it('accepts ordinary supported photo files', () => {
    expect(profileImageFileError('image/jpeg', 230_000)).toBeNull();
    expect(profileImageFileError('image/png', MAX_PROFILE_IMAGE_BYTES)).toBeNull();
  });
  it('rejects oversized, empty, unsupported or script-capable image uploads', () => {
    expect(profileImageFileError('image/jpeg', MAX_PROFILE_IMAGE_BYTES + 1)).toMatch(/smaller/);
    expect(profileImageFileError('image/jpeg', 0)).toMatch(/empty/);
    expect(profileImageFileError('image/svg+xml', 125_000)).toMatch(/Choose/);
    expect(profileImageFileError('text/html', 100)).toMatch(/Choose/);
  });
  it('bounds BOTH sides and never upscales an already small photo', () => {
    expect(profileImageDimensions(4000, 2000)).toEqual({ width: 200, height: 100 });
    expect(profileImageDimensions(160, 80)).toEqual({ width: 160, height: 80 });
    expect(profileImageDimensions(20, 2000)).toEqual({ width: 2, height: 200 });
  });
  it('rejects invalid or unreasonably large decoded dimensions', () => {
    expect(() => profileImageDimensions(0, 100)).toThrow();
    expect(() => profileImageDimensions(50000, 50000)).toThrow();
    expect(() => profileImageDimensions(NaN, 120)).toThrow();
  });
});
