import { describe, expect, it, vi } from 'vitest';

vi.mock('./firebase', () => ({
  auth: { currentUser: { uid: 'account-A' } },
}));

import { canPersistNovaChatState, novaStorageKey } from './nova-chat-storage';

describe('Nova chat autosave ownership', () => {
  it('saves the loaded account only after the correct auth identity is active', () => {
    expect(canPersistNovaChatState('A', 'A', 'A')).toBe(true);
    expect(canPersistNovaChatState('A', 'B', 'B')).toBe(false);
    expect(canPersistNovaChatState('A', 'A', 'B')).toBe(false);
    expect(canPersistNovaChatState('B', 'B', null)).toBe(false);
    expect(canPersistNovaChatState('__pending__', '__pending__', null)).toBe(false);
  });

  it('cannot accidentally write account A history under B storage keys', () => {
    const a = novaStorageKey('nova_chat_history', 'A');
    const b = novaStorageKey('nova_chat_history', 'B');
    expect(a).not.toBe(b);
    expect(canPersistNovaChatState('A', 'B', 'B')).toBe(false);
  });

  it('protects the voice preference in exactly the same way', () => {
    expect(canPersistNovaChatState('A', 'B', 'B')).toBe(false);
    expect(novaStorageKey('nova_voice_enabled', 'A')).not.toBe(novaStorageKey('nova_voice_enabled', 'B'));
  });
});
