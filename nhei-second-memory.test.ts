import { describe, it, expect } from 'vitest';
import { validateOpenLoop, mayUseSecondMemory, normalizeOpenLoop, MAX_OPEN_LOOP_LENGTH } from './nhei-second-memory';
describe('Second Memory privacy and input handling', () => {
  it('requires both memory permissions', () => {
    expect(mayUseSecondMemory(undefined)).toBe(false);
    expect(mayUseSecondMemory({ allowNovaMemory: true })).toBe(false);
    expect(mayUseSecondMemory({ allowNovaMemory: true, allowNovaUseSavedMemories: true })).toBe(true);
  });
  it('rejects empty and oversized notes', () => {
    expect(validateOpenLoop('  ')).toBeNull();
    expect(validateOpenLoop('x'.repeat(MAX_OPEN_LOOP_LENGTH + 1))).toBeNull();
    expect(validateOpenLoop('  Send the report  ')).toBe('Send the report');
  });
  it('normalizes status conservatively', () => {
    expect(normalizeOpenLoop({ id: 'a', text: 'Call manager', status: 'unknown' })?.status).toBe('open');
    expect(normalizeOpenLoop({ id: 'b', text: 'Done', status: 'done' })?.status).toBe('done');
    expect(normalizeOpenLoop({ id: 'c', text: null })).toBeNull();
  });
});
