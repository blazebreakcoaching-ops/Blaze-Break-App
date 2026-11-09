import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('single Firebase session key across protected customer and admin views', () => {
  const app = readFileSync('src/App.tsx', 'utf8');
  it('does not treat a UID alone as a login session identity', () => {
    expect(app).toContain('const SESSION_VIEW_KEYS = new WeakMap<object, string>();');
    expect(app).toContain('SESSION_VIEW_KEYS.get(user)');
    expect(app).toContain('SESSION_VIEW_KEYS.set(user, key)');
    expect(app).toContain('sessionViewKey(user)');
  });
  it('remounts the existing customer, organisation and governance views', () => {
    for (const tag of [
      'RecoveryIntelligenceHub', 'PrivacyVault', 'OrgDashboard',
      'TeamDashboard', 'HrEscalationDashboard', 'ExecutiveWorkDesignReport',
      'RecoveryIntelligenceLayer', 'ExecutiveBoardReport',
      'EvolutionEngine', 'AdminDashboard',
    ]) {
      expect(app).toContain('<' + tag + ' key={sessionViewKey(user)}');
    }
  });
  it('does not bypass protected backend role or consent endpoints', () => {
    const evolution = readFileSync('src/components/EvolutionEngine.tsx', 'utf8');
    const admin = readFileSync('src/components/AdminDashboard.tsx', 'utf8');
    const hub = readFileSync('src/components/RecoveryIntelligenceHub.tsx', 'utf8');
    expect(evolution).toContain('/api/admin/evolution/nova-runtime');
    expect(admin).toContain('/api/admin/');
    expect(hub).toContain('/api/recovery/routing-decision');
  });
});
