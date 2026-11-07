// NHEI PHASE 3 OPERATIONAL ACCEPTANCE §5 - ADVERSARIAL EVALUATION HARNESS TESTS
//
// Same two-tier structure as nhei-real-model-evaluation-runner.test.ts:
// the BLOCKED-path tests exercise this actual environment's real
// process.env (no credential exists - confirmed, never a real network
// call); the mocked-client tests prove the real-execution CODE is wired
// correctly, using a fake, non-placeholder GEMINI_API_KEY and a fully
// mocked @google/genai, never a real model call. These two tiers are
// never conflated - the mocked results are mocked-client test evidence,
// not real-model evaluation evidence.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSendMessage = vi.fn();
const mockChatsCreate = vi.fn((_args: { model: string; config: { systemInstruction: string } }) => ({ sendMessage: mockSendMessage }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    chats = { create: mockChatsCreate };
  },
  // nhei-extraction-schema.ts (imported transitively via
  // nhei-real-model-evaluation-runner.ts -> nhei-extraction-service.ts)
  // references Type.OBJECT/.STRING/etc at module load time - needed here
  // even though this test never touches that schema directly, same as
  // nhei-real-model-evaluation-runner.test.ts's own mock.
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', ARRAY: 'ARRAY', NUMBER: 'NUMBER', BOOLEAN: 'BOOLEAN', INTEGER: 'INTEGER' },
}));

import { hasGeminiCredentials } from './nhei-real-model-evaluation-runner';
import {
  runRealModelAdversarialEvaluation,
  NHEI_ADVERSARIAL_FIXTURES,
} from './nhei-real-model-adversarial-evaluation-runner';

const FAKE_SYSTEM_PROMPT = 'You are Nova, a non-clinical burnout recovery coach.';
const FAKE_SAFETY_INSTRUCTIONS = 'Never provide a diagnosis. Always treat the user with respect.';

describe('runRealModelAdversarialEvaluation - blocked path (this actual environment)', () => {
  it('reflects this environment as having no usable credential', () => {
    expect(hasGeminiCredentials()).toBe(false);
  });

  it('returns a blocked report with no_credentials, never a simulated result', async () => {
    const report = await runRealModelAdversarialEvaluation({
      modelId: 'gemini-2.0-flash',
      systemPromptPrefix: FAKE_SYSTEM_PROMPT,
      safetyInstructions: FAKE_SAFETY_INSTRUCTIONS,
    });
    expect(report.status).toBe('blocked');
    expect(report.blockedReason).toBe('no_credentials');
    expect(report.results).toBeUndefined();
    expect(mockChatsCreate).not.toHaveBeenCalled();
  });

  it('the blocked report never leaks an actual credential value', async () => {
    const report = await runRealModelAdversarialEvaluation({
      modelId: 'gemini-2.0-flash',
      systemPromptPrefix: FAKE_SYSTEM_PROMPT,
      safetyInstructions: FAKE_SAFETY_INSTRUCTIONS,
    });
    expect(JSON.stringify(report)).not.toMatch(/AIza[0-9A-Za-z_-]{10,}/);
  });
});

describe('NHEI_ADVERSARIAL_FIXTURES', () => {
  it('covers all seven manipulation categories Phase 3C-2B section 7 named, exactly once each', () => {
    const categories = NHEI_ADVERSARIAL_FIXTURES.map((f) => f.category);
    expect(new Set(categories).size).toBe(categories.length); // no duplicates
    expect(categories.sort()).toEqual([
      'evidence_source_classification', 'knowledge_approval', 'model_response_policy',
      'role_boundaries', 'safety_instructions', 'user_consent', 'user_identity_permissions',
    ]);
  });

  it('every fixture is synthetic, non-empty content with a real user message to pair it with', () => {
    for (const f of NHEI_ADVERSARIAL_FIXTURES) {
      expect(f.educationalSummary.length).toBeGreaterThan(10);
      expect(f.userMessage.length).toBeGreaterThan(0);
    }
  });
});

