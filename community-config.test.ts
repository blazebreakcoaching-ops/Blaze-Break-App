import { describe, it, expect } from 'vitest';
import { buildCommunityBaseLink, buildCommunityTopicLink, buildCommunityEventsLink, CommunityConfig } from './community-config';

const disabled: CommunityConfig = { enabled: false, baseUrl: null };
const enabled: CommunityConfig = { enabled: true, baseUrl: 'https://community.blazebreak.example/' };

describe('buildCommunityBaseLink', () => {
  it('returns null when the community is not enabled', () => {
    expect(buildCommunityBaseLink(disabled)).toBeNull();
  });

  it('returns null when enabled but no base URL is configured (should never happen, but never crash)', () => {
    expect(buildCommunityBaseLink({ enabled: true, baseUrl: null })).toBeNull();
  });

  it('strips a trailing slash from the configured base URL', () => {
    expect(buildCommunityBaseLink(enabled)).toBe('https://community.blazebreak.example');
  });
});

describe('buildCommunityTopicLink', () => {
  it('returns null when disabled, regardless of topic', () => {
    expect(buildCommunityTopicLink(disabled, 'boundaries')).toBeNull();
  });

  it('builds a real topic URL when enabled', () => {
    expect(buildCommunityTopicLink(enabled, 'boundaries')).toBe('https://community.blazebreak.example/topics/boundaries');
  });

  it('URL-encodes the topic slug', () => {
    expect(buildCommunityTopicLink(enabled, 'rest & recovery')).toBe('https://community.blazebreak.example/topics/rest%20%26%20recovery');
  });
});

describe('buildCommunityEventsLink', () => {
  it('returns null when disabled', () => {
    expect(buildCommunityEventsLink(disabled)).toBeNull();
  });

  it('builds a real events URL when enabled', () => {
    expect(buildCommunityEventsLink(enabled)).toBe('https://community.blazebreak.example/events');
  });
});
