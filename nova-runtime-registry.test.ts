import { describe, it, expect } from 'vitest';
import { buildNovaRuntimeReport, resolveNovaChatProvider } from './nova-runtime-registry';
import { GEMINI_TEXT_MODEL, GEMINI_LIVE_MODEL, GEMINI_TTS_MODEL, CLAUDE_CHAT_MODEL } from './ai-model-registry';

const baseInput = { novaChatProviderEnv: undefined, geminiConfigured: true, vertexConfigured: false, claudeConfigured: false };

describe('buildNovaRuntimeReport', () => {
  it('defaults nova_text_chat to gemini when no provider override is set', () => {
    const report = buildNovaRuntimeReport(baseInput);
    const textChat = report.find((r) => r.surface === 'nova_text_chat')!;
    expect(textChat.activeProvider).toBe('gemini');
    expect(textChat.activeModel).toBe(GEMINI_TEXT_MODEL);
  });

  it('switches nova_text_chat to claude only when both the env var is set AND claude is actually configured', () => {
    const notConfigured = buildNovaRuntimeReport({ ...baseInput, novaChatProviderEnv: 'claude', claudeConfigured: false });
    expect(notConfigured.find((r) => r.surface === 'nova_text_chat')!.activeProvider).toBe('unavailable');

    const configured = buildNovaRuntimeReport({ ...baseInput, novaChatProviderEnv: 'claude', claudeConfigured: true });
    const textChat = configured.find((r) => r.surface === 'nova_text_chat')!;
    expect(textChat.activeProvider).toBe('claude');
    expect(textChat.activeModel).toBe(CLAUDE_CHAT_MODEL);
  });

  it('switches nova_text_chat to vertex only when both the env var is set AND vertex is actually configured', () => {
    const notConfigured = buildNovaRuntimeReport({ ...baseInput, novaChatProviderEnv: 'vertex', vertexConfigured: false });
    expect(notConfigured.find((r) => r.surface === 'nova_text_chat')!.activeProvider).toBe('unavailable');

    const configured = buildNovaRuntimeReport({ ...baseInput, novaChatProviderEnv: 'vertex', vertexConfigured: true });
    expect(configured.find((r) => r.surface === 'nova_text_chat')!.activeProvider).toBe('vertex');
  });

  it('reports nova_live_voice and nova_voice_tts as single-provider, always gemini', () => {
    const report = buildNovaRuntimeReport({ ...baseInput, novaChatProviderEnv: 'claude', claudeConfigured: true });
    expect(report.find((r) => r.surface === 'nova_live_voice')!.activeProvider).toBe('gemini');
    expect(report.find((r) => r.surface === 'nova_voice_tts')!.activeProvider).toBe('gemini');
  });

  it('every surface reports no prompt versioning', () => {
    for (const surface of buildNovaRuntimeReport(baseInput)) {
      expect(surface.promptVersioning).toBe('none');
    }
  });

  it('reports exactly the three real Nova surfaces, no more', () => {
    const report = buildNovaRuntimeReport(baseInput);
    expect(report.map((r) => r.surface).sort()).toEqual(['nova_live_voice', 'nova_text_chat', 'nova_voice_tts']);
  });
});

describe('Nova explicit-provider isolation', () => {
  it('defaults to Gemini but never treats an unavailable selection as Gemini', () => {
    expect(resolveNovaChatProvider(baseInput).activeProvider).toBe('gemini');
    expect(resolveNovaChatProvider({ ...baseInput, novaChatProviderEnv: 'gemini' }).activeProvider).toBe('gemini');
    for (const value of ['vertex', 'claude', 'unexpected-provider', 'Gemini', ' ']) {
      const input = { ...baseInput, novaChatProviderEnv: value };
      expect(resolveNovaChatProvider(input).activeProvider).toBeNull();
      expect(buildNovaRuntimeReport(input)[0]).toMatchObject({
        requestedProvider: value, activeProvider: 'unavailable', activeModel: 'unavailable', readiness: 'unavailable',
      });
    }
  });
  it('does not report the default as available without a Gemini key', () => {
    expect(resolveNovaChatProvider({ ...baseInput, geminiConfigured: false }).activeProvider).toBeNull();
  });
});

describe('Nova runtime model and voice-switch accuracy', () => {
  it('reports the exact model constants used by live call sites', () => {
    const [chat, live, tts] = buildNovaRuntimeReport(baseInput);
    expect(chat.activeModel).toBe(GEMINI_TEXT_MODEL);
    expect(live.activeModel).toBe(GEMINI_LIVE_MODEL);
    expect(tts.activeModel).toBe(GEMINI_TTS_MODEL);
    expect(chat.providerOptions.find(p => p.provider === 'vertex')?.model).toBe(GEMINI_TEXT_MODEL);
  });

  it('does not show disabled Live as active while leaving TTS available', () => {
    const [, live, tts] = buildNovaRuntimeReport({ ...baseInput, novaLiveVoiceEnabled: false });
    expect(live).toMatchObject({ activeProvider: 'unavailable', activeModel: 'unavailable', readiness: 'disabled' });
    expect(live.providerOptions[0].model).toBe(GEMINI_LIVE_MODEL);
    expect(tts).toMatchObject({ activeProvider: 'gemini', activeModel: GEMINI_TTS_MODEL, readiness: 'ready' });
  });

  it('does not label Live or TTS available without a Gemini credential', () => {
    for (const surface of buildNovaRuntimeReport({ ...baseInput, geminiConfigured: false })) {
      expect(surface).toMatchObject({ activeProvider: 'unavailable', activeModel: 'unavailable', readiness: 'unavailable' });
    }
  });

  it('keeps Live/TTS model identities independent of text Claude selection', () => {
    const [chat, live, tts] = buildNovaRuntimeReport({
      ...baseInput, novaChatProviderEnv: 'claude', claudeConfigured: true,
    });
    expect(chat.activeModel).toBe(CLAUDE_CHAT_MODEL);
    expect(live.activeModel).toBe(GEMINI_LIVE_MODEL);
    expect(tts.activeModel).toBe(GEMINI_TTS_MODEL);
  });
});
