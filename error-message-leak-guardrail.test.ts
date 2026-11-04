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
// Those 2 sites were later tightened further (still Batch 3's own intent,
// just a stricter implementation of it): rather than unconditionally
// trusting ANY Error thrown inside that route's try block to be the safe,
// admin-facing one, each now gates on the exact expected message text
// (`safeLastOwnerError = err.message === "Operation Rejected: ..."`) before
// echoing it, falling back to GENERIC_SERVER_ERROR otherwise. This is
// strictly safer than the plain literal this guardrail originally looked
// for - an unrelated Firestore/Admin SDK exception bubbling up from the
// same try block can no longer leak its own message just by also being an
// Error instance. The pattern below matches that current, tighter shape.
//
// A scanner limitation worth being explicit about (same honesty this
// codebase's other scanner-based guardrails already practice): this only
// catches the exact literal source text this batch's sites use. A route
// that assigns err.message to a local variable first, or spreads it into
// a larger object, would not be caught here - but every site this batch
// touched used the literal form directly, and a future route doing
// something cleverer to route around this guardrail would be a
// deliberate act, not an accident this test is meant to catch.

const REVIEWED_EXCEPTION_COUNT = 2;

describe('error message leak guardrail', () => {
  it('keeps the guarded 500-fallback err.message leak at exactly the reviewed exception count', () => {
    const serverSource = fs.readFileSync(path.join(__dirname, 'server.ts'), 'utf8');
    const matches = serverSource.match(/res\.status\(500\)\.json\(\{ error: safeLastOwnerError \? err\.message : GENERIC_SERVER_ERROR \}\)/g) || [];
    expect(matches).toHaveLength(REVIEWED_EXCEPTION_COUNT);
    // The exact string assertNotLastPlatformOwner throws, and the exact
    // string both guards check for, must be the SAME string - not just
    // numerically coincidental counts. If either drifts independently
    // (the throw site reworded without updating the guards, or vice
    // versa), the guard silently stops recognising the real message and
    // every admin-role-change failure falls back to GENERIC_SERVER_ERROR
    // - not a security leak, but a real admin-facing regression this
    // assertion also catches.
    const safeMessage = 'Operation Rejected: Cannot remove or downgrade the last Platform Owner.';
    expect(serverSource).toContain(`throw new Error("${safeMessage}")`);
    const guardMatches = serverSource.match(
      new RegExp(`err\\.message === "${safeMessage.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}"`, 'g'),
    ) || [];
    expect(guardMatches).toHaveLength(REVIEWED_EXCEPTION_COUNT);
  });

  it('the scanner itself actually detects the leak pattern (sanity check against a synthetic string, not server.ts)', () => {
    const synthetic = 'app.get("/x", async (req, res) => {\n  try {} catch (err: any) {\n    const safeLastOwnerError = err.message === "x";\n    res.status(500).json({ error: safeLastOwnerError ? err.message : GENERIC_SERVER_ERROR });\n  }\n});';
    const matches = synthetic.match(/res\.status\(500\)\.json\(\{ error: safeLastOwnerError \? err\.message : GENERIC_SERVER_ERROR \}\)/g) || [];
    expect(matches.length).toBeGreaterThan(0);
  });

  it('keeps the conditional-ternary 500-fallback err.message leak at zero (Security Operations Batch 4)', () => {
    // The ~100+ sites of the shape
    // res.status(err.message?.includes("Forbidden") ? 403 : 500).json({ error: err.message })
    // were restructured into if/else chains: recognized branches (Forbidden/
    // not found/frozen/Rejected/Unauthorized) still echo err.message (same
    // deliberate-safe-message reasoning as the admin-users exceptions above),
    // but the implicit 500 fallback - the one branch that was never
    // authored to be user-facing - now uses GENERIC_SERVER_ERROR like every
    // other unanticipated-failure site. This pins that at exactly zero.
    const serverSource = fs.readFileSync(path.join(__dirname, 'server.ts'), 'utf8');
    const matches = serverSource.match(/res\.status\(err\.message\?\.includes\([^)]*\)[^;]*: 500\)\.json\(\{ error: err\.message \}\)/g) || [];
    expect(matches).toHaveLength(0);
  });

  it('the ternary scanner itself actually detects the old leak shape (sanity check against a synthetic string)', () => {
    const synthetic = 'res.status(err.message?.includes("Forbidden") ? 403 : 500).json({ error: err.message });';
    const matches = synthetic.match(/res\.status\(err\.message\?\.includes\([^)]*\)[^;]*: 500\)\.json\(\{ error: err\.message \}\)/g) || [];
    expect(matches.length).toBeGreaterThan(0);
  });

  it('keeps the same leak at zero under the "error" catch-variable spelling too (Security Operations Batch 5)', () => {
    // Batches 3-4's sweeps both searched specifically for the literal text
    // `err.message` - which missed 14 sites that spelled the catch
    // variable `error` instead of `err` (`catch (error: any) { ...
    // res.status(500).json({ error: error.message }); }`), the exact same
    // leak under a different identifier. All 14 are now
    // GENERIC_SERVER_ERROR too. This guards the naming variant separately
    // so a future route reintroducing it under either spelling gets caught.
    const serverSource = fs.readFileSync(path.join(__dirname, 'server.ts'), 'utf8');
    const matches = serverSource.match(/res\.status\(500\)\.json\(\{ error: error\.message[ ,}]/g) || [];
    expect(matches).toHaveLength(0);
  });

  it('the "error"-spelling scanner itself actually detects the leak pattern (sanity check against a synthetic string)', () => {
    const synthetic = 'app.get("/x", async (req, res) => {\n  try {} catch (error: any) {\n    res.status(500).json({ error: error.message });\n  }\n});';
    const matches = synthetic.match(/res\.status\(500\)\.json\(\{ error: error\.message[ ,}]/g) || [];
    expect(matches.length).toBeGreaterThan(0);
  });
});
