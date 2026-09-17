// Pure logic for the Rumination Furnace's Nova-memory write, kept I/O-free
// and unit-tested - same pattern as the other logic modules in this
// codebase (weekly-goal-tracker.ts, gad7.ts).
//
// The tool's entire promise to the user is that what they type gets burned,
// not kept. Only the fact that they used the ritual - and how often - is
// worth Nova knowing; the content itself never should be. Structuring the
// count/content builders as pure functions that take a count (never the raw
// text) makes that guarantee checkable by a test rather than just a
// comment at the call site.

const USE_COUNT_PATTERN = /use #(\d+)/;

export function nextRuminationUseCount(existingMemoryContent: string | undefined): number {
  if (!existingMemoryContent) return 1;
  const match = existingMemoryContent.match(USE_COUNT_PATTERN);
  const current = match ? parseInt(match[1], 10) : 0;
  return current + 1;
}

export function buildRuminationMemoryContent(count: number): string {
  return `Used the rumination-release ritual (use #${count}).`;
}
