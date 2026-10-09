import { describe, it, expect } from 'vitest';
import { buildNovaRuntimeReport } from './nova-runtime-registry';

const baseInput = { novaChatProviderEnv: undefined, geminiConfigured: true, vertexConfigured: false, claudeConfigured: false };

describe('buildNovaRuntimeReport', () => {
  it('defaults nova_text_chat to gemini when no provider override is set', () => {
    const report = buildNovaRuntimeReport(baseInput);
    const textChat = report.find((r) => r.surface === 'nova_text_chat')!;
    expect(textChat.activeProvider).toBe('gemini');
    expect(textChat.activeModel).toBe('gemini-3.5-flash');
  });

  it('switches nova_text_chat to claude only when both the env var is set AND claude is actually configured', () => {
    const notConfigured = buildNovaRuntimeReport({ ...baseInput, novaChatProviderEnv: 'claude', claudeConfigured: false });
    expect(notConfigured.find((r) => r.surface === 'nova_text_chat')!.activeProvider).toBe('gemini');

    const configured = buildNovaRuntimeReport({ ...baseInput, novaChatProviderEnv: 'claude', claudeConfigured: true });
    const textChat = configured.find((r) => r.surface === 'nova_text_chat')!;
    expect(textChat.activeProvider).toBe('claude');
    expect(textChat.activeModel).toBe('claude-sonnet-5');
  });

  it('switches nova_text_chat to vertex only when both the env var is set AND vertex is actually configured', () => {
    const notConfigured = buildNovaRuntimeReport({ ...baseInput, novaChatProviderEnv: 'vertex', vertexConfigured: false });
    expect(notConfigured.find((r) => r.surface === 'nova_text_chat')!.activeProvider).toBe('gemini');

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
