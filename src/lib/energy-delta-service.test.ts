import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => args.slice(1).join('/'),
  doc: (...args: unknown[]) => args.slice(1).join('/'),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: (...args: unknown[]) => args[0],
  orderBy: vi.fn(),
  limit: vi.fn(),
}));
vi.mock('./firestore', () => ({ db: {} }));

import { getDocs, setDoc, addDoc, updateDoc } from 'firebase/firestore';
import {
  recordCapacityCheckIn, loadRecentCapacityCheckIns, loadLatestCapacityCheckIn,
  loadStressors, addStressor, reportStressorReduction, classifyStressor, resolveStressor,
  recordDailySnapshot, loadRecentDailySnapshots,
} from './energy-delta-service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('recordCapacityCheckIn', () => {
  it('computes and persists the score alongside the raw answers', async () => {
    (addDoc as any).mockResolvedValue({ id: 'c1' });
    const result = await recordCapacityCheckIn('u1', { physical: 'okay', mental: 'good', emotional: 'okay' });
    expect(result.score).toBe(58);
    const call = (addDoc as any).mock.calls[0];
    expect(call[1].score).toBe(58);
    expect(call[1].physical).toBe('okay');
  });
});

describe('loadLatestCapacityCheckIn', () => {
  it('returns null for a user who has never checked in - never a synthesised 0', async () => {
    (getDocs as any).mockResolvedValue({ docs: [] });
    expect(await loadLatestCapacityCheckIn('u2')).toBeNull();
  });

  it('returns null rather than throwing when Firestore is unreachable', async () => {
    (getDocs as any).mockRejectedValue(new Error('unavailable'));
    expect(await loadLatestCapacityCheckIn('u3')).toBeNull();
    expect(await loadRecentCapacityCheckIns('u3')).toEqual([]);
  });

  it('returns the most recent check-in (first in the desc-ordered query)', async () => {
    (getDocs as any).mockResolvedValue({
      docs: [{ id: 'c2', data: () => ({ physical: 'good', mental: 'good', emotional: 'good', score: 75, createdAt: '2026-01-02T00:00:00.000Z' }) }],
    });
    const latest = await loadLatestCapacityCheckIn('u4');
    expect(latest?.score).toBe(75);
  });
});

describe('stressors', () => {
  it('addStressor writes active status and both timestamps', async () => {
    (addDoc as any).mockResolvedValue({ id: 's1' });
    await addStressor('u5', { name: 'Client deadline', category: 'professional', severity: 4, persistence: 'ongoing' });
    const call = (addDoc as any).mock.calls[0];
    expect(call[1].status).toBe('active');
    expect(call[1].createdAt).toBeTruthy();
    expect(call[1].updatedAt).toBeTruthy();
  });

  it('loadStressors returns an empty list rather than throwing when Firestore is unreachable', async () => {
    (getDocs as any).mockRejectedValue(new Error('unavailable'));
    expect(await loadStressors('u6')).toEqual([]);
  });

  it('reportStressorReduction only updates reduction + updatedAt', async () => {
    (updateDoc as any).mockResolvedValue(undefined);
    await reportStressorReduction('u7', 's1', 'meaningfully');
    const call = (updateDoc as any).mock.calls[0];
    expect(call[1].reduction).toBe('meaningfully');
    expect(Object.keys(call[1]).sort()).toEqual(['reduction', 'updatedAt']);
  });

  it('classifyStressor only updates action + updatedAt', async () => {
    (updateDoc as any).mockResolvedValue(undefined);
    await classifyStressor('u8', 's1', 'delegate');
    const call = (updateDoc as any).mock.calls[0];
    expect(call[1].action).toBe('delegate');
  });

  it('resolveStressor sets status to resolved', async () => {
    (updateDoc as any).mockResolvedValue(undefined);
    await resolveStressor('u9', 's1');
    const call = (updateDoc as any).mock.calls[0];
    expect(call[1].status).toBe('resolved');
  });
});

describe('recordDailySnapshot', () => {
  it('computes grossLoad/netLoad/capacityProtected/energyDelta from the given capacity and stressors', async () => {
    (setDoc as any).mockResolvedValue(undefined);
    await recordDailySnapshot('u10', 58, [{ severity: 4, persistence: 'repeated', status: 'active' }]);
    const call = (setDoc as any).mock.calls[0];
    expect(call[1].capacity).toBe(58);
    expect(call[1].grossLoad).toBeCloseTo(40);
    expect(call[1].netLoad).toBeCloseTo(40);
    expect(call[1].energyDelta).toBeCloseTo(18);
  });

  it('writes a null energyDelta when capacity is unknown, never a fabricated number', async () => {
    (setDoc as any).mockResolvedValue(undefined);
    await recordDailySnapshot('u11', null, []);
    const call = (setDoc as any).mock.calls[0];
    expect(call[1].capacity).toBeNull();
    expect(call[1].energyDelta).toBeNull();
    expect(call[1].grossLoad).toBe(0);
  });

  it('is called with merge:true so it upserts rather than overwriting the whole day', async () => {
    (setDoc as any).mockResolvedValue(undefined);
    await recordDailySnapshot('u12', 50, []);
    const call = (setDoc as any).mock.calls[0];
    expect(call[2]).toEqual({ merge: true });
  });
});

describe('loadRecentDailySnapshots', () => {
  it('returns an empty array rather than throwing when Firestore is unreachable', async () => {
    (getDocs as any).mockRejectedValue(new Error('unavailable'));
    expect(await loadRecentDailySnapshots('u13')).toEqual([]);
  });

  it('reverses the desc-ordered query results to oldest-first', async () => {
    (getDocs as any).mockResolvedValue({
      docs: [
        { data: () => ({ date: '2026-01-03', grossLoad: 0, netLoad: 0, capacityProtected: 0, capacity: null, energyDelta: null, updatedAt: 'x' }) },
        { data: () => ({ date: '2026-01-02', grossLoad: 0, netLoad: 0, capacityProtected: 0, capacity: null, energyDelta: null, updatedAt: 'x' }) },
        { data: () => ({ date: '2026-01-01', grossLoad: 0, netLoad: 0, capacityProtected: 0, capacity: null, energyDelta: null, updatedAt: 'x' }) },
      ],
    });
    const result = await loadRecentDailySnapshots('u14');
    expect(result.map((r) => r.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
  });
});
