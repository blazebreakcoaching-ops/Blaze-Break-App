import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => args.slice(1).join('/'),
  doc: (...args: unknown[]) => args.slice(1).join('/'),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  query: (...args: unknown[]) => args[0],
  orderBy: vi.fn(),
  limit: vi.fn(),
}));
vi.mock('./firestore', () => ({ db: {} }));

import { getDoc, getDocs, setDoc } from 'firebase/firestore';
import { loadSleepTargetHours, setSleepTargetHours, logSleepHours, loadRecentSleepNights } from './recovery-debt-service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadSleepTargetHours', () => {
  it('falls back to the honest default of 8 hours when nothing is saved', async () => {
    (getDoc as any).mockResolvedValue({ exists: () => false });
    expect(await loadSleepTargetHours('u1')).toBe(8);
  });

  it('falls back to the default rather than throwing when Firestore is unreachable', async () => {
    (getDoc as any).mockRejectedValue(new Error('unavailable'));
    expect(await loadSleepTargetHours('u2')).toBe(8);
  });

  it('returns the saved target when one exists', async () => {
    (getDoc as any).mockResolvedValue({ exists: () => true, data: () => ({ sleepTargetHours: 7 }) });
    expect(await loadSleepTargetHours('u3')).toBe(7);
  });
});

describe('setSleepTargetHours', () => {
  it('writes the target with a timestamp', async () => {
    (setDoc as any).mockResolvedValue(undefined);
    await setSleepTargetHours('u4', 7.5);
    const call = (setDoc as any).mock.calls[0];
    expect(call[1].sleepTargetHours).toBe(7.5);
    expect(call[1].updatedAt).toBeTruthy();
  });
});

describe('logSleepHours', () => {
  it('writes hours and merges by date', async () => {
    (setDoc as any).mockResolvedValue(undefined);
    await logSleepHours('u5', 6.5);
    const call = (setDoc as any).mock.calls[0];
    expect(call[1].hours).toBe(6.5);
    expect(call[2]).toEqual({ merge: true });
  });
});

describe('loadRecentSleepNights', () => {
  it('returns an empty array rather than throwing when Firestore is unreachable', async () => {
    (getDocs as any).mockRejectedValue(new Error('unavailable'));
    expect(await loadRecentSleepNights('u6')).toEqual([]);
  });

  it('reverses the desc-ordered query results to oldest-first', async () => {
    (getDocs as any).mockResolvedValue({
      docs: [
        { data: () => ({ date: '2026-01-03', hours: 7 }) },
        { data: () => ({ date: '2026-01-02', hours: 6 }) },
        { data: () => ({ date: '2026-01-01', hours: 8 }) },
      ],
    });
    const result = await loadRecentSleepNights('u7');
    expect(result.map((n) => n.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
  });
});
