import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { GEMINI_TEXT_MODEL, GEMINI_TTS_MODEL, GEMINI_LIVE_MODEL, CLAUDE_CHAT_MODEL } from './ai-model-registry';

describe('ai-model-registry', () => {
  it('exports one named constant per logical capability, all distinct strings', () => {
    const values = [GEMINI_TEXT_MODEL, GEMINI_TTS_MODEL, GEMINI_LIVE_MODEL, CLAUDE_CHAT_MODEL];
    expect(new Set(values).size).toBe(values.length);
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
