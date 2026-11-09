import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
describe('Phase 2 — use the same existing systems, with separate authorities', () => {
  it('mounts a single Nova and Recovery experience, leaving agentic opt-in gated', () => {
    const app = read('src/App.tsx');
    const server = read('server.ts');
    expect(app).toContain('<NovaChat {...sharedNovaChatProps} />');
    expect(app).toContain('novaAgenticJourneyEnabled ? (');
    expect(app).toContain('<RecoveryIntelligenceHub key={sessionViewKey(user)} />');
    expect(server).toContain('"/api/nova/chat"');
    expect(server).toContain('"/api/recovery/routing-decision"');
  });
  it('connects member-facing Intelligence and Recovery Report without a parallel database', () => {
    const intelligence = read('src/components/RecoveryInsightsPanel.tsx');
    const report = read('src/components/ExecutiveBoardReport.tsx');
    expect(intelligence).toContain("secureApiFetch('/api/recovery/insights')");
    expect(intelligence).toContain("secureApiFetch('/api/recovery/recalculate'");
    expect(report).toContain("secureApiFetch('/api/signals/executive-report')");
    expect(intelligence).toContain('auth.currentUser !== session');
    expect(report).toContain('reportOwnerSession === user');
  });
  it('keeps Organisation membership and corporate aggregates under their own permission gates', () => {
    const app = read('src/App.tsx');
    const server = read('server.ts');
    expect(app).toContain("secureApiFetch('/api/org/me')");
    expect(app).toContain('setManagedTeams([]); setIsHrViewer(false); setIsOrgAdmin(false);');
    expect(server).toContain('app.get("/api/org/me"');
    expect(server).toContain('"/api/org/:orgId/manager-coach/chat"');
  });
  it('reuses the existing Evolution and Command Centre authorization and data routes', () => {
    const evolution = read('src/components/EvolutionEngine.tsx');
    const command = read('src/components/AdminDashboard.tsx');
    const panel = read('src/components/PlatformOutcomeIntelligencePanel.tsx');
    const server = read('server.ts');
    expect(evolution).toContain('/api/admin/evolution/nova-runtime');
    expect(evolution).toContain('/api/admin/evolution/registry');
    expect(command).toContain('<PlatformOutcomeIntelligencePanel />');
    expect(panel).toContain('/api/admin/product-intelligence?days=90');
    expect(panel).toContain('/api/admin/recovery-outcomes?days=90');
    expect(server).toContain('app.get("/api/admin/product-intelligence"');
    expect(server).toContain('app.get("/api/admin/recovery-outcomes"');
    expect(server).toContain('requirePermission(req, "content.manage");');
  });
  it('keeps explicitly gated educational modes and personal memory boundaries in place', () => {
    const server = read('server.ts');
    const brain = read('src/lib/nova-brain.ts');
    const release = read('docs/NHEI_RELEASE_BLOCKERS.md');
    expect(server).toContain('NHEI_EDUCATIONAL_MODE_ENABLED');
    expect(brain).toContain('cachedSession !== session');
    expect(release).toContain('Independent human review');
    expect(release).toContain('independent safeguarding system');
  });
});
