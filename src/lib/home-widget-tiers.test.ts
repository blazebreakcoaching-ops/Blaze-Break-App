import { describe, it, expect } from 'vitest';
import { isBrandNewUser, buildNewUserLayout, applyUnlock } from './home-widget-tiers';

describe('isBrandNewUser', () => {
  it('is true only when both points and streak are exactly 0', () => {
    expect(isBrandNewUser(0, 0)).toBe(true);
  });

  it('is false once points have been earned', () => {
    expect(isBrandNewUser(100, 0)).toBe(false);
  });

  it('is false once a streak exists, even with 0 points', () => {
    expect(isBrandNewUser(0, 1)).toBe(false);
  });
});

describe('buildNewUserLayout', () => {
  const allWidgets = ['hero', 'gamification', 'hub', 'directive', 'trends', 'stats'];

  it('shows only the new-user widgets and hides everything else', () => {
    const layout = buildNewUserLayout(allWidgets, ['directive'], []);
    expect(layout.left).toEqual(['directive']);
    expect(layout.right).toEqual([]);
    expect(layout.hidden).toEqual(['hero', 'gamification', 'hub', 'trends', 'stats']);
  });

  it('never duplicates a widget between visible and hidden', () => {
    const layout = buildNewUserLayout(allWidgets, ['directive'], []);
    const allPlaced = [...layout.left, ...layout.right, ...layout.hidden];
    expect(new Set(allPlaced).size).toBe(allWidgets.length);
  });
});

describe('applyUnlock', () => {
  it('moves every not-yet-visible widget from hidden into left', () => {
    const current = { left: ['directive'], right: [], hidden: ['hero', 'gamification', 'hub', 'trends'] };
    const result = applyUnlock(current, ['hero', 'gamification', 'hub', 'trends', 'directive']);
    expect(result.left).toEqual(['directive', 'hero', 'gamification', 'hub', 'trends']);
    expect(result.hidden).toEqual([]);
  });

  it('does not duplicate or move a widget the person already added themselves', () => {
    // The person manually added "hub" via "Add widget" before ever earning
    // points - it's already in left, not hidden.
    const current = { left: ['directive', 'hub'], right: [], hidden: ['hero', 'gamification', 'trends'] };
    const result = applyUnlock(current, ['hero', 'gamification', 'hub', 'trends', 'directive']);
    expect(result.left).toEqual(['directive', 'hub', 'hero', 'gamification', 'trends']);
    // hub appears exactly once
    expect(result.left.filter((id) => id === 'hub')).toHaveLength(1);
  });

  it('leaves widgets not in toUnlock untouched in hidden', () => {
    const current = { left: ['directive'], right: [], hidden: ['hero', 'stats'] };
    const result = applyUnlock(current, ['hero']);
    expect(result.hidden).toEqual(['stats']);
    expect(result.left).toEqual(['directive', 'hero']);
  });

  it('is a no-op when everything in toUnlock is already visible', () => {
    const current = { left: ['hero', 'gamification', 'hub'], right: ['directive', 'trends'], hidden: ['stats'] };
    const result = applyUnlock(current, ['hero', 'gamification', 'hub', 'directive', 'trends']);
    expect(result.left).toEqual(['hero', 'gamification', 'hub']);
    expect(result.hidden).toEqual(['stats']);
  });
});
