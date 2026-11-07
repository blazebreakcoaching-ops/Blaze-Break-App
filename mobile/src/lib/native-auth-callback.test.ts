import { describe, expect, it } from 'vitest';
import { mayCommitNativeAuthCallback as allowed } from './native-auth-callback';

describe('native Firebase authentication ownership', () => {
  it('accepts the current account only', () => {
    expect(allowed(3, 3, 'B', 'B', true)).toBe(true);
  });
  it('never commits a previous account after a newer auth event', () => {
    expect(allowed(2, 3, 'A', 'B', true)).toBe(false);
  });
  it('checks live Firebase UID even before another event callback arrives', () => {
    expect(allowed(2, 2, 'A', 'B', true)).toBe(false);
  });
  it('blocks old callbacks after unmount', () => {
    expect(allowed(2, 2, 'A', 'A', false)).toBe(false);
  });
  it('accepts the current sign-out event, not a stale signed-in identity', () => {
    expect(allowed(3, 3, null, null, true)).toBe(true);
    expect(allowed(3, 3, 'A', null, true)).toBe(false);
  });
});
