import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { GEMINI_TEXT_MODEL, GEMINI_TTS_MODEL, GEMINI_LIVE_MODEL, CLAUDE_CHAT_MODEL, GEMINI_MODEL_STATUS, getSupportedThinkingLevels } from './ai-model-registry';

describe('ai-model-registry', () => {
  it('exports one named constant per logical capability, all distinct strings', () => {
    const values = [GEMINI_TEXT_MODEL, GEMINI_TTS_MODEL, GEMINI_LIVE_MODEL, CLAUDE_CHAT_MODEL];
    expect(new Set(values).size).toBe(values.length);
  });

  it('GEMINI_TEXT_MODEL defaults to gemini-3.5-flash when no override env var is set (Phase 6B.1 - behaviour preserved pending real verification)', () => {
    expect(GEMINI_TEXT_MODEL).toBe('gemini-3.5-flash');
  });
});

// PHASE 6B.1 FINAL CORRECTIONS (Priority 2/3) - "Distinguish
// historical/deprecated identifiers from supported evaluation
// candidates" + per-model thinking-level validation data.
describe('GEMINI_MODEL_STATUS / getSupportedThinkingLevels (final corrections)', () => {
  it('gemini-3.5-flash is recorded deprecated, but remains the configured default (no default flip without authorised testing)', () => {
    expect(GEMINI_MODEL_STATUS['gemini-3.5-flash'].status).toBe('deprecated');
    expect(GEMINI_TEXT_MODEL).toBe('gemini-3.5-flash');
  });

  it('gemini-3.6-flash is recorded as the supported replacement', () => {
    expect(GEMINI_MODEL_STATUS['gemini-3.6-flash'].status).toBe('supported_replacement');
  });

  it('gemini-3.8-flash is recorded as a supported evaluation candidate, not the configured default', () => {
    expect(GEMINI_MODEL_STATUS['gemini-3.8-flash'].status).toBe('supported_evaluation_candidate');
    expect(GEMINI_TEXT_MODEL).not.toBe('gemini-3.8-flash');
  });

  it('getSupportedThinkingLevels restricts gemini-3.8-flash to LOW/MEDIUM/HIGH, excluding MINIMAL', () => {
    const levels = getSupportedThinkingLevels('gemini-3.8-flash');
    expect(levels).toEqual(['LOW', 'MEDIUM', 'HIGH']);
    expect(levels).not.toContain('MINIMAL');
  });

  it('getSupportedThinkingLevels returns null (no restriction on record) for a model with no documented restriction', () => {
    expect(getSupportedThinkingLevels('gemini-3.5-flash')).toBeNull();
    expect(getSupportedThinkingLevels('gemini-3.6-flash')).toBeNull();
  });

  it('getSupportedThinkingLevels returns null for a model this registry knows nothing about at all', () => {
    expect(getSupportedThinkingLevels('not-a-real-model')).toBeNull();
  });
});

