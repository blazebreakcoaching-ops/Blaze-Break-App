import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Security Operations Batch 3 - regression guardrail, same spirit as
// ai-model-registry.test.ts's scanner: once a real gap is closed, nothing
// should be able to silently reintroduce it. 65 unconditional
// `res.status(500).json({ error: err.message })` sites - the generic
// "we never anticipated this error" fallback - were migrated to a shared
// GENERIC_SERVER_ERROR constant (never leaking the real error, which is
// always still captured via logger.error right above it). Exactly 2 sites
// are a deliberate, reviewed exception - see the comment inline above each
// in server.ts - because assertNotLastPlatformOwner throws a message
// specifically authored to be shown to the admin attempting the change,
// not an unanticipated failure.
//
// A scanner limitation worth being explicit about (same honesty this
// codebase's other scanner-based guardrails already practice): this only
// catches the exact literal source text `res.status(500).json({ error:
// err.message })`. A route that assigns err.message to a local variable
// first, or spreads it into a larger object, would not be caught here -
// but every site this batch touched used the literal form directly, and a
// future route doing something cleverer to route around this guardrail
// would be a deliberate act, not an accident this test is meant to catch.

const REVIEWED_EXCEPTION_COUNT = 2;

describe('error message leak guardrail', () => {
  it('keeps the unconditional 500-fallback err.message leak at exactly the reviewed exception count', () => {
    const serverSource = fs.readFileSync(path.join(__dirname, 'server.ts'), 'utf8');
    const matches = serverSource.match(/res\.status\(500\)\.json\(\{ error: err\.message \}\)/g) || [];
    expect(matches).toHaveLength(REVIEWED_EXCEPTION_COUNT);
    // Both exceptions must stay commented as deliberate, not just numerically
    // coincidental - if this ever drifts, the comment search below catches it.
    expect(serverSource).toContain('assertNotLastPlatformOwner\'s own deliberately admin-facing message');
  });

  it('the scanner itself actually detects the leak pattern (sanity check against a synthetic string, not server.ts)', () => {
    const synthetic = 'app.get("/x", async (req, res) => {\n  try {} catch (err: any) {\n    res.status(500).json({ error: err.message });\n  }\n});';
    const matches = synthetic.match(/res\.status\(500\)\.json\(\{ error: err\.message \}\)/g) || [];
    expect(matches.length).toBeGreaterThan(0);
  });
});
