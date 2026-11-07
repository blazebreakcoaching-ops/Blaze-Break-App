import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Source-level regression checks only. Real browser and API tests are still required. */
const admin = readFileSync('src/components/AdminDashboard.tsx', 'utf8');

describe('platform admin dashboard error handling', () => {
  it('distinguishes an unavailable company list from a genuinely empty list', () => {
    expect(admin).toContain('const [orgsLoadError, setOrgsLoadError] = useState(false)');
    expect(admin).toContain('setOrgsLoadError(true)');
    expect(admin).toContain('orgsLoadError ? (');
    expect(admin).toContain('This does not mean that no companies exist.');
  });
  it('preserves a successful organisation write when the follow-up list refresh fails', () => {
    expect(admin).toContain('A successful save must stay successful');
    expect(admin).toContain('setOrgsLoadError(true)');
    expect(admin).toContain('showSuccess(editingOrgId');
  });
  it('shows a retry instead of a blank statistics tab when summary is unavailable', () => {
    expect(admin).toContain("activeTab === 'somatic' && !metrics");
    expect(admin).toContain('Somatic statistics could not be loaded.');
    expect(admin).toContain('onClick={fetchSomaticMetrics}');
  });
  it('does not mistake a failed feedback request for an empty inbox', () => {
    expect(admin).toContain('const [feedbackLoadError, setFeedbackLoadError] = useState(false)');
    expect(admin).toContain('Feedback could not be loaded.');
    expect(admin).toContain('feedbackSubmissions.length === 0 && !feedbackLoadError');
  });
  it('reports reviewer permission denial using the thrown API error status', () => {
    expect(admin).toContain('setNheiError(e?.status === 403');
  });
});