// PHASE 6B.1 (Priority 2) - GEMINI_TEXT_MODEL/GEMINI_LIVE_MODEL are
// computed once at module load from process.env, so exercising the
// override path requires a fresh module instance per scenario.
describe('ai-model-registry - PHASE 6B.1 configurable model override (Priority 2)', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it('GEMINI_TEXT_MODEL_OVERRIDE selects an allowlisted alternate model', async () => {
    vi.resetModules();
    process.env.GEMINI_TEXT_MODEL_OVERRIDE = 'gemini-3.6-flash';
    const fresh = await import('./ai-model-registry');
    expect(fresh.GEMINI_TEXT_MODEL).toBe('gemini-3.6-flash');
  });

  it('GEMINI_TEXT_MODEL_OVERRIDE with an unknown model id is ignored and falls back to the default, rather than being sent to the provider', async () => {
    vi.resetModules();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.GEMINI_TEXT_MODEL_OVERRIDE = 'gemini-9.9-not-a-real-model';
    const fresh = await import('./ai-model-registry');
    expect(fresh.GEMINI_TEXT_MODEL).toBe('gemini-3.5-flash');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('GEMINI_LIVE_MODEL_OVERRIDE with an unknown model id is ignored and falls back to the default', async () => {
    vi.resetModules();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.GEMINI_LIVE_MODEL_OVERRIDE = 'gemini-9.9-not-a-real-model';
    const fresh = await import('./ai-model-registry');
    expect(fresh.GEMINI_LIVE_MODEL).toBe('gemini-3.1-flash-live-preview');
    warnSpy.mockRestore();
  });

  // PHASE 6C (Priority 3) - gemini-3.8-live is now a selectable evaluation
  // candidate for the Live/voice path, same allowlist-override mechanism as
  // every other model here. Selectable does NOT mean active: the default
  // stays gemini-3.1-flash-live-preview until a real compatibility test is
  // authorised (see ai-model-registry.ts's own comment for exactly what is
  // and isn't confirmed about this specific migration).
  it('GEMINI_LIVE_MODEL_OVERRIDE selects gemini-3.8-live as an allowlisted evaluation candidate', async () => {
    vi.resetModules();
    process.env.GEMINI_LIVE_MODEL_OVERRIDE = 'gemini-3.8-live';
    const fresh = await import('./ai-model-registry');
    expect(fresh.GEMINI_LIVE_MODEL).toBe('gemini-3.8-live');
  });

  it('GEMINI_LIVE_MODEL defaults to gemini-3.1-flash-live-preview with no override set - gemini-3.8-live is not yet active', async () => {
    vi.resetModules();
    const fresh = await import('./ai-model-registry');
    expect(fresh.GEMINI_LIVE_MODEL).toBe('gemini-3.1-flash-live-preview');
  });
});

// GUARDRAIL: a raw Gemini/Claude model-version string literal anywhere in
// server.ts, outside of importing these constants, is exactly how this
// file's own problem started - 13 copies of "gemini-3.5-flash" that had
// already drifted into being untouchable as a single thing. This fails
// the build the moment a new AI-backed route reintroduces a literal
// instead of importing the shared constant.
// Matches the shape of every model string this codebase has used so far
// (gemini-<version>-<variant...>, claude-<family>-<version>) - broad
// enough to catch the next provider/version without needing an update,
// narrow enough not to flag unrelated string literals.
const MODEL_LITERAL_RE = /["'](gemini-[\w.-]+|claude-[\w.-]+)["']/g;

function findModelLiterals(src: string): string[] {
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = MODEL_LITERAL_RE.exec(src)) !== null) {
    found.add(m[1]);
  }
  return [...found];
}

describe('GUARDRAIL: server.ts never hardcodes a model version string', () => {
  it('sanity check: the scanner itself still detects a model-shaped literal', () => {
    expect(findModelLiterals('model: "gemini-9.9-test-preview"')).toEqual(['gemini-9.9-test-preview']);
    expect(findModelLiterals("model: 'claude-example-9'")).toEqual(['claude-example-9']);
  });

  it('server.ts has zero raw model-version string literals - every AI call site imports from this registry', () => {
    const src = readFileSync(resolve(process.cwd(), 'server.ts'), 'utf8');
    const found = findModelLiterals(src);
    expect(
      found,
      `Found model version string(s) hardcoded directly in server.ts: [${found.join(', ')}]. ` +
        `Add each to ai-model-registry.ts and import the constant instead of hardcoding the literal.`,
    ).toEqual([]);
  });

  it('every value this registry exports is actually imported and used in server.ts', () => {
    const src = readFileSync(resolve(process.cwd(), 'server.ts'), 'utf8');
    for (const [name, value] of Object.entries({ GEMINI_TEXT_MODEL, GEMINI_TTS_MODEL, GEMINI_LIVE_MODEL, CLAUDE_CHAT_MODEL })) {
      expect(src.includes(name), `${name} (${value}) is exported but never referenced in server.ts - a stale entry?`).toBe(true);
    }
  });
});
