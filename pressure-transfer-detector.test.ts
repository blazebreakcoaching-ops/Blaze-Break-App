import { describe, it, expect } from 'vitest';
import { detectPressureTransfer, type MeetingLoadMetrics } from './pressure-transfer-detector';

const baseline: MeetingLoadMetrics = {
  avgMeetingHoursPerWeek: 20,
  avgBackToBackMeetingsPerWeek: 3,
  pctWithEveningMeetings: 10,
  pctWithWeekendMeetings: 5,
};

describe('detectPressureTransfer', () => {
  it('returns null when meeting hours did not meaningfully improve', () => {
    const after: MeetingLoadMetrics = { ...baseline, avgMeetingHoursPerWeek: 19.5 };
    expect(detectPressureTransfer(baseline, after)).toBeNull();
  });

  it('returns null when meeting hours improved and nothing else worsened - a genuine improvement', () => {
    const after: MeetingLoadMetrics = { ...baseline, avgMeetingHoursPerWeek: 14 };
    expect(detectPressureTransfer(baseline, after)).toBeNull();
  });

  it('flags evening meetings when hours drop but evening share rises meaningfully', () => {
    const after: MeetingLoadMetrics = { ...baseline, avgMeetingHoursPerWeek: 14, pctWithEveningMeetings: 25 };
    const finding = detectPressureTransfer(baseline, after);
    expect(finding?.movedTo).toBe('evening_meetings');
    expect(finding?.message).toContain('20h to 14h');
    expect(finding?.message).toContain('10% to 25%');
    expect(finding?.message.toLowerCase()).not.toContain('caused');
    expect(finding?.message.toLowerCase()).not.toContain('resulted in');
  });

  it('flags weekend meetings when hours drop but weekend share rises meaningfully', () => {
    const after: MeetingLoadMetrics = { ...baseline, avgMeetingHoursPerWeek: 14, pctWithWeekendMeetings: 20 };
    const finding = detectPressureTransfer(baseline, after);
    expect(finding?.movedTo).toBe('weekend_meetings');
  });

  it('flags back-to-back meetings when hours drop but back-to-back count rises meaningfully', () => {
    const after: MeetingLoadMetrics = { ...baseline, avgMeetingHoursPerWeek: 14, avgBackToBackMeetingsPerWeek: 5 };
    const finding = detectPressureTransfer(baseline, after);
    expect(finding?.movedTo).toBe('back_to_back_meetings');
  });

  it('does not flag a small, noise-level evening increase', () => {
    const after: MeetingLoadMetrics = { ...baseline, avgMeetingHoursPerWeek: 14, pctWithEveningMeetings: 15 };
    expect(detectPressureTransfer(baseline, after)).toBeNull();
  });

  it('prioritises evening over weekend and back-to-back when multiple shift at once', () => {
    const after: MeetingLoadMetrics = { avgMeetingHoursPerWeek: 14, avgBackToBackMeetingsPerWeek: 5, pctWithEveningMeetings: 25, pctWithWeekendMeetings: 20 };
    const finding = detectPressureTransfer(baseline, after);
    expect(finding?.movedTo).toBe('evening_meetings');
  });
});
