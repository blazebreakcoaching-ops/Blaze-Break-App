import { describe, it, expect } from 'vitest';
import { buildPlatformConnectorViews, buildOrgConnectorView, PLATFORM_DEPENDENCY_IDS } from './connector-layer';

describe('buildPlatformConnectorViews', () => {
  it('produces one view per known platform dependency', () => {
    const views = buildPlatformConnectorViews({});
    expect(views).toHaveLength(PLATFORM_DEPENDENCY_IDS.length);
    expect(views.map((v) => v.connectorId).sort()).toEqual([...PLATFORM_DEPENDENCY_IDS].sort());
  });

  it('reflects the real configured boolean passed in, never inventing a status', () => {
    const views = buildPlatformConnectorViews({ twilio: true, brevo: false });
    const twilio = views.find((v) => v.connectorId === 'twilio')!;
    const brevo = views.find((v) => v.connectorId === 'brevo')!;
    expect(twilio.status).toBe('configured');
    expect(twilio.authenticationState).toBe('credentials_present');
    expect(brevo.status).toBe('not_configured');
    expect(brevo.authenticationState).toBe('not_connected');
  });

  it('never claims a live-verified "healthy" status - configured is the honest ceiling', () => {
    const views = buildPlatformConnectorViews({ twilio: true });
    for (const view of views) {
      expect(view.status).not.toBe('healthy');
    }
  });

  it('every view has a non-empty, real-looking fallback description', () => {
    const views = buildPlatformConnectorViews({});
    for (const view of views) {
      expect(view.fallback.length).toBeGreaterThan(20);
    }
  });

  it('marks AI providers (compute-only) as not mutating, and messaging providers as mutating', () => {
    const views = buildPlatformConnectorViews({});
    expect(views.find((v) => v.connectorId === 'gemini')!.mutationAllowed).toBe(false);
    expect(views.find((v) => v.connectorId === 'twilio')!.mutationAllowed).toBe(true);
    expect(views.find((v) => v.connectorId === 'brevo')!.mutationAllowed).toBe(true);
  });
});

describe('buildOrgConnectorView', () => {
  it('maps a real org connector doc into the unified shape', () => {
    const view = buildOrgConnectorView('conn_1', 'org_1', {
      type: 'slack', displayName: 'Slack', status: 'active', authStatus: 'not_connected', isLocal: false, configuredBy: 'uid_1', lastSync: null,
    });
    expect(view.scope).toBe('organisation');
    expect(view.orgId).toBe('org_1');
    expect(view.owner).toBe('uid_1');
    expect(view.mutationAllowed).toBe(false);
  });

  it('never claims mutation capability for a type with no real OAuth handshake', () => {
    const view = buildOrgConnectorView('conn_1', 'org_1', {
      type: 'jira', displayName: 'Jira', status: 'active', authStatus: 'connected', isLocal: false,
    });
    expect(view.mutationAllowed).toBe(false);
  });

  it('describes a local connector honestly as having nothing external to fail', () => {
    const view = buildOrgConnectorView('conn_2', 'org_1', {
      type: 'local', displayName: 'Local document upload', status: 'active', authStatus: 'not_applicable', isLocal: true,
    });
    expect(view.fallback).toMatch(/no external dependency/);
    expect(view.capabilities[0]).toMatch(/Local document upload/);
  });
});
