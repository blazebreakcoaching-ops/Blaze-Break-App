// Central, provider-independent community configuration/service (section
// 14 of the Phase 2 brief). No component should ever hardcode an
// external community URL - everything routes through here, so the
// underlying provider (currently unconfigured; Replicants is one option
// under consideration) can change later without touching Grounding's
// components at all.
//
// There is no live community API integration in this environment - this
// module defines the real shape of that integration and degrades to an
// honest disabled state when no base URL is configured, rather than
// fabricating a working community connection or any community content.

export interface CommunityConfig {
  enabled: boolean;
  baseUrl: string | null;
}

export interface CommunityResource {
  title: string;
  url: string;
  type: 'discussion' | 'coach_post' | 'workshop_recording' | 'faq' | 'guide' | 'featured_insight';
}

const trimTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

export const buildCommunityBaseLink = (config: CommunityConfig): string | null => {
  if (!config.enabled || !config.baseUrl) return null;
  return trimTrailingSlash(config.baseUrl);
};

export const buildCommunityTopicLink = (config: CommunityConfig, topicSlug: string): string | null => {
  const base = buildCommunityBaseLink(config);
  if (!base) return null;
  return `${base}/topics/${encodeURIComponent(topicSlug)}`;
};

export const buildCommunityEventsLink = (config: CommunityConfig): string | null => {
  const base = buildCommunityBaseLink(config);
  if (!base) return null;
  return `${base}/events`;
};

export const COMMUNITY_UNAVAILABLE_MESSAGE = "Community connection isn't available right now. Your reflection remains saved privately.";
