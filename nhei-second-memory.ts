// NHEI Second Memory: small, explicit user-owned open loops.
// This is a note-taking aid, not autonomous task execution or diagnosis.
export const MAX_OPEN_LOOP_LENGTH = 240;
export const MAX_OPEN_LOOPS = 20;
export function validateOpenLoop(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > MAX_OPEN_LOOP_LENGTH) return null;
  return text;
}
export function mayUseSecondMemory(permissions: Record<string, unknown> | null | undefined): boolean {
  return permissions?.allowNovaMemory === true && permissions?.allowNovaUseSavedMemories === true;
}
export function normalizeOpenLoop(input: { id: string; text?: unknown; status?: unknown; updatedAt?: unknown }) {
  const text = validateOpenLoop(input.text);
  if (!text) return null;
  return {
    id: input.id,
    text,
    status: input.status === 'done' ? 'done' as const : 'open' as const,
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : '',
  };
}
