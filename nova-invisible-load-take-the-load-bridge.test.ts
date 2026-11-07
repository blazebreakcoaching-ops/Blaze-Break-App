import { describe, it, expect } from 'vitest';
import { buildTakeTheLoadProblemFromInvisibleLoadItem } from './nova-invisible-load-take-the-load-bridge';
import { initNovaInvisibleLoadContext, addInvisibleLoadItem, deferInvisibleLoadItem } from './nova-invisible-load-contract';

describe('buildTakeTheLoadProblemFromInvisibleLoadItem', () => {
  it('builds a problem carrying the item\'s own description verbatim', () => {
    const context = addInvisibleLoadItem(initNovaInvisibleLoadContext(), 'Covering a teammate\'s on-call rotation', 'obligation', true);
    const result = buildTakeTheLoadProblemFromInvisibleLoadItem(context.items[0], 'some_bandwidth');
    expect(result).toEqual({ ok: true, problem: { description: 'Covering a teammate\'s on-call rotation', capacityBand: 'some_bandwidth' } });
  });

  it('refuses a deferred item - "not now" is honoured, not silently acted on', () => {
    let context = addInvisibleLoadItem(initNovaInvisibleLoadContext(), 'A', 'commitment', true);
    context = deferInvisibleLoadItem(context, context.items[0].id);
    const result = buildTakeTheLoadProblemFromInvisibleLoadItem(context.items[0], null);
    expect(result).toEqual({ ok: false, reason: 'item_deferred' });
  });

  it('passes through a null capacity band as unknown, never defaulted', () => {
    const context = addInvisibleLoadItem(initNovaInvisibleLoadContext(), 'A', 'practical_friction', false);
    const result = buildTakeTheLoadProblemFromInvisibleLoadItem(context.items[0], null);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.problem.capacityBand).toBeNull();
  });

  it('has no "build for every item" helper - only a single-item function is exported', async () => {
    const mod = await import('./nova-invisible-load-take-the-load-bridge');
    expect(Object.keys(mod)).toEqual(['buildTakeTheLoadProblemFromInvisibleLoadItem']);
  });
});
