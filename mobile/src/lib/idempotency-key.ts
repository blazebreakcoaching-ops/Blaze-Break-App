// A short, unique-enough token for the server's idempotencyKey fields
// (Calendar Protection propose, Task Deferral identify) - those routes
// only require a non-empty string up to 200 chars, never a strict UUID
// format, so no new dependency is needed for this.
export function newIdempotencyKey(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}
