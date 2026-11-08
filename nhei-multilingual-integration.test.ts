import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('unified multilingual and NHEI integration contracts', () => {
  it('keeps adaptive preferences behind all three consent checks in the existing authenticated router', () => {
    const code = read('server.ts');
    expect(code).toContain('p?.allowAdaptiveIntelligence === true');
    expect(code).toContain('p.allowNovaMemory === true && p.allowNovaUseSavedMemories === true');
    expect(code).toContain('selectRoute(candidates, bandwidth, sessionState, adaptiveContext)');
    expect(code).toContain('const selectedAdaptiveExplanation = adaptiveContext');
    expect(code).toContain('adaptiveExplanation: outcomeOverride ? null : selectedAdaptiveExplanation');
  });

  it('preserves atomic recommendation reservation rather than replacing the multilingual branch routing implementation', () => {
    const code = read('server.ts');
    expect(code).toContain('reserveRecommendationOffer(db, user.uid');
    expect(code).toContain("sourceSurface: 'recovery_hub'");
    expect(code).toContain("outcomeOverride = { routingOutcome: 'suppressed_by_budget'");
    expect(read('recovery-routing-engine.ts')).toContain('adaptInterventionCandidates(candidates, adaptiveContext)');
  });

  it('provides owner-only feedback correction and withdrawal without a second completion counter', () => {
    const code = read('server.ts');
    expect(code).toContain('app.get("/api/recovery/my-feedback"');
    expect(code).toContain('app.delete("/api/recovery/my-feedback/:id"');
    expect(code).toContain('app.post("/api/recovery/reset-adaptive-learning"');
    expect(code).toContain('data.feedbackWithdrawnAt');
    expect(code).toContain('tx.set(decisionRef, { helpfulness: validHelpfulness }, { merge: true })');
    expect(code).toContain("outcomeResult = 'feedback_withdrawn'");
  });

  it('writes optional consent to the one existing permissions document with bounded module ids', () => {
    const rules = read('firestore.rules');
    const start = rules.indexOf('match /nova_permissions/current');
    const permissions = rules.slice(start, rules.indexOf('\n      // J2.', start));
    expect(permissions).toContain('allowAdaptiveIntelligence');
    expect(permissions).toContain('adaptivePreferredModules');
    expect(permissions).toContain('adaptiveAvoidedModules');
    expect(permissions).toContain('request.resource.data.adaptivePreferredModules.size() <= 14');
    const privacy = read('src/components/DataPrivacyDashboard.tsx');
    expect(privacy).toContain('<NovaAdaptiveControls />');
    const controls = read('src/components/NovaAdaptiveControls.tsx');
    expect(controls).toContain('users');
    expect(controls).toContain('ownerUid');
    expect(controls).toContain('allowNovaMemory');
    expect(controls).toContain('allowNovaUseSavedMemories');
  });

  it('keeps personal adaptation distinct from other NHEI governance gates', () => {
    const rules = read('firestore.rules');
    expect(rules).toContain('allowNheiReflectionStorage');
    expect(rules).toContain('allowNheiLongitudinalTracking');
    expect(rules).toContain('allowNheiRoutingInsights');
    expect(rules).toContain('allowCalendarActions');
    expect(read('i18n/index.ts')).toContain('export function translate(');
    expect(read('src/components/SituationalOnboarding.tsx')).toContain('t("onboarding.learningConsent")');
  });
});
