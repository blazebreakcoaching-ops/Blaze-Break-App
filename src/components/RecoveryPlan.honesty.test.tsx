import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/firebase', () => ({ auth: { currentUser: null } }));
vi.mock('../lib/firestore', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(async () => ({ exists: () => false })), setDoc: vi.fn(async () => {}) }));
vi.mock('../lib/nova-brain', () => ({ updateNovaMemoryBySourceAndType: vi.fn(), logJourney: vi.fn() }));

import { RecoveryPlan } from './RecoveryPlan';
import type { BurnoutFingerprint, UserStats } from '../types';

const placeholderDebts = [
  { id: '0', label: 'Sleep Shortfall', value: 0, unit: 'h', max: 8, color: '', impact: '', novaNote: 'Not enough sleep data yet.' },
  { id: '1', label: 'Mental Fatigue', value: 0, unit: '', max: 20, color: '', impact: '', novaNote: 'Not checked in yet.' },
];
const stats = (debts: any[]): UserStats => ({
  points: 0, streak: 0, rehearsalCount: 0, lastEngagementDate: '', unlockedBadges: [], supportCircle: [], committedActionIds: [], debts,
} as any);
const fingerprint = { profile: 'Founder on Fire' } as BurnoutFingerprint;
const props = { onAwardPoints: vi.fn(), onNavigateTab: vi.fn(), onRehearsalComplete: vi.fn() } as any;

describe('Recovery Plan never presents placeholder debts as real data', () => {
  it('with nothing logged, it says so and quotes no debt or percentage', () => {
    render(<RecoveryPlan {...props} stats={stats(placeholderDebts)} fingerprint={fingerprint} />);
    expect(screen.getByText('No recovery debt logged yet')).toBeTruthy();
    expect(screen.getByText('Nothing logged yet.')).toBeTruthy();
    expect(screen.queryByText(/Highest Debt:/)).toBeNull();
    const read = screen.getByText(/identity is completely fused/);
    expect(read.textContent).not.toMatch(/Sleep Shortfall|\d+%/);
    expect(read.textContent).toMatch(/Log your sleep, capacity or commitments/);
  });

  it('with a real logged reading, it names it with its real value', () => {
    render(<RecoveryPlan {...props} stats={stats([{ ...placeholderDebts[0], value: 3 }, placeholderDebts[1]])} fingerprint={fingerprint} />);
    expect(screen.getByText('Highest Debt: Sleep Shortfall (3h)')).toBeTruthy();
    expect(screen.getByText(/Sleep Shortfall is at 38%/)).toBeTruthy();
  });
});
