import { describe, it, expect } from 'vitest';
import {
  initNovaInvisibleLoadContext, addInvisibleLoadItem, correctInvisibleLoadItem,
  removeInvisibleLoadItem, optOutOfInvisibleLoad, deferInvisibleLoadItem, undeferInvisibleLoadItem,
  addBreakdownStep, removeBreakdownStep,
} from './nova-invisible-load-contract';

describe('nova-invisible-load-contract', () => {
  it('starts empty and not opted out', () => {
    const context = initNovaInvisibleLoadContext();
    expect(context.items).toEqual([]);
    expect(context.optedOut).toBe(false);
  });

  it('adds an item carrying the user\'s own description verbatim, never rewritten', () => {
    const context = addInvisibleLoadItem(initNovaInvisibleLoadContext(), 'Picking up my sister\'s kids every Tuesday', 'commitment', true);
    expect(context.items).toHaveLength(1);
    expect(context.items[0].description).toBe('Picking up my sister\'s kids every Tuesday');
    expect(context.items[0].source).toBe('user_reported');
  });

  it('preserves userCertain:false rather than resolving the uncertainty away', () => {
    const context = addInvisibleLoadItem(initNovaInvisibleLoadContext(), 'Maybe I\'m supposed to help with this too?', 'obligation', false);
    expect(context.items[0].userCertain).toBe(false);
  });

  it('corrections are additive, never overwriting the original item', () => {
    let context = addInvisibleLoadItem(initNovaInvisibleLoadContext(), 'Covering a coworker\'s shift', 'practical_friction', true);
    const id = context.items[0].id;
    context = correctInvisibleLoadItem(context, id, 'Actually it was two shifts, not one');
    expect(context.items[0].description).toBe('Covering a coworker\'s shift');
    expect(context.items[0].corrections).toEqual(['Actually it was two shifts, not one']);
  });

  it('removal drops only the targeted item', () => {
    let context = addInvisibleLoadItem(initNovaInvisibleLoadContext(), 'A', 'commitment', true);
    context = addInvisibleLoadItem(context, 'B', 'obligation', true);
    const idToRemove = context.items[0].id;
    context = removeInvisibleLoadItem(context, idToRemove);
    expect(context.items).toHaveLength(1);
    expect(context.items[0].description).toBe('B');
  });

  it('opting out clears existing items and blocks further additions', () => {
    let context = addInvisibleLoadItem(initNovaInvisibleLoadContext(), 'A', 'commitment', true);
    context = optOutOfInvisibleLoad(context);
    expect(context.items).toEqual([]);
    expect(context.optedOut).toBe(true);
    context = addInvisibleLoadItem(context, 'B', 'obligation', true);
    expect(context.items).toEqual([]); // still blocked after opting out
  });

  it('an item has only the expected keys - no hidden numeric score/rating field', () => {
    const context = addInvisibleLoadItem(initNovaInvisibleLoadContext(), 'A', 'commitment', true);
    expect(Object.keys(context.items[0]).sort()).toEqual(['breakdownSteps', 'category', 'corrections', 'deferred', 'description', 'id', 'source', 'userCertain']);
  });

  it('breakdown steps are the user\'s own words, additive, never generated', () => {
    let context = addInvisibleLoadItem(initNovaInvisibleLoadContext(), 'Finish the quarterly report', 'obligation', true);
    const id = context.items[0].id;
    context = addBreakdownStep(context, id, 'Pull last quarter\'s numbers');
    context = addBreakdownStep(context, id, 'Draft the summary section');
    expect(context.items[0].breakdownSteps).toEqual(['Pull last quarter\'s numbers', 'Draft the summary section']);
  });

  it('a single breakdown step can be removed without disturbing the others', () => {
    let context = addInvisibleLoadItem(initNovaInvisibleLoadContext(), 'A', 'obligation', true);
    const id = context.items[0].id;
    context = addBreakdownStep(context, id, 'Step one');
    context = addBreakdownStep(context, id, 'Step two');
    context = removeBreakdownStep(context, id, 0);
    expect(context.items[0].breakdownSteps).toEqual(['Step two']);
  });

  it('deferring an item keeps it in the list, distinct from removing it', () => {
    let context = addInvisibleLoadItem(initNovaInvisibleLoadContext(), 'Covering a shift', 'practical_friction', true);
    const id = context.items[0].id;
    context = deferInvisibleLoadItem(context, id);
    expect(context.items).toHaveLength(1);
    expect(context.items[0].deferred).toBe(true);
  });

  it('undeferring reverses a defer - an explicit, equal action', () => {
    let context = addInvisibleLoadItem(initNovaInvisibleLoadContext(), 'A', 'obligation', true);
    const id = context.items[0].id;
    context = deferInvisibleLoadItem(context, id);
    context = undeferInvisibleLoadItem(context, id);
    expect(context.items[0].deferred).toBe(false);
  });

  it('has zero import statements - no persistence, no model call', async () => {
    const fs = await import('node:fs');
    const content = fs.readFileSync(new URL('./nova-invisible-load-contract.ts', import.meta.url), 'utf8');
    expect(content).not.toMatch(/^\s*import\s/m);
  });
});
