import { describe, it, expect } from 'vitest';
import { resolveInvisibleLoadHelpChoice } from './nova-invisible-load-help-contract';
import { addInvisibleLoadItem, deferInvisibleLoadItem, initNovaInvisibleLoadContext } from './nova-invisible-load-contract';

function item(category: 'commitment' | 'obligation' | 'practical_friction' = 'obligation', deferred = false) {
  let context = addInvisibleLoadItem(initNovaInvisibleLoadContext(), 'Finish the quarterly report', category, true);
  if (deferred) context = deferInvisibleLoadItem(context, context.items[0].id);
  return context.items[0];
}

describe('resolveInvisibleLoadHelpChoice', () => {
  it('protect_time produces a NovaStatedPracticalProblem carrying the item\'s own words', () => {
    const outcome = resolveInvisibleLoadHelpChoice(item(), 'protect_time', 'some_bandwidth');
    expect(outcome).toEqual({ kind: 'protect_time', problem: { description: 'Finish the quarterly report', capacityBand: 'some_bandwidth' } });
  });

  it('defer_or_reprioritise produces a plain task description', () => {
    const outcome = resolveInvisibleLoadHelpChoice(item(), 'defer_or_reprioritise', null);
    expect(outcome).toEqual({ kind: 'defer_or_reprioritise', taskDescription: 'Finish the quarterly report' });
  });

  it('break_into_steps is a local UI action, no fields attached', () => {
    expect(resolveInvisibleLoadHelpChoice(item(), 'break_into_steps', null)).toEqual({ kind: 'break_into_steps' });
  });

  it('explore_recovery_tool names a real existing tool per category, never a score', () => {
    const outcome = resolveInvisibleLoadHelpChoice(item('commitment'), 'explore_recovery_tool', null);
    expect(outcome).toEqual({ kind: 'explore_recovery_tool', suggestedTool: 'Boundary Architect', reason: expect.any(String) });
  });

  it('leave_unchanged is always available, even for a deferred item', () => {
    expect(resolveInvisibleLoadHelpChoice(item('obligation', true), 'leave_unchanged', null)).toEqual({ kind: 'leave_unchanged' });
  });

  it('every other choice is refused for a deferred item - "not now" means not now', () => {
    const deferredItem = item('obligation', true);
    expect(resolveInvisibleLoadHelpChoice(deferredItem, 'protect_time', null)).toEqual({ kind: 'refused', reason: 'item_deferred' });
    expect(resolveInvisibleLoadHelpChoice(deferredItem, 'defer_or_reprioritise', null)).toEqual({ kind: 'refused', reason: 'item_deferred' });
    expect(resolveInvisibleLoadHelpChoice(deferredItem, 'break_into_steps', null)).toEqual({ kind: 'refused', reason: 'item_deferred' });
    expect(resolveInvisibleLoadHelpChoice(deferredItem, 'explore_recovery_tool', null)).toEqual({ kind: 'refused', reason: 'item_deferred' });
  });

  it.each((['commitment', 'obligation', 'practical_friction'] as const))('every category (%s) has a distinct, real suggested tool', (category) => {
    const outcome = resolveInvisibleLoadHelpChoice(item(category), 'explore_recovery_tool', null);
    expect(outcome.kind).toBe('explore_recovery_tool');
  });
});