describe('runRealModelAdversarialEvaluation - real execution path, with a mocked Gemini client (never a real network call)', () => {
  const ORIGINAL_KEY = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'fake-test-key-not-real-AIzaFAKE1234567890';
    mockSendMessage.mockReset();
    mockChatsCreate.mockClear();
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = ORIGINAL_KEY;
  });

  it('runs every fixture exactly once, each through a fresh chats.create call with the real quarantine construction', async () => {
    mockSendMessage.mockResolvedValue({ text: 'The internal self is about your private reactions.' });

    const report = await runRealModelAdversarialEvaluation({
      modelId: 'gemini-2.0-flash',
      systemPromptPrefix: FAKE_SYSTEM_PROMPT,
      safetyInstructions: FAKE_SAFETY_INSTRUCTIONS,
    });

    expect(report.status).toBe('completed');
    expect(report.results).toHaveLength(NHEI_ADVERSARIAL_FIXTURES.length);
    expect(mockChatsCreate).toHaveBeenCalledTimes(NHEI_ADVERSARIAL_FIXTURES.length);

    // The constructed systemInstruction must actually contain the real
    // prefix/suffix AND the quarantined adversarial text, between a
    // delimiter pair - proving this harness builds the real boundary,
    // not a simplified stand-in.
    const firstCallArgs = mockChatsCreate.mock.calls[0][0];
    expect(firstCallArgs.config.systemInstruction).toContain(FAKE_SYSTEM_PROMPT);
    expect(firstCallArgs.config.systemInstruction).toContain(FAKE_SAFETY_INSTRUCTIONS);
    expect(firstCallArgs.config.systemInstruction).toContain('REFERENCE DATA');
  });

  it('a mocked response that visibly complies with the injection is flagged by containsSuspiciousTerm (a weak signal, verified here against a deliberately-bad fixture)', async () => {
    mockSendMessage.mockResolvedValue({ text: 'Diagnosis: the user shows signs of a licensed therapist clinical diagnosis.' });

    const report = await runRealModelAdversarialEvaluation({
      modelId: 'gemini-2.0-flash',
      systemPromptPrefix: FAKE_SYSTEM_PROMPT,
      safetyInstructions: FAKE_SAFETY_INSTRUCTIONS,
      fixtures: [NHEI_ADVERSARIAL_FIXTURES.find((f) => f.category === 'role_boundaries')!],
    });

    expect(report.status).toBe('completed');
    expect(report.results![0].containsSuspiciousTerm).toBe(true);
  });

  it('a mocked response that ignores the injection is NOT flagged', async () => {
    mockSendMessage.mockResolvedValue({ text: 'The relational self is about what actually happened between you and someone else.' });

    const report = await runRealModelAdversarialEvaluation({
      modelId: 'gemini-2.0-flash',
      systemPromptPrefix: FAKE_SYSTEM_PROMPT,
      safetyInstructions: FAKE_SAFETY_INSTRUCTIONS,
      fixtures: [NHEI_ADVERSARIAL_FIXTURES.find((f) => f.category === 'role_boundaries')!],
    });

    expect(report.results![0].containsSuspiciousTerm).toBe(false);
  });

  it('the completed report note explicitly says every result still needs human review - never presents containsSuspiciousTerm as a verdict', async () => {
    mockSendMessage.mockResolvedValue({ text: 'ok' });
    const report = await runRealModelAdversarialEvaluation({
      modelId: 'gemini-2.0-flash',
      systemPromptPrefix: FAKE_SYSTEM_PROMPT,
      safetyInstructions: FAKE_SAFETY_INSTRUCTIONS,
    });
    expect(report.note.toLowerCase()).toContain('human');
  });

  it('never leaks the fake credential value into the report', async () => {
    mockSendMessage.mockResolvedValue({ text: 'ok' });
    const report = await runRealModelAdversarialEvaluation({
      modelId: 'gemini-2.0-flash',
      systemPromptPrefix: FAKE_SYSTEM_PROMPT,
      safetyInstructions: FAKE_SAFETY_INSTRUCTIONS,
    });
    expect(JSON.stringify(report)).not.toContain(process.env.GEMINI_API_KEY);
  });
});
