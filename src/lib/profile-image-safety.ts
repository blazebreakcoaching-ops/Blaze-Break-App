/**
 * Local-only profile photo validation and resize rules.
 * Prevents unrestricted canvas allocation from very tall/large images;
 * does not upload raw files or introduce a new integration.
 */
export const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PROFILE_IMAGE_PIXELS = 40_000_000;
export const MAX_PROFILE_IMAGE_EDGE = 200;
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
]);

export function profileImageFileError(type: string, bytes: number): string | null {
  if (!ALLOWED_TYPES.has(type)) return 'Choose a JPEG, PNG, WebP, GIF or supported HEIC photo.';
  if (!Number.isSafeInteger(bytes) || bytes <= 0) return 'This image file is empty or invalid.';
  if (bytes > MAX_PROFILE_IMAGE_BYTES) return 'Choose a photo smaller than 5 MB.';
  return null;
}

export function profileImageDimensions(width: number, height: number): {
  width: number; height: number;
} {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width <= 0 || height <= 0 ||
      width * height > MAX_PROFILE_IMAGE_PIXELS) {
    throw new Error('Invalid or excessively large image dimensions');
  }
  const scale = Math.min(1, MAX_PROFILE_IMAGE_EDGE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
