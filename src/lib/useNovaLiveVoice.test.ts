import { describe, it, expect } from 'vitest';
import { isServedViaHostingRewrite, CLOUD_RUN_DIRECT_HOST } from './useNovaLiveVoice';

// Only the pure host-routing decision is tested here - the hook itself
// is a React hook with real browser side effects (AudioContext,
// getUserMedia, WebSocket), matching this codebase's existing pattern of
// unit-testing extracted pure logic rather than components/hooks.

describe('isServedViaHostingRewrite', () => {
  it('is true for the custom domain, which is served via the Firebase Hosting rewrite', () => {
    expect(isServedViaHostingRewrite('www.blazebreak.app')).toBe(true);
    expect(isServedViaHostingRewrite('blazebreak.app')).toBe(true);
  });

  it('is false for the direct Cloud Run URL itself', () => {
    expect(isServedViaHostingRewrite(CLOUD_RUN_DIRECT_HOST)).toBe(false);
  });

  it('is false for any other *.run.app host (e.g. a future/different revision URL)', () => {
    expect(isServedViaHostingRewrite('some-other-service-123456.europe-west2.run.app')).toBe(false);
  });

  it('is false for local development hosts', () => {
    expect(isServedViaHostingRewrite('localhost:3000')).toBe(false);
    expect(isServedViaHostingRewrite('127.0.0.1:3000')).toBe(false);
  });
});
